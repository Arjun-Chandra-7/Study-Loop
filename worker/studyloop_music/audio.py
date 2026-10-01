"""FFmpeg-backed decode / encode / probe. Audio moves as float32 arrays shaped (channels, samples)."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import numpy as np

from .errors import PipelineError

FFMPEG = "ffmpeg"
FFPROBE = "ffprobe"


def probe(path: Path) -> dict:
    """Format/stream facts for the first audio stream. Raises corrupted_audio if there isn't one."""
    try:
        out = subprocess.run(
            [FFPROBE, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
            capture_output=True, timeout=60, check=True,
        ).stdout
        info = json.loads(out)
    except (subprocess.SubprocessError, json.JSONDecodeError) as e:
        raise PipelineError("corrupted_audio", f"ffprobe failed: {type(e).__name__}") from e
    stream = next((s for s in info.get("streams", []) if s.get("codec_type") == "audio"), None)
    if stream is None:
        raise PipelineError("corrupted_audio", "no audio stream")
    fmt = info.get("format", {})
    return {
        "format": fmt.get("format_name"),
        "codec": stream.get("codec_name"),
        "sample_rate": int(stream.get("sample_rate") or 0),
        "channels": int(stream.get("channels") or 0),
        "duration_s": float(fmt.get("duration") or stream.get("duration") or 0),
        "size_bytes": int(fmt.get("size") or 0),
    }


def decode(path: Path, sample_rate: int, channels: int, timeout_s: float = 600) -> np.ndarray:
    """Decode the first audio stream to float32 PCM at the given rate/channel count."""
    cmd = [
        FFMPEG, "-nostdin", "-v", "error", "-i", str(path), "-map", "0:a:0", "-vn",
        "-f", "f32le", "-acodec", "pcm_f32le", "-ac", str(channels), "-ar", str(sample_rate), "pipe:1",
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=timeout_s)
    except subprocess.TimeoutExpired as e:
        raise PipelineError("timeout", "decode timed out") from e
    if proc.returncode != 0:
        raise PipelineError("corrupted_audio", f"ffmpeg decode exit {proc.returncode}: {proc.stderr[-300:]!r}")
    pcm = np.frombuffer(proc.stdout, dtype="<f4")
    if pcm.size < sample_rate * channels:  # under a second of audio
        raise PipelineError("corrupted_audio", f"decoded only {pcm.size} samples")
    pcm = pcm[: pcm.size - pcm.size % channels]
    return np.ascontiguousarray(pcm.reshape(-1, channels).T)


def encode(audio: np.ndarray, dest: Path, sample_rate: int, codec: str, bitrate: str, timeout_s: float = 600) -> None:
    """Encode (channels, samples) float32 to an MP4/AAC file with the index up front for streaming."""
    if codec != "aac":
        raise ValueError(f"unsupported codec {codec}")
    channels = audio.shape[0]
    cmd = [
        FFMPEG, "-nostdin", "-v", "error", "-y",
        "-f", "f32le", "-ar", str(sample_rate), "-ac", str(channels), "-i", "pipe:0",
        "-c:a", "aac", "-b:a", bitrate, "-movflags", "+faststart", "-f", "mp4", str(dest),
    ]
    data = np.ascontiguousarray(audio.T, dtype="<f4").tobytes()
    try:
        proc = subprocess.run(cmd, input=data, capture_output=True, timeout=timeout_s)
    except subprocess.TimeoutExpired as e:
        raise PipelineError("timeout", "encode timed out") from e
    if proc.returncode != 0:
        stderr = proc.stderr.decode(errors="replace")
        code = "disk_full" if "No space left" in stderr else "ffmpeg_failed"
        raise PipelineError(code, f"ffmpeg encode exit {proc.returncode}: {stderr[-300:]!r}")


def rms_dbfs(audio: np.ndarray) -> float:
    rms = float(np.sqrt(np.mean(np.square(audio, dtype=np.float64))))
    return round(20 * np.log10(rms), 2) if rms > 1e-10 else -200.0


def peak_safe(audio: np.ndarray, ceiling: float = 0.995) -> np.ndarray:
    """Scale down only if the signal would clip once it's encoded; never boosts."""
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    return audio * (ceiling / peak) if peak > ceiling else audio
