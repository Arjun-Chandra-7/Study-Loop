"""Worker configuration from the environment, plus a tiny structured logger."""

from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent.parent


def load_pipeline() -> dict:
    with open(WORKER_DIR / "pipeline.json", encoding="utf-8") as f:
        return json.load(f)


@dataclass(frozen=True)
class Config:
    #: StudyLoop's base URL, e.g. https://study-loop-alpha.vercel.app (the worker only talks to its API)
    api_url: str
    #: Shared secret matching MUSIC_WORKER_TOKEN on the server
    worker_token: str
    #: Scratch space for one job at a time (downloads, stems, encodes); always cleaned up
    work_dir: Path
    device: str  # "auto" | "cuda" | "cpu"
    job_timeout_s: float
    min_free_bytes: int
    poll_interval_s: float


def _env_local() -> None:
    """Local convenience: take MUSIC_* settings from the repo's .env.local unless already in the environment."""
    path = WORKER_DIR.parent / ".env.local"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.partition("=")
        key = key.strip()
        if sep and key.startswith("MUSIC_") and key not in os.environ:
            os.environ[key] = value.strip().strip('"').strip("'")


def load_config() -> Config:
    _env_local()
    return Config(
        api_url=os.environ.get("MUSIC_API_URL", "http://127.0.0.1:3000").rstrip("/"),
        worker_token=os.environ.get("MUSIC_WORKER_TOKEN", ""),
        work_dir=Path(os.environ.get("MUSIC_WORK_DIR") or WORKER_DIR / ".work").resolve(),
        device=os.environ.get("MUSIC_DEVICE", "auto").lower(),
        job_timeout_s=float(os.environ.get("MUSIC_JOB_TIMEOUT_S", 30 * 60)),
        min_free_bytes=int(float(os.environ.get("MUSIC_MIN_FREE_MB", 1024)) * 1024 * 1024),
        poll_interval_s=float(os.environ.get("MUSIC_POLL_INTERVAL_S", 3)),
    )


def log(event: str, **fields) -> None:
    """One JSON object per line on stderr. Never pass audio, file names, URLs or user data."""
    record = {"ts": round(time.time(), 3), "svc": "music-worker", "event": event, **fields}
    print(json.dumps(record, default=str), file=sys.stderr, flush=True)
