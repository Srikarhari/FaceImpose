"""
Retrieval API routes for book-text search.

These endpoints are additive — they do not modify the existing
face-match flow.
"""

import logging
from fastapi import APIRouter
from pydantic import BaseModel

from app.services.book_retriever import BookRetriever

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/retrieval", tags=["retrieval"])

# Module-level dependency — injected at startup
_retriever: BookRetriever | None = None


def set_dependencies(retriever: BookRetriever) -> None:
    global _retriever
    _retriever = retriever


# ----------------------------------------------------------------------
# Models
# ----------------------------------------------------------------------
class RetrievalRequest(BaseModel):
    query: str
    top_k: int = 5


class RetrievalHit(BaseModel):
    id: str
    source_file: str
    chunk_index: int
    text: str
    word_count: int
    section: str | None = None
    page: int | None = None
    score: float


class RetrievalSearchResponse(BaseModel):
    success: bool
    total_chunks: int
    query: str
    results: list[RetrievalHit]


class RetrievalStatusResponse(BaseModel):
    ready: bool
    total_chunks: int
    sources: list[str]


# ----------------------------------------------------------------------
# Endpoints
# ----------------------------------------------------------------------
@router.get("/status", response_model=RetrievalStatusResponse)
async def retrieval_status() -> RetrievalStatusResponse:
    """Report whether the book retrieval index is loaded."""
    if _retriever is None:
        return RetrievalStatusResponse(ready=False, total_chunks=0, sources=[])
    return RetrievalStatusResponse(
        ready=_retriever.is_ready,
        total_chunks=len(_retriever.chunks),
        sources=_retriever.sources,
    )


@router.post("/search", response_model=RetrievalSearchResponse)
async def search_book(req: RetrievalRequest) -> RetrievalSearchResponse:
    """Search book chunks for passages relevant to the query."""
    if _retriever is None or not _retriever.is_ready:
        return RetrievalSearchResponse(
            success=False,
            total_chunks=0,
            query=req.query,
            results=[],
        )

    raw_results = _retriever.search(req.query, top_k=req.top_k)
    hits: list[RetrievalHit] = []
    for r in raw_results:
        chunk = r["chunk"]
        hits.append(
            RetrievalHit(
                id=chunk.get("id", ""),
                source_file=chunk.get("source_file", ""),
                chunk_index=chunk.get("chunk_index", 0),
                text=chunk.get("text", ""),
                word_count=chunk.get("word_count", 0),
                section=chunk.get("section"),
                page=chunk.get("page"),
                score=r["score"],
            )
        )

    return RetrievalSearchResponse(
        success=True,
        total_chunks=len(_retriever.chunks),
        query=req.query,
        results=hits,
    )
