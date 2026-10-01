"""SQLite job queue. The music_jobs table *is* the queue: the API inserts 'queued' rows, workers claim them."""

from __future__ import annotations

import sqlite3
import time
import uuid
from pathlib import Path

from .config import WORKER_DIR


def now_ms() -> int:
    return int(time.time() * 1000)


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=30, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript((WORKER_DIR / "schema.sql").read_text())
    return conn


def claim_next(conn: sqlite3.Connection, worker_id: str) -> sqlite3.Row | None:
    """Atomically move the oldest queued job to 'processing' and return it with its source."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        row = conn.execute(
            "SELECT id FROM music_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1"
        ).fetchone()
        if row is None:
            conn.execute("COMMIT")
            return None
        t = now_ms()
        conn.execute(
            """UPDATE music_jobs SET status = 'processing', progress = NULL, attempts = attempts + 1,
                 worker_id = ?, heartbeat_at = ?, started_at = ?, error_code = NULL, error_message = NULL
               WHERE id = ?""",
            (worker_id, t, t, row["id"]),
        )
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    return conn.execute(
        """SELECT j.*, s.file_path AS source_path, s.duration_s AS source_duration_s
           FROM music_jobs j JOIN music_sources s ON s.id = j.source_id WHERE j.id = ?""",
        (row["id"],),
    ).fetchone()


def touch(conn: sqlite3.Connection, job_id: str, worker_id: str, **fields) -> bool:
    """Heartbeat (+ optional status/progress/device). False if this worker no longer owns the job."""
    allowed = {"status", "progress", "device"}
    sets = ["heartbeat_at = ?"] + [f"{k} = ?" for k in fields if k in allowed]
    args = [now_ms()] + [v for k, v in fields.items() if k in allowed]
    cur = conn.execute(
        f"UPDATE music_jobs SET {', '.join(sets)} WHERE id = ? AND worker_id = ? "
        "AND status IN ('processing', 'finalizing')",
        (*args, job_id, worker_id),
    )
    return cur.rowcount == 1


def complete(conn: sqlite3.Connection, job_id: str, worker_id: str, outputs: list[dict], timings: dict, device: str) -> bool:
    import json

    conn.execute("BEGIN IMMEDIATE")
    try:
        owned = conn.execute(
            "SELECT 1 FROM music_jobs WHERE id = ? AND worker_id = ? AND status IN ('processing', 'finalizing')",
            (job_id, worker_id),
        ).fetchone()
        if not owned:
            conn.execute("ROLLBACK")
            return False
        t = now_ms()
        for o in outputs:
            conn.execute(
                """INSERT INTO music_outputs (id, job_id, kind, name, file_path, format, codec, duration_s,
                     sample_rate, channels, size_bytes, rms_dbfs, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (uuid.uuid4().hex, job_id, o["kind"], o["name"], o["file_path"], o["format"], o["codec"],
                 o["duration_s"], o["sample_rate"], o["channels"], o["size_bytes"], o.get("rms_dbfs"), t),
            )
        conn.execute(
            """UPDATE music_jobs SET status = 'completed', progress = 1, device = ?, timings_json = ?,
                 completed_at = ?, heartbeat_at = ? WHERE id = ?""",
            (device, json.dumps(timings), t, t, job_id),
        )
        conn.execute("COMMIT")
        return True
    except BaseException:
        conn.execute("ROLLBACK")
        raise


def fail(conn: sqlite3.Connection, job_id: str, worker_id: str | None, code: str, message: str, requeue: bool) -> None:
    t = now_ms()
    if requeue:
        conn.execute(
            """UPDATE music_jobs SET status = 'queued', worker_id = NULL, progress = NULL, heartbeat_at = ?,
                 error_code = ?, error_message = ? WHERE id = ? AND (worker_id = ? OR ? IS NULL)""",
            (t, code, message, job_id, worker_id, worker_id),
        )
    else:
        conn.execute(
            """UPDATE music_jobs SET status = 'failed', progress = NULL, completed_at = ?, heartbeat_at = ?,
                 error_code = ?, error_message = ? WHERE id = ? AND (worker_id = ? OR ? IS NULL)""",
            (t, t, code, message, job_id, worker_id, worker_id),
        )


def beat_worker(conn: sqlite3.Connection, worker_id: str, device: str | None) -> None:
    conn.execute(
        "INSERT INTO music_workers (id, device, seen_at) VALUES (?, ?, ?) "
        "ON CONFLICT (id) DO UPDATE SET device = COALESCE(excluded.device, device), seen_at = excluded.seen_at",
        (worker_id, device, now_ms()),
    )


def drop_worker(conn: sqlite3.Connection, worker_id: str) -> None:
    conn.execute("DELETE FROM music_workers WHERE id = ?", (worker_id,))


def recover_stale(conn: sqlite3.Connection, stale_after_s: float, max_attempts: int, message: str) -> list[tuple[str, str]]:
    """Jobs whose worker stopped heart-beating: requeue if attempts remain, otherwise fail them."""
    cutoff = now_ms() - int(stale_after_s * 1000)
    rows = conn.execute(
        "SELECT id, attempts FROM music_jobs WHERE status IN ('processing', 'finalizing') AND heartbeat_at < ?",
        (cutoff,),
    ).fetchall()
    actions = []
    for r in rows:
        requeue = r["attempts"] < max_attempts
        fail(conn, r["id"], None, "worker_crashed", message, requeue=requeue)
        actions.append((r["id"], "requeued" if requeue else "failed"))
    return actions
