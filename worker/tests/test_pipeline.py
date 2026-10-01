"""Worker pipeline tests: real ffmpeg, real HTTP to a fake StudyLoop, stand-in separator.

Run: cd worker && .venv/bin/python -m unittest discover -s tests -t .
"""

from __future__ import annotations

import dataclasses
import os
import shutil
import tempfile
import time
import unittest
from pathlib import Path

import numpy as np

from studyloop_music import audio
from studyloop_music.__main__ import run_one, sweep_tmp
from studyloop_music.api import ApiUnavailable, WorkerApi
from studyloop_music.config import load_config, load_pipeline
from studyloop_music.errors import PipelineError

from tests import fixtures
from tests.fake_server import TOKEN, FakeStudyLoop

WORKER = "test-worker:1"


class FakeSeparator:
    """Splits the mix into fixed fractions so the pipeline can be tested without the model."""

    def __init__(self, fail: BaseException | None = None, during=None):
        self.model = object()
        self.device = self.last_device = "cpu"
        self.fail = fail
        self.during = during

    def load(self):
        pass

    def separate(self, mix, on_progress, deadline):
        on_progress(0.5)
        if self.during:
            self.during()
            on_progress(0.9)
        if self.fail:
            raise self.fail
        on_progress(1.0)
        return {"vocals": mix * 0.4, "drums": mix * 0.3, "bass": mix * 0.2, "other": mix * 0.1}


class PipelineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture_dir = Path(tempfile.mkdtemp(prefix="sl-fixture-"))
        cls.mix_bytes = fixtures.mix_file(cls.fixture_dir / "mix.mp3", seconds=6)[0].read_bytes()

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.fixture_dir, ignore_errors=True)

    def setUp(self):
        self.fake = FakeStudyLoop()
        self.work = Path(tempfile.mkdtemp(prefix="sl-work-"))
        self.cfg = dataclasses.replace(load_config(), api_url=self.fake.url, worker_token=TOKEN, work_dir=self.work)
        self.api = WorkerApi(self.fake.url, TOKEN, WORKER)
        self.pipeline = load_pipeline()

    def tearDown(self):
        self.fake.close()
        shutil.rmtree(self.work, ignore_errors=True)

    def run_job(self, sep, cfg=None):
        return run_one(cfg or self.cfg, self.api, sep, self.pipeline)

    def assert_no_scratch(self):
        self.assertEqual(list(self.work.iterdir()), [])

    def test_completes_and_uploads_playable_versions(self):
        self.fake.add_job("j1", self.mix_bytes)
        self.assertTrue(self.run_job(FakeSeparator()))
        self.assertEqual(self.fake.jobs["j1"]["status"], "completed", self.fake.failures.get("j1"))
        report = self.fake.completed["j1"]
        self.assertEqual(report["device"], "cpu")
        self.assertAlmostEqual(report["sourceDurationS"], 6.0, delta=0.1)
        self.assertEqual({o["file"] for o in report["outputs"]}, {"original", "no_lyrics", "vocals", "drums", "bass", "other"})
        for o in report["outputs"]:
            data, ctype = self.fake.blobs[f"outputs/j1/{o['file']}.m4a"]
            self.assertEqual(ctype, "audio/mp4")
            path = self.work / "check.m4a"
            path.write_bytes(data)
            info = audio.probe(path)
            self.assertEqual((info["codec"], info["sample_rate"], info["channels"]), ("aac", 44100, 2))
            self.assertAlmostEqual(info["duration_s"], 6.0, delta=0.25)
            self.assertGreater(o["rmsDbfs"], -60, o["file"])
            self.assertTrue(np.isfinite(audio.decode(path, 44100, 2)).all())
            path.unlink()
        # Real progress went out, then the finalizing stage.
        progress = [h["progress"] for h in self.fake.heartbeats if h.get("progress") is not None]
        self.assertEqual((progress[0], progress[-1]), (0.0, 1.0))
        self.assertEqual(self.fake.heartbeats[-1]["status"], "finalizing")
        self.assert_no_scratch()

    def test_empty_queue(self):
        self.assertFalse(self.run_job(FakeSeparator()))

    def test_corrupted_audio_fails_cleanly(self):
        self.fake.add_job("j1", os.urandom(64 * 1024))
        self.run_job(FakeSeparator())
        f = self.fake.failures["j1"]
        self.assertEqual((f["code"], f["retryable"]), ("corrupted_audio", False))
        self.assertNotIn("/", f["message"])  # user-facing text, no paths
        self.assertFalse(any(k.startswith("outputs/") for k in self.fake.blobs))
        self.assert_no_scratch()

    def test_missing_source(self):
        self.fake.add_job("j1", None)
        self.run_job(FakeSeparator())
        self.assertEqual(self.fake.failures["j1"]["code"], "source_missing")

    def test_too_long(self):
        self.fake.add_job("j1", self.mix_bytes, max_duration_s=3)
        self.run_job(FakeSeparator())
        f = self.fake.failures["j1"]
        self.assertEqual(f["code"], "too_long")
        self.assertIn("0 minutes", f["message"])

    def test_low_disk_is_retried_then_failed(self):
        self.fake.add_job("j1", self.mix_bytes)
        cfg = dataclasses.replace(self.cfg, min_free_bytes=1 << 62)
        self.run_job(FakeSeparator(), cfg)
        self.assertEqual((self.fake.jobs["j1"]["status"], self.fake.failures["j1"]["code"]), ("queued", "disk_full"))
        self.run_job(FakeSeparator(), cfg)
        self.assertEqual((self.fake.jobs["j1"]["status"], self.fake.jobs["j1"]["attempts"]), ("failed", 2))

    def test_separation_failure(self):
        self.fake.add_job("j1", self.mix_bytes)
        self.run_job(FakeSeparator(fail=PipelineError("separation_failed", "boom")))
        f = self.fake.failures["j1"]
        self.assertEqual(f["code"], "separation_failed")
        self.assertNotIn("boom", f["message"])
        self.assert_no_scratch()

    def test_model_load_failure_is_retryable(self):
        self.fake.add_job("j1", self.mix_bytes)
        self.run_job(FakeSeparator(fail=PipelineError("model_unavailable", "no weights", retryable=True)))
        self.assertEqual(self.fake.jobs["j1"]["status"], "queued")

    def test_timeout(self):
        self.fake.add_job("j1", self.mix_bytes)
        self.run_job(FakeSeparator(), dataclasses.replace(self.cfg, job_timeout_s=0))
        self.assertEqual(self.fake.failures["j1"]["code"], "timeout")
        self.assert_no_scratch()

    def test_unexpected_exception_is_internal(self):
        self.fake.add_job("j1", self.mix_bytes)
        self.run_job(FakeSeparator(fail=RuntimeError("/secret/path exploded")))
        f = self.fake.failures["j1"]
        self.assertEqual(f["code"], "internal")
        self.assertNotIn("secret", f["message"])

    def test_job_taken_back_mid_run_is_abandoned(self):
        self.fake.add_job("j1", self.mix_bytes)
        self.fake.steal_after_heartbeats = 1  # the server recovers the job after the first beat
        self.run_job(FakeSeparator(during=lambda: time.sleep(1.6)))
        self.assertNotIn("j1", self.fake.completed)
        self.assertNotIn("j1", self.fake.failures)  # nothing to report: it isn't ours anymore
        self.assertFalse(any(k.startswith("outputs/") for k in self.fake.blobs))
        self.assert_no_scratch()

    def test_bad_token_and_unreachable_api(self):
        with self.assertRaises(ApiUnavailable):
            WorkerApi(self.fake.url, "wrong", WORKER).claim("cpu")
        with self.assertRaises(ApiUnavailable):
            WorkerApi("http://127.0.0.1:9", TOKEN, WORKER, timeout=2).claim("cpu")

    def test_sweep_removes_only_old_scratch(self):
        old, new = self.work / "job-old", self.work / "job-new"
        old.mkdir()
        new.mkdir()
        past = time.time() - 7200
        os.utime(old, (past, past))
        self.assertEqual(sweep_tmp(self.work), 1)
        self.assertEqual([p.name for p in self.work.iterdir()], ["job-new"])


if __name__ == "__main__":
    unittest.main()
