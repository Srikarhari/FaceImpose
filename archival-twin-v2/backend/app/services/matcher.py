"""Cosine similarity matcher against the archive embedding matrix."""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np

from app.db import repository

logger = logging.getLogger(__name__)


@dataclass
class MatchResult:
    face_id: int
    local_image_path: str
    similarity_score: float
    confidence_label: str


class Matcher:
    """Brute-force cosine similarity search over archive embeddings."""

    def __init__(self) -> None:
        self._matrix: np.ndarray | None = None  # (N, 512) float32
        self._face_ids: list[int] = []
        self._image_paths: list[str] = []

    async def load_embeddings(self) -> int:
        """Load all embeddings from SQLite into memory. Returns count."""
        rows = await repository.get_all_embeddings()
        if not rows:
            self._matrix = None
            self._face_ids = []
            self._image_paths = []
            logger.warning("No embeddings loaded — archive is empty")
            return 0

        self._face_ids = [r[0] for r in rows]
        self._image_paths = [r[1] for r in rows]
        embeddings = [r[2] for r in rows]
        self._matrix = np.stack(embeddings).astype(np.float32)

        # Normalize rows to unit length for cosine similarity
        norms = np.linalg.norm(self._matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        self._matrix = self._matrix / norms

        logger.info("Loaded %d archive embeddings", len(self._face_ids))
        return len(self._face_ids)

    @property
    def archive_count(self) -> int:
        return len(self._face_ids)

    def find_closest(self, query_embedding: np.ndarray) -> MatchResult:
        """Find the single closest archive face to the query embedding.

        Raises:
            RuntimeError: If archive is empty.
        """
        if self._matrix is None or len(self._face_ids) == 0:
            raise RuntimeError("Archive is empty. Ingest images before matching.")

        # Normalize query
        query = query_embedding.astype(np.float32).flatten()
        norm = np.linalg.norm(query)
        if norm > 0:
            query = query / norm

        # Cosine similarity = dot product of unit vectors
        similarities = self._matrix @ query
        best_idx = int(np.argmax(similarities))
        score = float(similarities[best_idx])

        return MatchResult(
            face_id=self._face_ids[best_idx],
            local_image_path=self._image_paths[best_idx],
            similarity_score=round(score, 4),
            confidence_label=self._score_to_confidence(score),
        )

    @staticmethod
    def _score_to_confidence(score: float) -> str:
        if score >= 0.6:
            return "high"
        elif score >= 0.4:
            return "medium"
        elif score >= 0.2:
            return "low"
        else:
            return "very_low"
