"""Degraded-mode stub when InsightFace is unavailable.

This is NOT a silent fallback. All match requests return a clear 503
directing the operator to install InsightFace.
"""

import numpy as np


class FaceEngineUnavailable(Exception):
    pass


class FaceEngineStub:
    """Stub that always reports unavailable. Same interface as FaceEngine."""

    def __init__(self) -> None:
        self._available = False

    def initialize(self) -> None:
        pass

    @property
    def is_available(self) -> bool:
        return False

    @property
    def gpu_available(self) -> bool:
        return False

    def detect_and_embed(self, image_rgb: np.ndarray) -> None:
        raise FaceEngineUnavailable(
            "Face engine is not available. InsightFace is not installed or failed to load. "
            "Install with: pip install insightface onnxruntime"
        )
