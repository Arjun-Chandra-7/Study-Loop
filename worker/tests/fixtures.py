"""Synthetic test audio with known parts: a TTS voice ("vocals"), a kick/hat pattern ("drums") and a bass line."""

from __future__ import annotations

import subprocess
from pathlib import Path

import numpy as np

SR = 44100


def _lavfi(expr: str, seconds: float) -> np.ndarray:
    out = subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i", expr, "-t", str(seconds),
         "-f", "f32le", "-ac", "2", "-ar", str(SR), "pipe:1"],
        capture_output=True, check=True,
    ).stdout
    a = np.frombuffer(out, dtype="<f4").reshape(-1, 2).T.copy()
    n = int(seconds * SR)
    return np.pad(a, ((0, 0), (0, max(0, n - a.shape[1]))))[:, :n]


def parts(seconds: float = 12.0) -> dict[str, np.ndarray]:
    text = "Study loop separates music into stems. This sentence is the vocal part of the test track. " * 3
    voice = _lavfi(f"flite=text='{text}':voice=slt", seconds)
    voice = voice / (np.abs(voice).max() + 1e-9) * 0.5
    kick = "0.8*sin(2*PI*55*t)*exp(-18*mod(t,0.5))"
    hat = "0.15*(random(0)*2-1)*exp(-60*mod(t+0.25,0.5))"
    drums = _lavfi(f"aevalsrc='{kick}+{hat}':s={SR}", seconds)
    bass = _lavfi(f"aevalsrc='0.25*sin(2*PI*(41.2+20.6*gte(mod(t,2),1))*t)':s={SR}", seconds)
    return {"vocals": voice.astype(np.float32), "drums": drums.astype(np.float32), "bass": bass.astype(np.float32)}


def write(path: Path, audio: np.ndarray, codec_args: list[str]) -> Path:
    subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "pipe:0",
         *codec_args, str(path)],
        input=np.ascontiguousarray(audio.T, dtype="<f4").tobytes(), check=True,
    )
    return path


def mix_file(path: Path, seconds: float = 12.0) -> tuple[Path, dict[str, np.ndarray]]:
    p = parts(seconds)
    mix = (p["vocals"] + p["drums"] + p["bass"]).clip(-1, 1)
    codec = {".wav": ["-c:a", "pcm_s16le"], ".mp3": ["-c:a", "libmp3lame", "-b:a", "192k"],
             ".flac": ["-c:a", "flac"], ".m4a": ["-c:a", "aac", "-b:a", "192k"]}[path.suffix]
    return write(path, mix, codec), p
