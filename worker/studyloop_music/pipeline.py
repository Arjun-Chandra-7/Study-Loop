"""One job, end to end: download → decode → separate → validate → derive study versions → encode → upload."""

from __future__ import annotations

import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

from . import audio
from .api import LostJob, WorkerApi, download, free_bytes, upload
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
#: The six files uploaded per job (vocals_only/beats_only are the vocals/drums files).
OUTPUT_FILES = ("original", "no_lyrics", *STEMS)
SILENCE_DBFS = -60.0


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
    """
    Reports status/progress to the API from a side thread every few seconds (and right away when
    asked), so a long model run never looks like a crash. Flags `lost` if the server took the job back.
    """

    def __init__(self, api: WorkerApi, job_id: str, device: str | None, interval: float = 10):
        self.api, self.job_id, self.interval = api, job_id, interval
        self.state = {"status": "processing", "progress": None, "device": device}
        self.lost = False
        self._lock = threading.Lock()
        self._last = 0.0
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def send(self, force: bool = False, **changes):
        with self._lock:
            self.state.update(changes)
            if not force and time.monotonic() - self._last < 1.5:
                return
            self._last = time.monotonic()
            state = dict(self.state)
        try:
            if not self.api.heartbeat(self.job_id, state["status"], state["progress"], state["device"]):
                self.lost = True
        except LostJob:
            self.lost = True
        except Exception as e:  # a missed beat is fine; staleness only kicks in after minutes
            log("heartbeat_failed", job_id=self.job_id, error=type(e).__name__)

    def _run(self):
        while not self._stop.wait(self.interval):
            self.send(force=True)

    def __enter__(self):
        self.send(force=True)
        self._thread.start()
        return self

    def __exit__(self, *exc):
        self._stop.set()
        self._thread.join(timeout=5)


def process_job(cfg: Config, api: WorkerApi, separator, job: dict, pipeline: dict) -> None:
    job_id = job["id"]
    params = pipeline["params"]
    sr, ch = params["sampleRate"], params["channels"]
    t_start = time.monotonic()
    deadline = t_start + cfg.job_timeout_s
    timings: dict[str, float] = {}
    work = cfg.work_dir / f"job-{job_id}"

    def lap(name: str, since: float) -> float:
        timings[name] = round(time.monotonic() - since, 2)
        return time.monotonic()

    try:
        if free_bytes(cfg.work_dir) < cfg.min_free_bytes:
            raise PipelineError("disk_full", "below MUSIC_MIN_FREE_MB", retryable=True)
        work.mkdir(parents=True, exist_ok=True)

        with Heartbeat(api, job_id, separator.device) as hb:
            def ensure_owned():
                if hb.lost:
                    raise LostJob(job_id)

            t = time.monotonic()
            src = work / f"source.{job.get('container', 'bin')}"
            size = download(job["sourceUrl"], src)
            t = lap("download_s", t)

            info = audio.probe(src)  # raises corrupted_audio if it isn't decodable audio
            max_s = float(job.get("maxDurationS") or 0)
            if max_s and info["duration_s"] > max_s:
                raise PipelineError("too_long", f"{info['duration_s']:.0f}s > {max_s:.0f}s",
                                    message=f"That track is too long to process. The limit is {round(max_s / 60)} minutes.")
            mix = audio.decode(src, sr, ch)
            t = lap("decode_s", t)
            source_duration = round(mix.shape[1] / sr, 3)

            if separator.model is None:
                separator.load()
                t = lap("model_load_s", t)
            hb.send(force=True, device=separator.device, progress=0.0)

            def on_progress(frac: float):
                ensure_owned()
                hb.send(force=frac >= 1.0, progress=round(min(frac, 1.0), 4))

            log("separation_started", job_id=job_id, device=separator.device, audio_s=source_duration, source_bytes=size)
            stems = separator.separate(mix, on_progress, deadline)
            t = lap("separate_s", t)
            checks = validate_stems(mix, stems)

            hb.send(force=True, status="finalizing", progress=None, device=separator.last_device)
            ensure_owned()
            signals = {"original": mix, **stems, "no_lyrics": audio.peak_safe(sum(stems[s] for s in VERSIONS["no_lyrics"]))}

            def encode_one(name: str):
                if time.monotonic() > deadline:
                    raise PipelineError("timeout", "encoding exceeded job timeout")
                path = work / f"{name}.m4a"
                audio.encode(audio.peak_safe(signals[name]), path, sr, params["codec"], params["bitrate"])
                probed = audio.probe(path)
                if abs(probed["duration_s"] - source_duration) > 0.25:
                    raise PipelineError("ffmpeg_failed", f"{name}: duration {probed['duration_s']} != source")
                return name, probed

            with ThreadPoolExecutor(max_workers=3) as pool:
                probed = dict(pool.map(encode_one, OUTPUT_FILES))
            t = lap("encode_s", t)

            ensure_owned()
            targets = api.upload_urls(job_id)
            for name in OUTPUT_FILES:
                upload(targets["urls"][name], work / f"{name}.m4a", targets["contentType"])
            t = lap("upload_s", t)
            ensure_owned()

        outputs = [
            {
                "file": name, "codec": probed[name]["codec"], "durationS": probed[name]["duration_s"],
                "sampleRate": probed[name]["sample_rate"], "channels": probed[name]["channels"],
                "sizeBytes": (work / f"{name}.m4a").stat().st_size, "rmsDbfs": audio.rms_dbfs(signals[name]),
            }
            for name in OUTPUT_FILES
        ]
        timings["total_s"] = round(time.monotonic() - t_start, 2)
        api.complete(job_id, device=separator.last_device, timings=timings, sourceDurationS=source_duration, outputs=outputs)
        log("job_completed", job_id=job_id, device=separator.last_device, timings=timings,
            storage_bytes=sum(o["sizeBytes"] for o in outputs), **checks,
            levels={o["file"]: o["rmsDbfs"] for o in outputs if o["file"] in STEMS})
    finally:
        shutil.rmtree(work, ignore_errors=True)
