"""Health and config routes."""

from fastapi import APIRouter, Response

from app.config import settings
from app.models.schemas import ConfigResponse, HealthResponse

router = APIRouter(prefix="/api", tags=["health"])

# These are set by main.py at startup
_face_engine = None
_matcher = None


def set_dependencies(face_engine, matcher) -> None:  # noqa: ANN001
    global _face_engine, _matcher
    _face_engine = face_engine
    _matcher = matcher


@router.get("/health", response_model=HealthResponse)
async def health(response: Response) -> HealthResponse:
    engine_available = _face_engine is not None and _face_engine.is_available
    engine_name = "deepface" if engine_available else "unavailable"
    archive_count = _matcher.archive_count if _matcher else 0
    gpu = _face_engine.gpu_available if _face_engine else False

    status = "ok" if engine_available else "degraded"
    if not engine_available:
        response.status_code = 503

    return HealthResponse(
        status=status,
        face_engine=engine_name,
        archive_count=archive_count,
        gpu_available=gpu,
    )


@router.get("/config", response_model=ConfigResponse)
async def config() -> ConfigResponse:
    collections = []
    if _matcher and _matcher.archive_count > 0:
        from app.db.repository import get_collections
        collections = await get_collections()

    return ConfigResponse(
        collections=collections,
        auto_capture_enabled=False,
        capture_cooldown_ms=3000,
    )
