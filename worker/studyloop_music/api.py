"""Talks to StudyLoop's worker API and moves bytes through presigned storage links (stdlib only)."""

from __future__ import annotations

import json
import shutil
import time
import urllib.error
import urllib.request
from pathlib import Path

from .errors import PipelineError


class ApiUnavailable(Exception):
    """The API can't be reached or refused us (network, 5xx, bad token). The worker backs off and retries."""


class LostJob(Exception):
    """The server says this worker no longer owns the job (it was recovered or finished elsewhere)."""


class WorkerApi:
    def __init__(self, base_url: str, token: str, worker_id: str, timeout: float = 30):
        self.base = base_url.rstrip("/") + "/api/music/worker"
        self.token = token
        self.worker_id = worker_id
        self.timeout = timeout

    def _post(self, path: str, body: dict) -> dict:
        data = json.dumps({"workerId": self.worker_id, **body}).encode()
        req = urllib.request.Request(
            self.base + path, data=data, method="POST",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.token}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                return json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            try:
                err = json.loads(e.read() or b"{}").get("error", {})
            except ValueError:
                err = {}
            if e.code == 409 and err.get("code") == "not_owned":
                raise LostJob(path) from e
            if e.code in (400, 404):
                raise PipelineError("internal", f"API {path} -> {e.code} {err.get('code')}") from e
            raise ApiUnavailable(f"{path} -> HTTP {e.code} {err.get('code', '')}") from e
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            raise ApiUnavailable(f"{path} -> {type(e).__name__}") from e

    def claim(self, device: str | None) -> dict | None:
        return self._post("/claim", {"device": device}).get("job")

    def heartbeat(self, job_id: str, status: str, progress: float | None, device: str | None) -> bool:
        return bool(self._post(f"/jobs/{job_id}/heartbeat", {"status": status, "progress": progress, "device": device}).get("owned"))

    def upload_urls(self, job_id: str) -> dict:
        return self._post(f"/jobs/{job_id}/upload-urls", {})

    def complete(self, job_id: str, **report) -> None:
        self._post(f"/jobs/{job_id}/complete", report)

    def fail(self, job_id: str, code: str, message: str, retryable: bool) -> str | None:
        return self._post(f"/jobs/{job_id}/fail", {"code": code, "message": message, "retryable": retryable}).get("status")


def download(url: str, dest: Path, max_bytes: int = 1 << 30, timeout: float = 120) -> int:
    """Stream a presigned GET to disk. Missing/expired source → source_missing; network trouble → retryable."""
    try:
        with urllib.request.urlopen(urllib.request.Request(url), timeout=timeout) as r, open(dest, "wb") as f:
            n = 0
            while chunk := r.read(1 << 20):
                n += len(chunk)
                if n > max_bytes:
                    raise PipelineError("source_missing", "source larger than allowed")
                f.write(chunk)
            return n
    except urllib.error.HTTPError as e:
        raise PipelineError("source_missing", f"download HTTP {e.code}") from e
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        raise PipelineError("storage_failed", f"download {type(e).__name__}", retryable=True) from e
    except OSError as e:
        if getattr(e, "errno", None) == 28:  # ENOSPC
            raise PipelineError("disk_full", "no space while downloading", retryable=True) from e
        raise


def upload(url: str, path: Path, content_type: str, attempts: int = 3, timeout: float = 300) -> None:
    """PUT a file to a presigned URL, retrying transient failures."""
    for i in range(attempts):
        try:
            with open(path, "rb") as f:
                req = urllib.request.Request(
                    url, data=f, method="PUT",
                    headers={"Content-Type": content_type, "Content-Length": str(path.stat().st_size)},
                )
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    r.read()
                return
        except urllib.error.HTTPError as e:
            if e.code < 500 or i == attempts - 1:
                raise PipelineError("storage_failed", f"upload HTTP {e.code}", retryable=e.code >= 500) from e
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if i == attempts - 1:
                raise PipelineError("storage_failed", f"upload {type(e).__name__}", retryable=True) from e
        time.sleep(1.5 * (i + 1))


def free_bytes(path: Path) -> int:
    path.mkdir(parents=True, exist_ok=True)
    return shutil.disk_usage(path).free
