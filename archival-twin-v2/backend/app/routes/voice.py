"""
Voice generation API route.

POST /api/voice/generate — accepts match metadata + retrieved passages,
returns a grounded archival voice response.

POST /api/voice/auto — accepts match result, performs retrieval + generation
in one call (used by frontend after a face match).
"""

import logging
from fastapi import APIRouter
from pydantic import BaseModel

from app.services.book_retriever import BookRetriever
from app.services.voice_generator import generate_voice, is_available as voice_is_available

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/voice", tags=["voice"])

_retriever: BookRetriever | None = None


def set_dependencies(retriever: BookRetriever) -> None:
    global _retriever
    _retriever = retriever


# ----------------------------------------------------------------------
# Models
# ----------------------------------------------------------------------
class MatchMetadata(BaseModel):
    filename: str | None = None
    title: str | None = None
    generated_caption: str | None = None
    source_collection: str | None = None
    place_text: str | None = None
    date_text: str | None = None
    original_caption: str | None = None


class PassageInput(BaseModel):
    text: str
    source_file: str = ""
    score: float = 0.0


class VoiceGenerateRequest(BaseModel):
    metadata: MatchMetadata
    passages: list[PassageInput]


class VoiceAutoRequest(BaseModel):
    """Minimal input from frontend: just the match metadata.
    Retrieval + generation happens server-side."""
    metadata: MatchMetadata
    top_k: int = 5


class RetrievedPassage(BaseModel):
    text: str
    source_file: str
    score: float
    section: str | None = None
    page: int | None = None


class VoiceResponse(BaseModel):
    generated_text: str
    mode: str  # "api" or "fallback"
    grounded: bool
    disclaimer: str
    query_used: str | None = None
    passages: list[RetrievedPassage] = []
    error: str | None = None


class VoiceStatusResponse(BaseModel):
    api_available: bool
    retrieval_ready: bool


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
def _build_retrieval_query(meta: MatchMetadata) -> str:
    """Build the best search query from available metadata."""
    parts: list[str] = []

    # Filename stem is often the richest source (contains name, tribe, age)
    if meta.filename:
        # Strip path and extension, replace underscores
        import os
        stem = os.path.splitext(os.path.basename(meta.filename))[0]
        stem = stem.replace("_", " ")
        parts.append(stem)

    if meta.title and meta.title not in " ".join(parts):
        parts.append(meta.title)

    if meta.original_caption:
        parts.append(meta.original_caption)

    if meta.source_collection:
        parts.append(meta.source_collection)

    if meta.place_text:
        parts.append(meta.place_text)

    query = " ".join(parts).strip()
    if not query and meta.generated_caption:
        query = meta.generated_caption

    return query or "Andaman Islands archival photograph"


# ----------------------------------------------------------------------
# Endpoints
# ----------------------------------------------------------------------
@router.get("/status", response_model=VoiceStatusResponse)
async def voice_status() -> VoiceStatusResponse:
    return VoiceStatusResponse(
        api_available=voice_is_available(),
        retrieval_ready=_retriever is not None and _retriever.is_ready,
    )


@router.post("/generate", response_model=VoiceResponse)
async def voice_generate(req: VoiceGenerateRequest) -> VoiceResponse:
    """Generate voice from explicitly provided passages."""
    meta_dict = req.metadata.model_dump()
    passages = [p.model_dump() for p in req.passages]

    result = generate_voice(meta_dict, passages)
    return VoiceResponse(
        generated_text=result["generated_text"],
        mode=result["mode"],
        grounded=result["grounded"],
        disclaimer=result["disclaimer"],
        error=result.get("error"),
    )


@router.post("/auto", response_model=VoiceResponse)
async def voice_auto(req: VoiceAutoRequest) -> VoiceResponse:
    """Auto-retrieve + generate in one call after a face match."""
    meta_dict = req.metadata.model_dump()
    query = _build_retrieval_query(req.metadata)

    # Retrieve passages
    retrieved_passages: list[RetrievedPassage] = []
    passage_dicts: list[dict] = []

    if _retriever and _retriever.is_ready:
        raw = _retriever.search(query, top_k=req.top_k)
        for r in raw:
            chunk = r["chunk"]
            rp = RetrievedPassage(
                text=chunk.get("text", ""),
                source_file=chunk.get("source_file", ""),
                score=r["score"],
                section=chunk.get("section"),
                page=chunk.get("page"),
            )
            retrieved_passages.append(rp)
            passage_dicts.append({
                "text": chunk.get("text", ""),
                "source_file": chunk.get("source_file", ""),
                "score": r["score"],
            })

    # Generate
    result = generate_voice(meta_dict, passage_dicts)

    return VoiceResponse(
        generated_text=result["generated_text"],
        mode=result["mode"],
        grounded=result["grounded"],
        disclaimer=result["disclaimer"],
        query_used=query,
        passages=retrieved_passages,
        error=result.get("error"),
    )
