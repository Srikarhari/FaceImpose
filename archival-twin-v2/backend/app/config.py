"""Application settings via pydantic-settings. All paths use pathlib."""

from pathlib import Path
from pydantic_settings import BaseSettings

# Project root: archival-twin/ (two levels up from this file)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8000

    archive_dir: Path = PROJECT_ROOT / "Faces_FullArchive"
    latest_match_dir: Path = PROJECT_ROOT / "Latest_match"
    db_path: Path = PROJECT_ROOT / "backend" / "data" / "archive.db"

    face_engine: str = "insightface"
    insightface_model: str = "buffalo_l"
    insightface_det_size: str = "640,640"
    min_detection_score: float = 0.5

    cors_origins: str = "*"

    model_config = {"env_file": str(PROJECT_ROOT / "backend" / ".env"), "extra": "ignore"}

    @property
    def det_size_tuple(self) -> tuple[int, int]:
        parts = self.insightface_det_size.split(",")
        return int(parts[0].strip()), int(parts[1].strip())

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


settings = Settings()
