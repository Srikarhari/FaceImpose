"""Data access layer for archive_faces and related tables."""

from dataclasses import dataclass

import numpy as np

from app.db.database import get_db


@dataclass
class ArchiveFace:
    id: int
    source_item_id: str | None
    title: str | None
    original_caption: str | None
    creator_photographer: str | None
    date_text: str | None
    place_text: str | None
    source_collection: str
    source_url: str | None
    rights_text: str | None
    local_image_path: str
    face_crop_path: str | None
    embedding: np.ndarray
    detection_score: float


async def get_all_embeddings() -> list[tuple[int, str, np.ndarray]]:
    """Return (id, local_image_path, embedding) for all completed faces."""
    db = await get_db()
    cursor = await db.execute(
        "SELECT id, local_image_path, embedding FROM archive_faces "
        "WHERE processing_status = 'completed'"
    )
    rows = await cursor.fetchall()
    result = []
    for row in rows:
        emb = np.frombuffer(row["embedding"], dtype=np.float32).copy()
        result.append((row["id"], row["local_image_path"], emb))
    return result


async def get_face_by_id(face_id: int) -> ArchiveFace | None:
    """Return full record for a single face."""
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM archive_faces WHERE id = ?", (face_id,)
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return ArchiveFace(
        id=row["id"],
        source_item_id=row["source_item_id"],
        title=row["title"],
        original_caption=row["original_caption"],
        creator_photographer=row["creator_photographer"],
        date_text=row["date_text"],
        place_text=row["place_text"],
        source_collection=row["source_collection"],
        source_url=row["source_url"],
        rights_text=row["rights_text"],
        local_image_path=row["local_image_path"],
        face_crop_path=row["face_crop_path"],
        embedding=np.frombuffer(row["embedding"], dtype=np.float32).copy(),
        detection_score=row["detection_score"],
    )


async def get_archive_count() -> int:
    db = await get_db()
    cursor = await db.execute(
        "SELECT COUNT(*) as cnt FROM archive_faces WHERE processing_status = 'completed'"
    )
    row = await cursor.fetchone()
    return row["cnt"]


async def get_collections() -> list[str]:
    db = await get_db()
    cursor = await db.execute(
        "SELECT DISTINCT source_collection FROM archive_faces ORDER BY source_collection"
    )
    rows = await cursor.fetchall()
    return [row["source_collection"] for row in rows]


async def log_match(
    matched_face_id: int,
    similarity_score: float,
    confidence_label: str,
    pose_tag: str | None,
    total_duration_ms: int,
) -> int:
    """Log a match result. Returns the match_log id."""
    db = await get_db()
    cursor = await db.execute(
        "INSERT INTO match_log (matched_face_id, similarity_score, confidence_label, "
        "pose_tag, total_duration_ms) VALUES (?, ?, ?, ?, ?)",
        (matched_face_id, similarity_score, confidence_label, pose_tag, total_duration_ms),
    )
    await db.commit()
    return cursor.lastrowid


async def get_match_by_id(match_id: int) -> dict | None:
    """Return a match_log row joined with archive_faces."""
    db = await get_db()
    cursor = await db.execute(
        "SELECT m.*, a.local_image_path, a.source_item_id, a.title, "
        "a.original_caption, a.source_collection, a.creator_photographer, "
        "a.date_text, a.place_text, a.source_url, a.rights_text "
        "FROM match_log m JOIN archive_faces a ON m.matched_face_id = a.id "
        "WHERE m.id = ?",
        (match_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return dict(row)
