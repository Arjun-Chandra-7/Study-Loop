"""One job, end to end: decode → separate → validate → derive study versions → encode → store."""

from __future__ import annotations

import os
import shutil
import sqlite3
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

from . import audio, db
from .config import Config, log
from .errors import PipelineError
from .separate import STEMS

# Study versions → how they're built from stems. Versions that are a single stem reuse its file.
VERSIONS = {
    "original": None,  # the decoded source, re-encoded so every version is sample-aligned
    "no_lyrics": ("drums", "bass", "other"),
    "vocals_only": ("vocals",),
    "beats_only": ("drums",),
}
SILENCE_DBFS = -60.0


def inside(base: Path, rel: str) -> Path:
    """Resolve a stored relative path and refuse anything that escapes the data dir."""
    p = (base / rel).resolve()
    if base.resolve() not in p.parents:
        raise PipelineError("source_missing", "path escapes data dir")
    return p


def validate_stems(mix: np.ndarray, stems: dict[str, np.ndarray]) -> dict:
    for name in STEMS:
        s = stems.get(name)
        if s is None or s.shape != mix.shape:
            raise PipelineError("separation_failed", f"stem {name} missing or wrong shape")
        if not np.isfinite(s).all():
            raise PipelineError("separation_failed", f"stem {name} has non-finite samples")
    # Demucs stems should add back up to the mix; a large residual means the output is garbage.
    residual = audio.rms_dbfs(sum(stems.values()) - mix)
    mix_db = audio.rms_dbfs(mix)
    if mix_db > SILENCE_DBFS and residual > mix_db - 10:
        raise PipelineError("separation_failed", f"stems don't reconstruct the mix ({residual} vs {mix_db} dBFS)")
    return {"reconstruction_residual_dbfs": residual, "mix_dbfs": mix_db}


class Heartbeat:
    """Keeps the job's heartbeat fresh from a side thread while the main thread is busy."""

    def __init__(self, cfg: Config, job_id: str, worker_id: str, interval: float = 10):
        self.cfg, self.job_id, self.worker_id, self.interval = cfg, job_id, worker_id, interval
        self.lost = False
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def _run(self):
        conn = db.connect(self.cfg.db_path)
        try:
            while not self._stop.wait(self.interval):
                db.beat_worker(conn, self.worker_id, None)
                if not db.touch(conn, self.job_id, self.worker_id):
                    self.lost = True
                    return
        finally:
            conn.close()

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *exc):
        self._stop.set()
        self._thread.join(timeout=5)


def process_job(cfg: Config, conn: sqlite3.Connection, separator, job: sqlite3.Row, pipeline: dict, worker_id: str) -> None:
    job_id = job["id"]
    params = pipeline["params"]
    sr, ch = params["sampleRate"], params["channels"]
    t_start = time.monotonic()
    deadline = t_start + cfg.job_timeout_s
    timings: dict[str, float] = {}
    work = cfg.tmp_dir / f"job-{job_id}"
    final_rel = Path("outputs") / job_id
    final_dir = cfg.data_dir / final_rel

    def lap(name: str, since: float) -> float:
        timings[name] = round(time.monotonic() - since, 2)
        return time.monotonic()

    def ensure_owned(**fields):
        if not db.touch(conn, job_id, worker_id, **fields):
            raise PipelineError("worker_crashed", "job ownership lost (recovered by another worker)")

    try:
        if shutil.disk_usage(cfg.data_dir).free < cfg.min_free_bytes:
            raise PipelineError("disk_full", "below MUSIC_MIN_FREE_MB", retryable=True)
        src = inside(cfg.data_dir, job["source_path"])
        if not src.is_file():
            raise PipelineError("source_missing", "source file not found")
        work.mkdir(parents=True, exist_ok=True)

        with Heartbeat(cfg, job_id, worker_id) as hb:
            t = time.monotonic()
            mix = audio.decode(src, sr, ch)
            t = lap("decode_s", t)

            if separator.model is None:
                ensure_owned(progress=None)
                separator.load()
                t = lap("model_load_s", t)
            ensure_owned(device=separator.device, progress=0.0)

            last_write = [0.0]

            def on_progress(frac: float):
                if hb.lost:
                    raise PipelineError("worker_crashed", "job ownership lost mid-separation")
                if time.monotonic() - last_write[0] >= 1.0 or frac >= 1.0:
                    last_write[0] = time.monotonic()
                    db.touch(conn, job_id, worker_id, progress=round(min(frac, 1.0), 4))

            log("separation_started", job_id=job_id, device=separator.device, audio_s=round(mix.shape[1] / sr, 2))
            stems = separator.separate(mix, on_progress, deadline)
            t = lap("separate_s", t)
            checks = validate_stems(mix, stems)

            ensure_owned(status="finalizing", progress=None)
            signals = {"original": mix, **stems, "no_lyrics": audio.peak_safe(sum(stems[s] for s in VERSIONS["no_lyrics"]))}
            files = {"original": "original.m4a", **{s: f"{s}.m4a" for s in STEMS}, "no_lyrics": "no_lyrics.m4a"}

            def encode_one(name: str):
                if time.monotonic() > deadline:
                    raise PipelineError("timeout", "encoding exceeded job timeout")
                audio.encode(audio.peak_safe(signals[name]), work / files[name], sr, params["codec"], params["bitrate"])
                info = audio.probe(work / files[name])
                if abs(info["duration_s"] - mix.shape[1] / sr) > 0.25:
                    raise PipelineError("ffmpeg_failed", f"{name}: duration {info['duration_s']} != source")
                return name, info

            with ThreadPoolExecutor(max_workers=3) as pool:
                probed = dict(pool.map(encode_one, files))
            t = lap("encode_s", t)
            if hb.lost:
                raise PipelineError("worker_crashed", "job ownership lost while encoding")

        # Persist: move the finished files into place in one rename, then record them.
        try:
            final_dir.parent.mkdir(parents=True, exist_ok=True)
            if final_dir.exists():
                shutil.rmtree(final_dir)
            os.replace(work, final_dir)
        except OSError as e:
            raise PipelineError("storage_failed", f"{type(e).__name__}") from e

        def row(kind: str, name: str, source: str) -> dict:
            info = probed[source]
            return {
                "kind": kind, "name": name, "file_path": str(final_rel / files[source]), "format": "m4a",
                "codec": info["codec"], "duration_s": info["duration_s"], "sample_rate": info["sample_rate"],
                "channels": info["channels"], "size_bytes": (final_dir / files[source]).stat().st_size,
                "rms_dbfs": audio.rms_dbfs(signals[source]),
            }

        outputs = [row("stem", s, s) for s in STEMS]
        outputs += [row("version", "original", "original"), row("version", "no_lyrics", "no_lyrics")]
        outputs += [row("version", v, VERSIONS[v][0]) for v in ("vocals_only", "beats_only")]
        timings["total_s"] = round(time.monotonic() - t_start, 2)
        storage = sum(o["size_bytes"] for o in outputs if o["kind"] == "stem") + sum(
            (final_dir / files[n]).stat().st_size for n in ("original", "no_lyrics"))
        if not db.complete(conn, job_id, worker_id, outputs, timings, separator.last_device):
            raise PipelineError("worker_crashed", "job ownership lost before completion")
        log("job_completed", job_id=job_id, device=separator.last_device, timings=timings, storage_bytes=storage,
            **checks, levels={o["name"]: o["rms_dbfs"] for o in outputs if o["kind"] == "stem"})
    except BaseException:
        if not _completed(conn, job_id):
            shutil.rmtree(final_dir, ignore_errors=True)
        raise
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _completed(conn: sqlite3.Connection, job_id: str) -> bool:
    r = conn.execute("SELECT status FROM music_jobs WHERE id = ?", (job_id,)).fetchone()
    return bool(r and r["status"] == "completed")
