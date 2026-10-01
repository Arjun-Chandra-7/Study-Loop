"""Real Demucs on a synthetic mix with known parts. Slow (downloads ~80 MB of weights once), so opt-in:

    MUSIC_TEST_DEMUCS=1 .venv/bin/python -m unittest tests.test_demucs
"""

from __future__ import annotations

import os
import time
import unittest

import numpy as np

from studyloop_music import audio
from studyloop_music.config import load_pipeline
from studyloop_music.pipeline import validate_stems
from studyloop_music.separate import Separator, bundled_signatures

from tests import fixtures


def corr(a: np.ndarray, b: np.ndarray) -> float:
    a, b = a.mean(0), b.mean(0)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))


def energy_share(signal: np.ndarray, part: np.ndarray) -> float:
    """How much of `signal` lies along `part` (least-squares projection), as an energy fraction."""
    s, p = signal.mean(0), part.mean(0)
    proj = np.dot(s, p) / (np.dot(p, p) + 1e-12) * p
    return float(np.dot(proj, proj) / (np.dot(s, s) + 1e-12))


@unittest.skipUnless(os.environ.get("MUSIC_TEST_DEMUCS") == "1", "set MUSIC_TEST_DEMUCS=1 to run the real model")
class DemucsQualityTest(unittest.TestCase):
    def test_separates_known_parts(self):
        p = load_pipeline()
        self.assertEqual(bundled_signatures(p["model"]), p["modelSignatures"])
        parts = fixtures.parts(seconds=12)
        mix = (parts["vocals"] + parts["drums"] + parts["bass"]).astype(np.float32)

        sep = Separator(p["model"], p["modelSignatures"], p["params"], os.environ.get("MUSIC_DEVICE", "auto"))
        progress = []
        t0 = time.monotonic()
        stems = sep.separate(mix, progress.append, time.monotonic() + 600)
        elapsed = time.monotonic() - t0
        checks = validate_stems(mix, stems)
        no_lyrics = stems["drums"] + stems["bass"] + stems["other"]

        report = {
            "device": sep.last_device, "load_s": sep.load_seconds, "separate_s": round(elapsed, 2),
            "vocals~voice": round(corr(stems["vocals"], parts["vocals"]), 3),
            "drums~drums": round(corr(stems["drums"], parts["drums"]), 3),
            "bass~bass": round(corr(stems["bass"], parts["bass"]), 3),
            "voice share: mix": round(energy_share(mix, parts["vocals"]), 3),
            "voice share: no_lyrics": round(energy_share(no_lyrics, parts["vocals"]), 4),
            "rms dBFS": {k: audio.rms_dbfs(v) for k, v in stems.items()}, **checks,
        }
        print("\n", report)

        self.assertTrue(progress and progress[-1] == 1.0 and progress == sorted(progress))
        self.assertGreater(report["vocals~voice"], 0.8)
        self.assertGreater(report["drums~drums"], 0.8)
        # "No Lyrics" must carry materially less of the voice than the original mix.
        self.assertLess(report["voice share: no_lyrics"], report["voice share: mix"] * 0.1)
        for name in ("vocals", "drums"):
            self.assertGreater(audio.rms_dbfs(stems[name]), -40, f"{name} is near-silent")


if __name__ == "__main__":
    unittest.main()
