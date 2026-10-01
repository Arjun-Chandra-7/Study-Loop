"""A stand-in for StudyLoop's worker API plus presigned storage links, served over real HTTP."""

from __future__ import annotations

import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = "worker-secret"


class FakeStudyLoop:
    def __init__(self):
        self.jobs: dict[str, dict] = {}  # id -> job (queued/processing/completed/failed)
        self.blobs: dict[str, tuple[bytes, str]] = {}  # pathname -> (bytes, content type)
        self.heartbeats: list[dict] = []
        self.completed: dict[str, dict] = {}
        self.failures: dict[str, dict] = {}
        self.steal_after_heartbeats: int | None = None  # simulate the server recovering the job
        self.lock = threading.Lock()
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), self._handler())
        self.url = f"http://127.0.0.1:{self.server.server_port}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()

    def add_job(self, job_id: str, audio: bytes | None, container: str = "mp3", max_duration_s: float = 900):
        path = f"sources/{job_id}.{container}"
        if audio is not None:
            self.blobs[path] = (audio, "audio/mpeg")
        self.jobs[job_id] = {"id": job_id, "status": "queued", "attempts": 0, "worker": None, "path": path,
                             "container": container, "maxDurationS": max_duration_s}

    def _handler(self):
        fake = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _json(self, code: int, body: dict):
                data = json.dumps(body).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def _body(self) -> bytes:
                return self.rfile.read(int(self.headers.get("Content-Length") or 0))

            def do_GET(self):
                m = re.match(r"^/blob/(.+)$", self.path)
                blob = fake.blobs.get(m.group(1)) if m else None
                if not blob:
                    return self._json(404, {"error": "not found"})
                self.send_response(200)
                self.send_header("Content-Type", blob[1])
                self.send_header("Content-Length", str(len(blob[0])))
                self.end_headers()
                self.wfile.write(blob[0])

            def do_PUT(self):
                m = re.match(r"^/blob/(.+)$", self.path)
                if not m or self.headers.get("Content-Type") != "audio/mp4":
                    return self._json(403, {"error": "forbidden"})
                fake.blobs[m.group(1)] = (self._body(), "audio/mp4")
                self._json(200, {"pathname": m.group(1)})

            def do_POST(self):
                if self.headers.get("Authorization") != f"Bearer {TOKEN}":
                    return self._json(401, {"error": {"code": "unauthorized"}})
                body = json.loads(self._body() or b"{}")
                with fake.lock:
                    if self.path == "/api/music/worker/claim":
                        job = next((j for j in fake.jobs.values() if j["status"] == "queued"), None)
                        if not job:
                            return self._json(200, {"job": None})
                        job.update(status="processing", worker=body["workerId"], attempts=job["attempts"] + 1)
                        return self._json(200, {"job": {
                            "id": job["id"], "attempts": job["attempts"], "model": "htdemucs", "modelVersion": "v",
                            "container": job["container"], "sourceUrl": f"{fake.url}/blob/{job['path']}",
                            "maxDurationS": job["maxDurationS"]}})
                    m = re.match(r"^/api/music/worker/jobs/([^/]+)/([a-z-]+)$", self.path)
                    job = fake.jobs.get(m.group(1)) if m else None
                    if not job:
                        return self._json(404, {"error": {"code": "not_found"}})
                    owned = job["worker"] == body.get("workerId") and job["status"] in ("processing", "finalizing")
                    action = m.group(2)
                    if action == "heartbeat":
                        fake.heartbeats.append(body)
                        if fake.steal_after_heartbeats is not None and len(fake.heartbeats) > fake.steal_after_heartbeats:
                            job["worker"] = "someone-else"
                            owned = False
                        if owned:
                            job["status"] = body.get("status") or job["status"]
                        return self._json(200, {"owned": owned})
                    if not owned:
                        return self._json(409, {"error": {"code": "not_owned"}})
                    if action == "upload-urls":
                        files = ("original", "no_lyrics", "vocals", "drums", "bass", "other")
                        return self._json(200, {"contentType": "audio/mp4", "urls": {
                            f: f"{fake.url}/blob/outputs/{job['id']}/{f}.m4a" for f in files}})
                    if action == "complete":
                        for o in body["outputs"]:
                            blob = fake.blobs.get(f"outputs/{job['id']}/{o['file']}.m4a")
                            if not blob or len(blob[0]) != o["sizeBytes"]:
                                return self._json(400, {"error": {"code": "outputs_missing"}})
                        job["status"] = "completed"
                        fake.completed[job["id"]] = body
                        return self._json(200, {"ok": True})
                    if action == "fail":
                        requeue = body.get("retryable") and job["attempts"] < 2
                        job.update(status="queued" if requeue else "failed", worker=None)
                        fake.failures[job["id"]] = body
                        return self._json(200, {"status": job["status"]})
                return self._json(404, {"error": {"code": "not_found"}})

        return H
