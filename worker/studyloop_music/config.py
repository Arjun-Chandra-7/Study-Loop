"""Worker configuration from the environment, plus a tiny structured logger."""

from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = WORKER_DIR.parent


def load_pipeline() -> dict:
    with open(WORKER_DIR / "pipeline.json", encoding="utf-8") as f:
        return json.load(f)


@dataclass(frozen=True)
class Config:
    data_dir: Path
    device: str  # "auto" | "cuda" | "cpu"
    job_timeout_s: float
    stale_after_s: float
    max_attempts: int
    min_free_bytes: int
    poll_interval_s: float

    @property
    def db_path(self) -> Path:
        return self.data_dir / "music.db"

    @property
    def tmp_dir(self) -> Path:
        return self.data_dir / "tmp"


def load_config() -> Config:
    data_dir = Path(os.environ.get("MUSIC_DATA_DIR") or REPO_DIR / ".data" / "music").resolve()
    return Config(
        data_dir=data_dir,
        device=os.environ.get("MUSIC_DEVICE", "auto").lower(),
        job_timeout_s=float(os.environ.get("MUSIC_JOB_TIMEOUT_S", 30 * 60)),
        stale_after_s=float(os.environ.get("MUSIC_STALE_AFTER_S", 120)),
        max_attempts=int(os.environ.get("MUSIC_MAX_ATTEMPTS", 2)),
        min_free_bytes=int(float(os.environ.get("MUSIC_MIN_FREE_MB", 1024)) * 1024 * 1024),
        poll_interval_s=float(os.environ.get("MUSIC_POLL_INTERVAL_S", 1.5)),
    )


def log(event: str, **fields) -> None:
    """One JSON object per line on stderr. Never pass audio, file names or user data."""
    record = {"ts": round(time.time(), 3), "svc": "music-worker", "event": event, **fields}
    print(json.dumps(record, default=str), file=sys.stderr, flush=True)
