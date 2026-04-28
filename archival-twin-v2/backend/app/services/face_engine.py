"""InsightFace wrapper — face detection, embedding, and analysis."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np

from app.config import settings

logger = logging.getLogger(__name__)


class NoFaceDetected(Exception):
    pass


class MultipleFacesDetected(Exception):
    def __init__(self, count: int) -> None:
        self.count = count
        super().__init__(f"Detected {count} faces, expected exactly 1")


@dataclass
class FaceResult:
    embedding: np.ndarray
    bbox: tuple[float, float, float, float]
    detection_score: float
    pose_tag: str
    age_band: str
    dominant_emotion: str
    quality_score: float = field(default=0.0)  # embedding norm — encodes quality (AdaFace insight)


class FaceEngine:
    def __init__(self) -> None:
        self._available = False
        self._app: Any = None

    def initialize(self) -> None:
        try:
            from insightface.app import FaceAnalysis  # type: ignore[import-untyped]

            det_size = settings.det_size_tuple
            app = FaceAnalysis(
                name=settings.insightface_model,
                providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
            )
            # ctx_id=0 tries GPU; falls back to CPU if unavailable
            app.prepare(ctx_id=0, det_size=det_size)
            self._app = app
            self._available = True
            logger.info(
                "InsightFace engine initialized — model=%s det_size=%s",
                settings.insightface_model, det_size,
            )
        except ImportError:
            logger.error("InsightFace is not installed. pip install insightface onnxruntime")
        except Exception as exc:
            logger.error("InsightFace initialization failed: %s", exc)

    @property
    def is_available(self) -> bool:
        return self._available

    @property
    def gpu_available(self) -> bool:
        if not self._available:
            return False
        try:
            import onnxruntime as ort  # type: ignore[import-untyped]
            return "CUDAExecutionProvider" in ort.get_available_providers()
        except Exception:
            return False

    def detect_and_embed(self, image_rgb: np.ndarray) -> FaceResult:
        if not self._available:
            raise RuntimeError("Face engine is not available")

        image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)

        # Primary pass: color image (enhance_contrast already applied upstream in match.py)
        faces = self._app.get(image_bgr)

        # Fallback: if color detection finds nothing, retry with grayscale + CLAHE.
        # Mirrors the ingest pipeline's strategy so both paths use the same embedding
        # distribution when lighting conditions make the color image hard to detect.
        if len(faces) == 0:
            gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
            gray_3ch = cv2.merge([clahe.apply(gray)] * 3)
            faces = self._app.get(gray_3ch)
            if faces:
                logger.debug("Face detected on grayscale fallback")

        if len(faces) == 0:
            raise NoFaceDetected("No face could be detected in the submitted image")
        if len(faces) > 1:
            raise MultipleFacesDetected(len(faces))

        face = faces[0]
        det_score = float(face.det_score)

        if det_score < settings.min_detection_score:
            raise NoFaceDetected(
                f"Face detected but confidence too low ({det_score:.2f})"
            )

        # Embedding norm encodes quality — preserve it before L2 normalizing
        raw_embedding = np.array(face.embedding, dtype=np.float32)
        quality_score = float(np.linalg.norm(raw_embedding))
        embedding = raw_embedding / quality_score if quality_score > 0 else raw_embedding

        # InsightFace bbox is [x1, y1, x2, y2] — convert to (x, y, w, h)
        x1, y1, x2, y2 = face.bbox.astype(float)
        bbox = (x1, y1, x2 - x1, y2 - y1)

        pose_tag = self._pose_to_tag(face)
        age_band = self._age_to_band(getattr(face, "age", None))

        return FaceResult(
            embedding=embedding,
            bbox=bbox,
            detection_score=det_score,
            pose_tag=pose_tag,
            age_band=age_band,
            dominant_emotion="unknown",
            quality_score=quality_score,
        )

    @staticmethod
    def _pose_to_tag(face) -> str:  # noqa: ANN001
        try:
            pose = getattr(face, "pose", None)
            if pose is None:
                return "unknown"
            yaw = abs(float(pose[1]))
            if yaw < 15:
                return "frontal"
            elif yaw < 45:
                return "slight_profile"
            return "profile"
        except Exception:
            return "unknown"

    @staticmethod
    def _age_to_band(age: int | float | None) -> str:
        if age is None:
            return "unknown"
        age = int(age)
        if age < 18:
            return "under_18"
        elif age < 30:
            return "18-29"
        elif age < 45:
            return "30-44"
        elif age < 60:
            return "45-59"
        return "60+"
