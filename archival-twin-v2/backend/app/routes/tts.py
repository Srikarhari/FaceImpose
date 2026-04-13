"""
TTS route: POST /api/tts/speak

Returns audio/mpeg from OpenAI TTS if OPENAI_API_KEY is set.
Returns 503 otherwise (frontend falls back to browser speech).
"""

import logging
import os

from fastapi import APIRouter
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tts", tags=["tts"])

_client = None
_available = False


def _ensure_client():
    global _client, _available
    if _client is not None or _available is False and _client is None:
        # Already checked
        pass
    key = os.environ.get("OPENAI_API_KEY", "")
    if not key:
        _available = False
        return
    try:
        import openai
        _client = openai.OpenAI(api_key=key)
        _available = True
    except ImportError:
        logger.warning("openai package not installed — TTS unavailable")
        _available = False


class TTSRequest(BaseModel):
    text: str
    voice: str = "alloy"


@router.get("/status")
async def tts_status():
    _ensure_client()
    return {"available": _available}


@router.post("/speak")
async def tts_speak(req: TTSRequest):
    _ensure_client()
    if not _available or _client is None:
        return JSONResponse(status_code=503, content={"error": "TTS not configured"})

    text = req.text.strip()
    if not text:
        return JSONResponse(status_code=400, content={"error": "Empty text"})

    # Truncate to ~4096 chars (OpenAI TTS limit)
    if len(text) > 4096:
        text = text[:4096]

    try:
        response = _client.audio.speech.create(
            model="tts-1",
            voice=req.voice,
            input=text,
        )
        audio_bytes = response.content
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as exc:
        logger.error("TTS generation failed: %s", exc)
        return JSONResponse(status_code=500, content={"error": str(exc)})
