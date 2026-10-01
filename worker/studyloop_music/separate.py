"""Demucs wrapper: loads the model once per worker process and reports real chunk progress."""

from __future__ import annotations

import time
import types
from typing import Callable

import numpy as np

from .config import log
from .errors import PipelineError

STEMS = ("vocals", "drums", "bass", "other")

ProgressFn = Callable[[float], None]


def bundled_signatures(model_name: str) -> list[str]:
    """Checkpoint signatures Demucs will load for a named pretrained model (from its packaged manifest)."""
    from importlib import resources

    import yaml

    manifest = resources.files("demucs").joinpath("remote", f"{model_name}.yaml").read_text()
    return [str(s) for s in yaml.safe_load(manifest)["models"]]


class Separator:
    def __init__(self, model_name: str, signatures: list[str], params: dict, device_pref: str = "auto"):
        self.model_name = model_name
        self.signatures = signatures
        self.params = params
        self.device_pref = device_pref
        self.model = None
        self.device: str | None = None  # preferred device for each run
        self.last_device: str | None = None  # device the last run actually finished on
        self.load_seconds: float | None = None

    def _pick_device(self) -> str:
        import torch

        if self.device_pref == "cpu":
            return "cpu"
        if torch.cuda.is_available():
            return "cuda"
        if self.device_pref == "cuda":
            log("device_fallback", wanted="cuda", using="cpu", reason="cuda_unavailable")
        return "cpu"

    def load(self) -> None:
        if self.model is not None:
            return
        t0 = time.monotonic()
        try:
            import torch  # noqa: F401
            from demucs.pretrained import get_model

            model = get_model(self.model_name)
        except Exception as e:  # import errors, missing weights, no network for first download
            raise PipelineError("model_unavailable", f"{type(e).__name__}: {e}", retryable=True) from e
        # Keep the processing identity honest: the weights must match what cache keys claim.
        sigs = bundled_signatures(self.model_name)
        if sigs != self.signatures:
            raise PipelineError("model_unavailable", f"model signatures {sigs} != expected {self.signatures}")
        model.eval()
        self.model = model
        self.device = self._pick_device()
        self.load_seconds = round(time.monotonic() - t0, 2)
        log("model_loaded", model=self.model_name, signatures=sigs or None, device=self.device, seconds=self.load_seconds)

    def separate(self, mix: np.ndarray, on_progress: ProgressFn, deadline: float) -> dict[str, np.ndarray]:
        """mix: (2, samples) float32 at the model's rate. Returns {stem: (2, samples)}."""
        self.load()
        try:
            self.last_device = self.device
            return self._run(mix, self.device, on_progress, deadline)
        except PipelineError:
            raise
        except Exception as e:
            import torch

            # Any GPU failure (out of memory surfaces as OutOfMemoryError *or* a generic
            # AcceleratorError/RuntimeError depending on where it hits) gets one CPU attempt.
            if self.device == "cuda":
                oom = isinstance(e, torch.cuda.OutOfMemoryError) or "out of memory" in str(e).lower()
                torch.cuda.empty_cache()
                log("device_fallback", wanted="cuda", using="cpu", reason="cuda_out_of_memory" if oom else "cuda_error",
                    error=type(e).__name__)
                self.last_device = "cpu"
                try:
                    return self._run(mix, "cpu", on_progress, deadline)
                except PipelineError:
                    raise
                except Exception as e2:
                    raise PipelineError("separation_failed", f"cpu fallback: {type(e2).__name__}: {e2}") from e2
            raise PipelineError("separation_failed", f"{type(e).__name__}: {e}") from e

    def _run(self, mix: np.ndarray, device: str, on_progress: ProgressFn, deadline: float) -> dict[str, np.ndarray]:
        import torch
        from demucs import apply as demucs_apply

        wav = torch.from_numpy(mix)
        ref = wav.mean(0)
        mean, std = ref.mean(), ref.std() + 1e-8
        wav = (wav - mean) / std

        n_models = len(getattr(self.model, "models", [None]))
        done_models = [0]

        def tracked(iterable, **_kw):
            items = list(iterable)
            for i, item in enumerate(items):
                if time.monotonic() > deadline:
                    raise PipelineError("timeout", "separation exceeded job timeout")
                yield item
                on_progress((done_models[0] + (i + 1) / len(items)) / n_models)
            done_models[0] += 1

        # Demucs reports per-chunk progress through tqdm; route it to the job instead of a terminal bar.
        original_tqdm = demucs_apply.tqdm
        demucs_apply.tqdm = types.SimpleNamespace(tqdm=tracked)
        try:
            with torch.inference_mode():
                out = demucs_apply.apply_model(
                    self.model, wav[None], device=device, shifts=self.params["shifts"],
                    split=True, overlap=self.params["overlap"], progress=True, num_workers=0,
                )[0]
        finally:
            demucs_apply.tqdm = original_tqdm
            if device == "cuda":
                # Demucs moves weights to the device and back only on success. After a failure
                # (e.g. out of memory) they'd stay on the GPU, and the CPU fallback would then try
                # to move them "back" to CUDA when it finishes. Keep the resting place on the CPU.
                self.model.to("cpu")
                torch.cuda.empty_cache()
        out = (out * std + mean).float().cpu().numpy()
        return {name: np.ascontiguousarray(out[self.model.sources.index(name)]) for name in STEMS}
