"""Archive routes: serve images and stats."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import settings

router = APIRouter(prefix="/api", tags=["archive"])


@router.get("/archive/images/{filename:path}")
async def get_archive_image(filename: str) -> FileResponse:
    """Serve an image from Faces_FullArchive/ with path-traversal protection."""
    archive_dir = settings.archive_dir.resolve()
    requested = (archive_dir / filename).resolve()

    # Path traversal guard
    if not str(requested).startswith(str(archive_dir)):
        raise HTTPException(status_code=400, detail="Invalid path")

    if not requested.is_file():
        raise HTTPException(status_code=404, detail="Image not found")

    suffix = requested.suffix.lower()
    media_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
    }
    media_type = media_types.get(suffix, "application/octet-stream")
    return FileResponse(requested, media_type=media_type)
