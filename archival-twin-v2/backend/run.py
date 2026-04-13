"""Entry point for the Archival Twin backend server."""

import uvicorn

from app.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        workers=1,
        log_level="info",
    )
