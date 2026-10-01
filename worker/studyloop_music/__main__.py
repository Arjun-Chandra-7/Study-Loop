"""Worker loop: `python -m studyloop_music` (from worker/). Processes one job at a time, model kept loaded."""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import socket
import time
import traceback

from . import db
from .config import load_config, load_pipeline, log
from .errors import MESSAGES, PipelineError
from .pipeline import process_job
from .separate import Separator

TMP_MAX_AGE_S = 3600


def sweep_tmp(tmp_dir, max_age_s: float = TMP_MAX_AGE_S) -> int:
    """Remove abandoned uploads / job scratch dirs (e.g. after a crash)."""
    removed = 0
    cutoff = time.time() - max_age_s
    for entry in tmp_dir.iterdir() if tmp_dir.exists() else []:
        try:
            if entry.stat().st_mtime < cutoff:
                shutil.rmtree(entry) if entry.is_dir() else entry.unlink()
                removed += 1
        except FileNotFoundError:
            pass
    return removed


def run_one(cfg, conn, separator, pipeline, worker_id) -> bool:
    job = db.claim_next(conn, worker_id)
    if job is None:
        return False
    job_id = job["id"]
    log("job_started", job_id=job_id, attempt=job["attempts"], model=job["model"], model_version=job["model_version"])
    try:
        process_job(cfg, conn, separator, job, pipeline, worker_id)
    except PipelineError as e:
        requeue = e.retryable and job["attempts"] < cfg.max_attempts
        db.fail(conn, job_id, worker_id, e.code, e.user_message, requeue=requeue)
        log("job_failed", job_id=job_id, code=e.code, detail=e.detail, requeued=requeue, attempt=job["attempts"])
    except Exception as e:
        db.fail(conn, job_id, worker_id, "internal", MESSAGES["internal"], requeue=False)
        log("job_failed", job_id=job_id, code="internal", detail=f"{type(e).__name__}: {e}",
            trace=traceback.format_exc(limit=8))
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="StudyLoop music separation worker")
    parser.add_argument("--once", action="store_true", help="process queued jobs, then exit")
    args = parser.parse_args()

    cfg = load_config()
    pipeline = load_pipeline()
    cfg.tmp_dir.mkdir(parents=True, exist_ok=True)
    conn = db.connect(cfg.db_path)
    worker_id = f"{socket.gethostname()}:{os.getpid()}"
    log("worker_started", worker_id=worker_id, device_pref=cfg.device, model=pipeline["model"],
        model_version=pipeline["modelVersion"], swept_tmp=sweep_tmp(cfg.tmp_dir))

    separator = Separator(pipeline["model"], pipeline["modelSignatures"], pipeline["params"], cfg.device)
    try:
        separator.load()  # warm up so the first job doesn't pay for it; retried per job if this fails
    except PipelineError as e:
        log("model_load_failed", detail=e.detail)

    stopping = False

    def stop(*_):
        nonlocal stopping
        stopping = True
        log("worker_stopping", worker_id=worker_id)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    last_recover = 0.0
    while not stopping:
        db.beat_worker(conn, worker_id, separator.device or cfg.device)
        if time.monotonic() - last_recover > 30:
            for job_id, action in db.recover_stale(conn, cfg.stale_after_s, cfg.max_attempts, MESSAGES["worker_crashed"]):
                log("job_recovered", job_id=job_id, action=action)
            sweep_tmp(cfg.tmp_dir)
            last_recover = time.monotonic()
        if run_one(cfg, conn, separator, pipeline, worker_id):
            continue
        if args.once:
            break
        time.sleep(cfg.poll_interval_s)
    db.drop_worker(conn, worker_id)
    conn.close()


if __name__ == "__main__":
    main()
