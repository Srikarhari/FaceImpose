"""DeepFace wrapper — face detection, embedding, and analysis."""

from __future__ import annotations

import logging
from dataclasses import dataclass

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


class FaceEngine:
    def __init__(self) -> None:
        self._available = False

    def initialize(self) -> None:
        try:
            from deepface import DeepFace  # type: ignore[import-untyped]
            self._df = DeepFace
            # Warm up models by running on a tiny dummy image
            dummy = np.zeros((64, 64, 3), dtype=np.uint8)
            try:
                self._df.represent(dummy, model_name="Facenet512",
                                   detector_backend="opencv", enforce_detection=False)
            except Exception:
                pass
            self._available = True
            logger.info("DeepFace engine initialized")
        except ImportError:
            logger.error("DeepFace is not installed. pip install deepface tf-keras")

    @property
    def is_available(self) -> bool:
        return self._available

    @property
    def gpu_available(self) -> bool:
        if not self._available:
            return False
        try:
            import tensorflow as tf  # type: ignore[import-untyped]
            return len(tf.config.list_physical_devices("GPU")) > 0
        except Exception:
            return False

    def detect_and_embed(self, image_rgb: np.ndarray) -> FaceResult:
        if not self._available:
            raise RuntimeError("Face engine is not available")

        image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)

        # --- Detection + embedding ---
        try:
            results = self._df.represent(
                image_bgr,
                model_name="Facenet512",
                detector_backend="opencv",
                enforce_detection=True,
            )
        except ValueError:
            raise NoFaceDetected("No face could be detected in the submitted image")

        if len(results) == 0:
            raise NoFaceDetected("No face could be detected in the submitted image")
        if len(results) > 1:
            raise MultipleFacesDetected(len(results))

        face = results[0]
        embedding = np.array(face["embedding"], dtype=np.float32)
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm

        region = face.get("facial_area", {})
        bbox = (
            float(region.get("x", 0)),
            float(region.get("y", 0)),
            float(region.get("w", 0)),
            float(region.get("h", 0)),
        )
        det_score = float(face.get("face_confidence", 0.0))

        if det_score < settings.min_detection_score:
            raise NoFaceDetected(
                f"Face detected but confidence too low ({det_score:.2f})"
            )

        # --- Age + emotion analysis (no protected traits) ---
        age_band = "unknown"
        dominant_emotion = "unknown"
        try:
            analysis = self._df.analyze(
                image_bgr,
                actions=["age", "emotion"],
                detector_backend="skip",
                enforce_detection=False,
            )
            if analysis:
                a = analysis[0] if isinstance(analysis, list) else analysis
                age_band = self._age_to_band(a.get("age"))
                dominant_emotion = a.get("dominant_emotion", "unknown")
        except Exception as exc:
            logger.debug("Analysis fallback: %s", exc)

        return FaceResult(
            embedding=embedding,
            bbox=bbox,
            detection_score=det_score,
            pose_tag="unknown",
            age_band=age_band,
            dominant_emotion=dominant_emotion,
        )

    @staticmethod
    def _age_to_band(age: int | None) -> str:
        if age is None:
            return "unknown"
        if age < 18:
            return "under_18"
        elif age < 30:
            return "18-29"
        elif age < 45:
            return "30-44"
        elif age < 60:
            return "45-59"
        return "60+"
