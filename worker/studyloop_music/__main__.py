"""Worker loop: `python -m studyloop_music` (from worker/). One job at a time, model kept loaded.

Needs MUSIC_API_URL (the StudyLoop site) and MUSIC_WORKER_TOKEN (same value as on the server).
The worker has no database or storage credentials: it claims jobs and gets presigned links from the API.
"""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import socket
import time
import traceback

from .api import ApiUnavailable, LostJob, WorkerApi
from .config import load_config, load_pipeline, log
from .errors import MESSAGES, PipelineError
from .pipeline import process_job
from .separate import Separator

TMP_MAX_AGE_S = 3600
MAX_BACKOFF_S = 60


def sweep_tmp(tmp_dir, max_age_s: float = TMP_MAX_AGE_S) -> int:
    """Remove abandoned job scratch dirs (e.g. after a crash)."""
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


def run_one(cfg, api: WorkerApi, separator, pipeline) -> bool:
    """Claim and process one job. False when the queue is empty."""
    job = api.claim(separator.device or cfg.device)
    if job is None:
        return False
    job_id = job["id"]
    log("job_started", job_id=job_id, attempt=job.get("attempts"), model=job.get("model"), model_version=job.get("modelVersion"))
    try:
        process_job(cfg, api, separator, job, pipeline)
    except LostJob:
        log("job_lost", job_id=job_id)  # recovered by the server or finished elsewhere; nothing to report
    except PipelineError as e:
        status = _report(api, job_id, e.code, e.user_message, e.retryable)
        log("job_failed", job_id=job_id, code=e.code, detail=e.detail, retryable=e.retryable, now=status)
    except ApiUnavailable:
        raise  # the server will see the job go stale and requeue it
    except Exception as e:
        _report(api, job_id, "internal", MESSAGES["internal"], False)
        log("job_failed", job_id=job_id, code="internal", detail=f"{type(e).__name__}: {e}", trace=traceback.format_exc(limit=8))
    return True


def _report(api: WorkerApi, job_id: str, code: str, message: str, retryable: bool):
    try:
        return api.fail(job_id, code, message, retryable)
    except (ApiUnavailable, LostJob, PipelineError) as e:
        log("fail_report_failed", job_id=job_id, error=type(e).__name__)
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description="StudyLoop music separation worker")
    parser.add_argument("--once", action="store_true", help="process queued jobs, then exit")
    args = parser.parse_args()

    cfg = load_config()
    if not cfg.worker_token:
        raise SystemExit("MUSIC_WORKER_TOKEN is not set (it must match the server's).")
    pipeline = load_pipeline()
    cfg.work_dir.mkdir(parents=True, exist_ok=True)
    worker_id = f"{socket.gethostname()}:{os.getpid()}"
    api = WorkerApi(cfg.api_url, cfg.worker_token, worker_id)
    log("worker_started", worker_id=worker_id, api=cfg.api_url, device_pref=cfg.device, model=pipeline["model"],
        model_version=pipeline["modelVersion"], swept_tmp=sweep_tmp(cfg.work_dir))

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

    backoff = cfg.poll_interval_s
    announced = False
    last_sweep = time.monotonic()
    while not stopping:
        if time.monotonic() - last_sweep > 600:
            sweep_tmp(cfg.work_dir)
            last_sweep = time.monotonic()
        try:
            worked = run_one(cfg, api, separator, pipeline)
            if backoff != cfg.poll_interval_s or not announced:
                log("waiting_for_jobs", api=cfg.api_url,
                    note="Connected. Leave this running; tracks you process in StudyLoop will be picked up here.")
                announced = True
            backoff = cfg.poll_interval_s
        except ApiUnavailable as e:
            log("api_unavailable", detail=str(e), retry_in_s=backoff)
            worked = False
            time.sleep(backoff)
            backoff = min(backoff * 2, MAX_BACKOFF_S)
            continue
        if worked:
            continue
        if args.once:
            break
        time.sleep(cfg.poll_interval_s)


if __name__ == "__main__":
    main()
