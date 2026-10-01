"""Worker pipeline tests with real ffmpeg and a stand-in separator. Run: cd worker && .venv/bin/python -m unittest"""

from __future__ import annotations

import dataclasses
import os
import shutil
import tempfile
import time
import unittest
import uuid
from pathlib import Path

import numpy as np

from studyloop_music import audio, db
from studyloop_music.__main__ import run_one, sweep_tmp
from studyloop_music.config import load_config, load_pipeline
from studyloop_music.errors import PipelineError

from tests import fixtures

WORKER = "test-worker"


class FakeSeparator:
    """Splits the mix into fixed fractions so the pipeline can be tested without the model."""

    def __init__(self, fail: PipelineError | None = None, during=None):
        self.model = object()
        self.device = self.last_device = "cpu"
        self.fail = fail
        self.during = during
        self.calls = 0

    def load(self):
        pass

    def separate(self, mix, on_progress, deadline):
        self.calls += 1
        on_progress(0.5)
        if self.during:
            self.during()
        if self.fail:
            raise self.fail
        on_progress(1.0)
        return {"vocals": mix * 0.4, "drums": mix * 0.3, "bass": mix * 0.2, "other": mix * 0.1}


class PipelineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture_dir = Path(tempfile.mkdtemp(prefix="sl-fixture-"))
        cls.mix_path, _ = fixtures.mix_file(cls.fixture_dir / "mix.mp3", seconds=6)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.fixture_dir, ignore_errors=True)

    def setUp(self):
        self.data = Path(tempfile.mkdtemp(prefix="sl-data-"))
        self.cfg = dataclasses.replace(load_config(), data_dir=self.data, max_attempts=2)
        self.cfg.tmp_dir.mkdir(parents=True)
        self.conn = db.connect(self.cfg.db_path)
        self.pipeline = load_pipeline()

    def tearDown(self):
        self.conn.close()
        shutil.rmtree(self.data, ignore_errors=True)

    def add_job(self, source_bytes: bytes | None = None) -> str:
        sid, jid = uuid.uuid4().hex, uuid.uuid4().hex
        (self.data / "sources").mkdir(exist_ok=True)
        dest = self.data / "sources" / f"{sid}.mp3"
        if source_bytes is None:
            shutil.copy(self.mix_path, dest)
        else:
            dest.write_bytes(source_bytes)
        t = db.now_ms()
        self.conn.execute(
            "INSERT INTO music_sources VALUES (?, 'u1', ?, ?, 'audio/mpeg', 'mp3', 'mp3', 44100, 2, 6, ?, ?)",
            (sid, uuid.uuid4().hex, f"sources/{sid}.mp3", dest.stat().st_size, t),
        )
        self.conn.execute(
            """INSERT INTO music_jobs (id, user_id, source_id, cache_key, model, model_version, params_json,
                 status, created_at) VALUES (?, 'u1', ?, ?, 'htdemucs', 'v', '{}', 'queued', ?)""",
            (jid, sid, uuid.uuid4().hex, t),
        )
        return jid

    def job(self, jid):
        return self.conn.execute("SELECT * FROM music_jobs WHERE id = ?", (jid,)).fetchone()

    def run_job(self, sep, cfg=None):
        return run_one(cfg or self.cfg, self.conn, sep, self.pipeline, WORKER)

    def assert_no_scratch(self):
        self.assertEqual(list(self.cfg.tmp_dir.iterdir()), [])

    def test_completes_and_stores_playable_versions(self):
        jid = self.add_job()
        self.assertTrue(self.run_job(FakeSeparator()))
        j = self.job(jid)
        self.assertEqual(j["status"], "completed", j["error_message"])
        self.assertEqual(j["progress"], 1)
        self.assertEqual(j["device"], "cpu")
        outs = {(o["kind"], o["name"]): o for o in self.conn.execute(
            "SELECT * FROM music_outputs WHERE job_id = ?", (jid,))}
        self.assertEqual(
            set(outs),
            {("stem", s) for s in ("vocals", "drums", "bass", "other")}
            | {("version", v) for v in ("original", "no_lyrics", "vocals_only", "beats_only")},
        )
        # Single-stem versions point at the stem file rather than duplicating it.
        self.assertEqual(outs[("version", "vocals_only")]["file_path"], outs[("stem", "vocals")]["file_path"])
        self.assertEqual(outs[("version", "beats_only")]["file_path"], outs[("stem", "drums")]["file_path"])
        for o in outs.values():
            path = self.data / o["file_path"]
            info = audio.probe(path)
            self.assertEqual((info["codec"], info["sample_rate"], info["channels"]), ("aac", 44100, 2))
            self.assertAlmostEqual(info["duration_s"], 6.0, delta=0.25)
            self.assertGreater(o["rms_dbfs"], -60, o["name"])  # not silence
            decoded = audio.decode(path, 44100, 2)
            self.assertTrue(np.isfinite(decoded).all())
        self.assert_no_scratch()

    def test_corrupted_audio_fails_cleanly(self):
        jid = self.add_job(source_bytes=os.urandom(64 * 1024))
        self.run_job(FakeSeparator())
        j = self.job(jid)
        self.assertEqual((j["status"], j["error_code"]), ("failed", "corrupted_audio"))
        self.assertNotIn("/", j["error_message"])  # user-facing text, no paths
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM music_outputs").fetchone()[0], 0)
        self.assertFalse((self.data / "outputs" / jid).exists())
        self.assert_no_scratch()

    def test_missing_source(self):
        jid = self.add_job()
        for f in (self.data / "sources").iterdir():
            f.unlink()
        self.run_job(FakeSeparator())
        self.assertEqual(self.job(jid)["error_code"], "source_missing")

    def test_low_disk_is_retried_then_failed(self):
        jid = self.add_job()
        cfg = dataclasses.replace(self.cfg, min_free_bytes=1 << 62)
        self.run_job(FakeSeparator(), cfg)
        self.assertEqual((self.job(jid)["status"], self.job(jid)["error_code"]), ("queued", "disk_full"))
        self.run_job(FakeSeparator(), cfg)
        self.assertEqual((self.job(jid)["status"], self.job(jid)["attempts"]), ("failed", 2))

    def test_separation_failure(self):
        jid = self.add_job()
        self.run_job(FakeSeparator(fail=PipelineError("separation_failed", "boom")))
        j = self.job(jid)
        self.assertEqual((j["status"], j["error_code"]), ("failed", "separation_failed"))
        self.assertNotIn("boom", j["error_message"])
        self.assert_no_scratch()

    def test_model_load_failure_is_retryable(self):
        jid = self.add_job()
        self.run_job(FakeSeparator(fail=PipelineError("model_unavailable", "no weights", retryable=True)))
        self.assertEqual(self.job(jid)["status"], "queued")

    def test_timeout(self):
        jid = self.add_job()
        self.run_job(FakeSeparator(), dataclasses.replace(self.cfg, job_timeout_s=0))
        self.assertEqual(self.job(jid)["error_code"], "timeout")
        self.assert_no_scratch()

    def test_unexpected_exception_is_internal(self):
        jid = self.add_job()
        self.run_job(FakeSeparator(fail=RuntimeError("/secret/path exploded")))
        j = self.job(jid)
        self.assertEqual(j["error_code"], "internal")
        self.assertNotIn("secret", j["error_message"])

    def test_job_taken_over_mid_run_is_not_completed(self):
        jid = self.add_job()
        steal = lambda: self.conn.execute("UPDATE music_jobs SET worker_id = 'other' WHERE id = ?", (jid,))
        self.run_job(FakeSeparator(during=steal))
        self.assertNotEqual(self.job(jid)["status"], "completed")
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM music_outputs").fetchone()[0], 0)

    def test_stale_jobs_are_requeued_then_failed(self):
        jid = self.add_job()
        old = db.now_ms() - 10 * 60_000
        self.conn.execute(
            "UPDATE music_jobs SET status = 'processing', attempts = 1, worker_id = 'dead', heartbeat_at = ? WHERE id = ?",
            (old, jid))
        self.assertEqual(db.recover_stale(self.conn, 120, 2, "x"), [(jid, "requeued")])
        self.conn.execute(
            "UPDATE music_jobs SET status = 'processing', attempts = 2, worker_id = 'dead', heartbeat_at = ? WHERE id = ?",
            (old, jid))
        self.assertEqual(db.recover_stale(self.conn, 120, 2, "x"), [(jid, "failed")])
        self.assertEqual(self.job(jid)["error_code"], "worker_crashed")

    def test_only_one_worker_claims_a_job(self):
        self.add_job()
        other = db.connect(self.cfg.db_path)
        try:
            self.assertIsNotNone(db.claim_next(self.conn, "a"))
            self.assertIsNone(db.claim_next(other, "b"))
        finally:
            other.close()

    def test_sweep_removes_only_old_scratch(self):
        old, new = self.cfg.tmp_dir / "upload-old.part", self.cfg.tmp_dir / "job-new"
        old.write_bytes(b"x")
        new.mkdir()
        past = time.time() - 7200
        os.utime(old, (past, past))
        self.assertEqual(sweep_tmp(self.cfg.tmp_dir), 1)
        self.assertEqual([p.name for p in self.cfg.tmp_dir.iterdir()], ["job-new"])


if __name__ == "__main__":
    unittest.main()
