"""Minimal V1 seed script: scan images, detect faces, extract embeddings, insert into SQLite.

Usage (run from backend/):
    python -m cli.ingest --archive-dir ../Faces_FullArchive --collection test_collection

--archive-dir must point to the ROOT Faces_FullArchive/ directory.
--collection names a subfolder inside it (e.g. test_collection, nypl_people_of_india).
The stored local_image_path will be relative to archive-dir and INCLUDE the collection
prefix, e.g. "test_collection/photo1.jpg", so the server can resolve it correctly.

This is NOT the full V2 ingestion pipeline. It is intentionally simple:
- No incremental hash checking
- No metadata sidecar parsing
- No face crop generation
- Skips images with 0 or >1 faces
"""

import argparse
import hashlib
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def init_db(db_path: Path) -> sqlite3.Connection:
    """Open (or create) the SQLite database and ensure tables exist."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript("""
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
    """)
    conn.commit()
    return conn


def init_face_engine():
    """Initialize DeepFace. Returns the DeepFace module or exits."""
    try:
        from deepface import DeepFace  # type: ignore[import-untyped]
        # Warm up model
        dummy = np.zeros((64, 64, 3), dtype=np.uint8)
        try:
            DeepFace.represent(dummy, model_name="Facenet512",
                               detector_backend="opencv", enforce_detection=False)
        except Exception:
            pass
        return DeepFace
    except ImportError:
        print("ERROR: DeepFace is not installed.", file=sys.stderr)
        print("Install with: pip install deepface tf-keras", file=sys.stderr)
        sys.exit(1)


def scan_images(directory: Path) -> list[Path]:
    """Recursively find all image files in directory."""
    images = []
    for ext in IMAGE_EXTENSIONS:
        images.extend(directory.rglob(f"*{ext}"))
        images.extend(directory.rglob(f"*{ext.upper()}"))
    # Deduplicate (case-insensitive extensions may overlap on some OS)
    seen = set()
    unique = []
    for p in sorted(images):
        resolved = p.resolve()
        if resolved not in seen:
            seen.add(resolved)
            unique.append(p)
    return unique


def ingest(
    archive_dir: Path,
    collection: str,
    db_path: Path,
) -> None:
    collection_dir = archive_dir / collection
    print(f"Archive root: {archive_dir.resolve()}")
    print(f"Collection  : {collection}")
    print(f"Scanning    : {collection_dir.resolve()}")
    print(f"Database    : {db_path.resolve()}")
    print()

    if not collection_dir.is_dir():
        print(f"ERROR: Collection subfolder does not exist: {collection_dir.resolve()}", file=sys.stderr)
        print(f"Create it and add images: mkdir -p {collection_dir}", file=sys.stderr)
        sys.exit(1)

    # Scan the collection subfolder
    images = scan_images(collection_dir)
    if not images:
        print("No images found. Nothing to ingest.")
        return

    print(f"Found {len(images)} image(s)")
    print()

    # Init
    face_app = init_face_engine()
    conn = init_db(db_path)

    started_at = datetime.now(timezone.utc).isoformat()
    faces_found = 0
    skipped = 0
    errors = 0

    for i, img_path in enumerate(images, 1):
        # Relative path from archive ROOT (includes collection prefix)
        # e.g. "test_collection/photo1.jpg" — matches what the server expects
        rel_path = img_path.relative_to(archive_dir)
        # Use forward slashes for cross-platform consistency in the DB
        rel_path_str = rel_path.as_posix()

        print(f"[{i}/{len(images)}] {rel_path_str} ... ", end="", flush=True)

        # Read image
        bgr = cv2.imread(str(img_path))
        if bgr is None:
            print("SKIP (unreadable)")
            errors += 1
            continue

        h, w = bgr.shape[:2]
        if h < 64 or w < 64:
            print("SKIP (too small)")
            skipped += 1
            continue

        # Detect faces + extract embedding via DeepFace
        try:
            results = face_app.represent(
                bgr,
                model_name="Facenet512",
                detector_backend="opencv",
                enforce_detection=True,
            )
        except ValueError:
            print("SKIP (no face)")
            skipped += 1
            continue

        if len(results) == 0:
            print("SKIP (no face)")
            skipped += 1
            continue

        if len(results) > 1:
            print(f"SKIP ({len(results)} faces)")
            skipped += 1
            continue

        face = results[0]
        det_score = float(face.get("face_confidence", 0.0))
        if det_score < 0.5:
            print(f"SKIP (low confidence {det_score:.2f})")
            skipped += 1
            continue

        # Bounding box
        region = face.get("facial_area", {})
        bbox_x = float(region.get("x", 0))
        bbox_y = float(region.get("y", 0))
        bbox_w = float(region.get("w", 0))
        bbox_h = float(region.get("h", 0))

        # Embedding (L2 normalize)
        embedding = np.array(face["embedding"], dtype=np.float32)
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm
        embedding_blob = embedding.tobytes()

        # File hash
        file_hash = sha256_file(img_path)

        # Insert
        try:
            conn.execute(
                """INSERT OR REPLACE INTO archive_faces
                   (source_item_id, source_collection, local_image_path, file_hash,
                    embedding, face_bbox_x, face_bbox_y, face_bbox_w, face_bbox_h,
                    detection_score, image_width, image_height, processing_status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')""",
                (
                    f"{collection}_{img_path.stem}",
                    collection,
                    rel_path_str,
                    file_hash,
                    embedding_blob,
                    bbox_x, bbox_y, bbox_w, bbox_h,
                    det_score,
                    w, h,
                ),
            )
            conn.commit()
            faces_found += 1
            print(f"OK (score={det_score:.2f})")
        except Exception as exc:
            print(f"ERROR ({exc})")
            errors += 1

    # Log the run
    completed_at = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """INSERT INTO ingestion_runs
           (started_at, completed_at, source_collection, total_files,
            faces_found, skipped, errors, engine)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'insightface')""",
        (started_at, completed_at, collection, len(images),
         faces_found, skipped, errors),
    )
    conn.commit()
    conn.close()

    print()
    print(f"Done. {faces_found} ingested, {skipped} skipped, {errors} errors out of {len(images)} total.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Archival Twin — Minimal V1 image ingestion",
    )
    parser.add_argument(
        "--archive-dir",
        type=Path,
        required=True,
        help="Path to the root Faces_FullArchive/ directory (NOT the collection subfolder)",
    )
    parser.add_argument(
        "--collection",
        type=str,
        required=True,
        help="Collection name (e.g. nypl_people_of_india, bm_portman, test_collection)",
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "data" / "archive.db",
        help="Path to SQLite database (default: backend/data/archive.db)",
    )
    args = parser.parse_args()

    archive_dir = args.archive_dir.resolve()
    if not archive_dir.is_dir():
        print(f"ERROR: Archive directory does not exist: {archive_dir}", file=sys.stderr)
        sys.exit(1)

    ingest(archive_dir, args.collection, args.db.resolve())


if __name__ == "__main__":
    main()
