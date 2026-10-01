"""Failures the worker can report. `code` and `message` are shown to the user; details stay in logs."""

from __future__ import annotations

MESSAGES = {
    "corrupted_audio": "This file couldn't be read as audio. Try exporting it again.",
    "source_missing": "The uploaded audio is no longer available. Upload it again.",
    "too_long": "That track is too long to process.",
    "disk_full": "The server is out of space for processing right now. Try again later.",
    "model_unavailable": "The music separation model couldn't be loaded. Try again later.",
    "timeout": "Processing took too long and was stopped. Try a shorter track.",
    "ffmpeg_failed": "We couldn't convert this audio. Try a different file format.",
    "separation_failed": "Separating this track failed. Try again, or try a different file.",
    "storage_failed": "We couldn't save the study versions. Try again later.",
    "worker_crashed": "Processing stopped unexpectedly. Try again.",
    "internal": "Something went wrong while processing. Try again.",
}


class PipelineError(Exception):
    def __init__(self, code: str, detail: str = "", retryable: bool = False, message: str | None = None):
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code if code in MESSAGES else "internal"
        self.detail = detail
        self.retryable = retryable
        self._message = message

    @property
    def user_message(self) -> str:
        return self._message or MESSAGES[self.code]
