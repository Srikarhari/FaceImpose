"""SQLite connection management via aiosqlite."""

from typing import Optional

import aiosqlite

from app.config import settings

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS archive_faces (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    source_item_id        TEXT    UNIQUE,
    title                 TEXT,
    original_caption      TEXT,
    creator_photographer  TEXT,
    date_text             TEXT,
    place_text            TEXT,
    source_collection     TEXT    NOT NULL,
    source_url            TEXT,
    rights_text           TEXT,
    local_image_path      TEXT    NOT NULL UNIQUE,
    face_crop_path        TEXT,
    file_hash             TEXT    NOT NULL,
    embedding             BLOB    NOT NULL,
    face_bbox_x           REAL    NOT NULL,
    face_bbox_y           REAL    NOT NULL,
    face_bbox_w           REAL    NOT NULL,
    face_bbox_h           REAL    NOT NULL,
    detection_score       REAL    NOT NULL,
    image_width           INTEGER NOT NULL,
    image_height          INTEGER NOT NULL,
    processing_status     TEXT    NOT NULL DEFAULT 'completed',
    notes_warnings        TEXT,
    ingested_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_file_hash ON archive_faces(file_hash);
CREATE INDEX IF NOT EXISTS idx_source_collection ON archive_faces(source_collection);
CREATE INDEX IF NOT EXISTS idx_processing_status ON archive_faces(processing_status);

CREATE TABLE IF NOT EXISTS ingestion_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at      TEXT    NOT NULL,
    completed_at    TEXT,
    source_collection TEXT  NOT NULL,
    total_files     INTEGER NOT NULL,
    faces_found     INTEGER,
    skipped         INTEGER,
    errors          INTEGER,
    engine          TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS match_log (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    matched_face_id  INTEGER NOT NULL REFERENCES archive_faces(id),
    similarity_score REAL    NOT NULL,
    confidence_label TEXT    NOT NULL,
    pose_tag         TEXT,
    total_duration_ms INTEGER NOT NULL,
    matched_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
"""

_db: Optional[aiosqlite.Connection] = None


async def get_db() -> aiosqlite.Connection:
    global _db
    if _db is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _db


async def init_db() -> None:
    global _db
    db_path = settings.db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)
    _db = await aiosqlite.connect(str(db_path))
    _db.row_factory = aiosqlite.Row
    await _db.executescript(SCHEMA_SQL)
    await _db.commit()


async def close_db() -> None:
    global _db
    if _db is not None:
        await _db.close()
        _db = None
