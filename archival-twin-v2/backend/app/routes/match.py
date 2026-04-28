"""Match routes: POST /api/match, GET /api/latest-match, GET /api/match/{match_id}."""

from __future__ import annotations

import logging
import os
import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse

from app.config import settings
from app.db import repository
from app.models.schemas import (
    MatchError,
    MatchRequest,
    MatchResponse,
    TwinMetadata,
    TwinResult,
)
from app.services.caption_generator import generate_caption, get_disclosure_text
from app.services.face_engine import MultipleFacesDetected, NoFaceDetected
from app.services.face_engine_stub import FaceEngineUnavailable
from app.utils.image import ImageDecodeError, bgr_to_rgb, decode_base64_image, enhance_contrast, resize_for_detection
from app.utils.timing import StageTimer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["match"])

_face_engine = None
_matcher = None

LATEST_MATCH_FILENAME = "latest_match.jpg"


def set_dependencies(face_engine, matcher) -> None:  # noqa: ANN001
    global _face_engine, _matcher
    _face_engine = face_engine
    _matcher = matcher


@router.post("/match", response_model=MatchResponse)
async def post_match(req: MatchRequest):
    timer = StageTimer()

    # --- Engine check ---
    if _face_engine is None or not _face_engine.is_available:
        return JSONResponse(
            status_code=503,
            content=MatchError(
                error="engine_unavailable",
                detail=(
                    "Face engine is not available. InsightFace is not installed or failed to load. "
                    "Install with: pip install insightface onnxruntime"
                ),
            ).model_dump(),
        )

    # --- Decode image ---
    try:
        with timer.measure("image_decoded"):
            image_bgr = decode_base64_image(req.image)
    except ImageDecodeError as exc:
        return JSONResponse(
            status_code=422,
            content=MatchError(error="invalid_image", detail=str(exc)).model_dump(),
        )

    # --- Detect face + extract embedding ---
    image_rgb = bgr_to_rgb(enhance_contrast(resize_for_detection(image_bgr)))

    try:
        with timer.measure("face_detected"):
            face_result = _face_engine.detect_and_embed(image_rgb)
    except NoFaceDetected as exc:
        return JSONResponse(
            status_code=422,
            content=MatchError(error="no_face_detected", detail=str(exc)).model_dump(),
        )
    except MultipleFacesDetected as exc:
        return JSONResponse(
            status_code=422,
            content=MatchError(
                error="multiple_faces",
                detail=str(exc),
                face_count=exc.count,
            ).model_dump(),
        )
    except FaceEngineUnavailable as exc:
        return JSONResponse(
            status_code=503,
            content=MatchError(error="engine_unavailable", detail=str(exc)).model_dump(),
        )

    # Record pose + features as separate stage timings (they happen inside detect_and_embed)
    timer.record("pose_estimated", 0)
    timer.record("features_extracted", 0)

    # --- Query archive ---
    try:
        with timer.measure("archive_queried"):
            match_result = _matcher.find_closest(face_result.embedding)
    except RuntimeError as exc:
        return JSONResponse(
            status_code=422,
            content=MatchError(error="archive_empty", detail=str(exc)).model_dump(),
        )

    # --- Fetch full record ---
    with timer.measure("twin_found"):
        face_record = await repository.get_face_by_id(match_result.face_id)

    if face_record is None:
        return JSONResponse(
            status_code=500,
            content=MatchError(
                error="record_missing",
                detail="Matched face record not found in database.",
            ).model_dump(),
        )

    # --- Save to Latest_match (atomic overwrite) ---
    source_path = settings.archive_dir / face_record.local_image_path
    if not source_path.is_file():
        logger.error("Matched archive file missing: %s", source_path)
        return JSONResponse(
            status_code=500,
            content=MatchError(
                error="file_missing",
                detail=f"Matched archive image not found on disk: {face_record.local_image_path}",
            ).model_dump(),
        )

    latest_dir = settings.latest_match_dir
    latest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = latest_dir / LATEST_MATCH_FILENAME

    try:
        fd, tmp_path = tempfile.mkstemp(
            suffix=".jpg", dir=str(latest_dir)
        )
        os.close(fd)
        shutil.copy2(str(source_path), tmp_path)
        os.replace(tmp_path, str(dest_path))
    except OSError as exc:
        logger.error("Failed to write latest match: %s", exc)
        # Clean up temp file if it exists
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        return JSONResponse(
            status_code=500,
            content=MatchError(
                error="write_failure",
                detail=f"Could not save latest match image: {exc}",
            ).model_dump(),
        )

    # --- Generate caption from filename ---
    _stem = Path(face_record.local_image_path).stem
    generated_caption = _stem.replace("_", " ").strip()
    disclosure_text = get_disclosure_text()

    # --- Log match ---
    match_id = await repository.log_match(
        matched_face_id=match_result.face_id,
        similarity_score=match_result.similarity_score,
        confidence_label=match_result.confidence_label,
        pose_tag=face_result.pose_tag,
        total_duration_ms=int(timer.total_ms),
    )

    # --- Build response ---
    twin = TwinResult(
        match_id=match_id,
        source_item_id=face_record.source_item_id,
        filename=face_record.local_image_path,
        image_url=f"/api/archive/images/{face_record.local_image_path}",
        latest_match_url="/api/latest-match",
        similarity_score=match_result.similarity_score,
        confidence_label=match_result.confidence_label,
        pose_tag=face_result.pose_tag,
        age_band=face_result.age_band,
        dominant_emotion=face_result.dominant_emotion,
        original_caption=face_record.original_caption,
        generated_caption=generated_caption,
        metadata=TwinMetadata(
            source_collection=face_record.source_collection,
            title=face_record.title,
            creator_photographer=face_record.creator_photographer,
            date_text=face_record.date_text,
            place_text=face_record.place_text,
            source_url=face_record.source_url,
            rights_text=face_record.rights_text,
        ),
    )

    return MatchResponse(
        matched=True,
        twin=twin,
        disclosure_text=disclosure_text,
        stages=timer.stages,
        total_duration_ms=timer.total_ms,
    )


@router.get("/latest-match")
async def get_latest_match() -> FileResponse:
    """Serve the most recent match image."""
    path = settings.latest_match_dir / LATEST_MATCH_FILENAME
    if not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="No match has been performed yet.",
        )
    return FileResponse(path, media_type="image/jpeg")


@router.get("/match/{match_id}")
async def get_match(match_id: int) -> dict:
    """Retrieve a historical match by ID."""
    row = await repository.get_match_by_id(match_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Match not found")
    return dict(row)
