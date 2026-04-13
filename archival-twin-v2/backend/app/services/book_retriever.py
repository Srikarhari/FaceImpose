"""
Book text retrieval service.

Loads pre-chunked book text from backend/data/book/chunks/ and provides
keyword search via a lightweight in-memory TF-IDF-style scorer.

No external dependencies beyond the Python stdlib.
Cross-platform: pathlib only.
"""

import json
import logging
import math
import re
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Resolve relative to this file so it works on any OS
SERVICE_DIR = Path(__file__).resolve().parent
DATA_DIR = SERVICE_DIR.parent.parent / "data" / "book"
CHUNKS_DIR = DATA_DIR / "chunks"

TOKEN_RE = re.compile(r"[a-z0-9]+")


def tokenise(text: str) -> list[str]:
    """Lowercase + alphanumeric tokenisation. No external deps."""
    return TOKEN_RE.findall(text.lower())


class BookRetriever:
    """Retrieve relevant book chunks given a query string."""

    def __init__(self) -> None:
        self.chunks: list[dict] = []
        self._tokenised: list[list[str]] = []
        self._tf: list[dict[str, int]] = []
        self._df: dict[str, int] = {}
        self._loaded = False

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------
    def load_chunks(self, chunks_dir: Optional[Path] = None) -> int:
        """Load every *.json under chunks_dir and build the search index."""
        target = chunks_dir or CHUNKS_DIR
        self.chunks = []
        self._tokenised = []
        self._tf = []
        self._df = {}

        if not target.is_dir():
            logger.warning("Chunks directory does not exist: %s", target)
            self._loaded = True
            return 0

        for chunk_file in sorted(target.glob("*.json")):
            try:
                data = json.loads(chunk_file.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                logger.warning("Failed to parse %s: %s", chunk_file, exc)
                continue
            if not isinstance(data, list):
                logger.warning("Unexpected format in %s, skipping", chunk_file)
                continue
            self.chunks.extend(data)

        # Build the index
        for chunk in self.chunks:
            tokens = tokenise(chunk.get("text", ""))
            self._tokenised.append(tokens)
            tf: dict[str, int] = {}
            for tok in tokens:
                tf[tok] = tf.get(tok, 0) + 1
            self._tf.append(tf)
            for tok in tf:
                self._df[tok] = self._df.get(tok, 0) + 1

        self._loaded = True
        logger.info(
            "Loaded %d chunks from %s (vocab=%d)",
            len(self.chunks),
            target,
            len(self._df),
        )
        return len(self.chunks)

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------
    @property
    def is_ready(self) -> bool:
        return self._loaded and len(self.chunks) > 0

    @property
    def sources(self) -> list[str]:
        """Distinct source filenames present in the loaded index."""
        return sorted({c.get("source_file", "") for c in self.chunks if c.get("source_file")})

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------
    def search(self, query: str, top_k: int = 5) -> list[dict]:
        """Return the top-k most relevant chunks for the query.

        Scoring: sum over query tokens of `tf * log((N + 1) / (df + 1))`.
        Empty queries or queries with no overlap return [].
        """
        if not self.is_ready:
            return []

        q_tokens = tokenise(query)
        if not q_tokens:
            return []

        n = len(self.chunks)
        scores: list[tuple[float, int]] = []
        for idx, tf in enumerate(self._tf):
            score = 0.0
            for tok in q_tokens:
                if tok in tf:
                    df = self._df.get(tok, 1)
                    idf = math.log((n + 1) / (df + 1)) + 1.0
                    score += tf[tok] * idf
            if score > 0:
                scores.append((score, idx))

        if not scores:
            return []

        scores.sort(key=lambda x: x[0], reverse=True)
        return [
            {"chunk": self.chunks[idx], "score": float(score)}
            for score, idx in scores[:top_k]
        ]
