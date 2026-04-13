"""Generate critical/satirical captions for matched archive items.

Rules:
- Institutional, confident, critical tone
- May discuss resemblance, archive, machine vision
- NEVER assigns race, ethnicity, caste, nationality, religion, or any protected trait
- NEVER makes factual identity claims about the visitor
"""

from __future__ import annotations

import random

from app.db.repository import ArchiveFace

# Templates that critique classification systems and machine vision.
# Each is a format string that may reference: score, collection, date, title.
_TEMPLATES = [
    (
        "The system has identified a geometric correspondence between your facial "
        "structure and this catalogued subject (confidence: {score_pct}%). This match "
        "is a product of linear algebra applied to flesh — a confidence score dressed "
        "as certainty. The archive does not know this person. It filed them."
    ),
    (
        "A {score_pct}% structural resemblance has been computed. The archive from "
        "which this image was retrieved was assembled under the logic of colonial "
        "taxonomy — a system that believed measurement could contain a person. "
        "The system remains confident. The system is always confident."
    ),
    (
        "Your face has been reduced to 512 floating-point numbers and compared against "
        "{collection}. The closest vector has been retrieved. The machine does not "
        "understand resemblance. It understands distance."
    ),
    (
        "This match was produced by cosine similarity — the angle between two points "
        "in 512-dimensional space. One point is you. The other was catalogued "
        "{date_clause}. The archive assigned it a number. The system assigned it to you."
    ),
    (
        "ARCHIVAL MATCH LOCATED. Geometric correspondence: {score_pct}%. "
        "The system has performed its function. It has found a face that, by its "
        "mathematics, resembles yours. It cannot tell you what this means. "
        "It was never designed to."
    ),
]

_DISCLOSURE = (
    "CLASSIFICATION NOTICE — This system identifies structural resemblance between "
    "facial geometries. It does not determine identity, origin, affiliation, or "
    "category. The archive it searches was assembled by institutions whose taxonomies "
    "reflected the power structures of their era. The match you see is a product of "
    "mathematics, not meaning."
)


def generate_caption(face: ArchiveFace, similarity_score: float) -> str:
    """Generate a critical caption for the matched archival face."""
    score_pct = round(similarity_score * 100, 1)
    collection = face.source_collection or "an unnamed collection"

    if face.date_text:
        date_clause = f"circa {face.date_text}"
    else:
        date_clause = "at an unknown date"

    template = random.choice(_TEMPLATES)
    return template.format(
        score_pct=score_pct,
        collection=collection,
        date_clause=date_clause,
        title=face.title or "Untitled",
    )


def get_disclosure_text() -> str:
    """Return the standard disclosure text."""
    return _DISCLOSURE
