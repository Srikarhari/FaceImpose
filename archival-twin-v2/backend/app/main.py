"""FastAPI application factory."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings, PROJECT_ROOT
from app.db.database import init_db, close_db
from app.services.matcher import Matcher
from app.services.book_retriever import BookRetriever

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(name)s — %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    logger.info("Starting Archival Twin backend")

    # Database
    await init_db()
    logger.info("Database initialized at %s", settings.db_path)

    # Face engine — try InsightFace, fall back to stub
    try:
        from app.services.face_engine import FaceEngine
        engine = FaceEngine()
        engine.initialize()
        if engine.is_available:
            logger.info("DeepFace engine ready (GPU: %s)", engine.gpu_available)
        else:
            raise ImportError("DeepFace loaded but not available")
    except Exception as exc:
        logger.warning("DeepFace unavailable (%s) — using degraded stub", exc)
        from app.services.face_engine_stub import FaceEngineStub
        engine = FaceEngineStub()
        engine.initialize()

    # Matcher
    matcher = Matcher()
    count = await matcher.load_embeddings()
    logger.info("Matcher loaded %d archive embeddings", count)

    # Book retriever (v2 — additive, does not affect face match)
    retriever = BookRetriever()
    chunk_count = retriever.load_chunks()
    if chunk_count > 0:
        logger.info("BookRetriever loaded %d chunks", chunk_count)
    else:
        logger.info("BookRetriever: no chunks found yet (add book text to backend/data/book/raw/)")

    # Inject into route modules
    from app.routes import health, match, retrieval, voice
    health.set_dependencies(engine, matcher)
    match.set_dependencies(engine, matcher)
    retrieval.set_dependencies(retriever)
    voice.set_dependencies(retriever)

    yield

    # --- Shutdown ---
    await close_db()
    logger.info("Backend shut down")


app = FastAPI(title="Archival Twin", version="0.1.0", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
from app.routes.health import router as health_router
from app.routes.archive import router as archive_router
from app.routes.match import router as match_router
from app.routes.retrieval import router as retrieval_router
from app.routes.voice import router as voice_router
from app.routes.tts import router as tts_router

app.include_router(health_router)
app.include_router(archive_router)
app.include_router(match_router)
app.include_router(retrieval_router)
app.include_router(voice_router)
app.include_router(tts_router)

# Serve frontend static build if it exists
frontend_dist = PROJECT_ROOT / "frontend" / "dist"
if frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
    logger.info("Serving frontend from %s", frontend_dist)
