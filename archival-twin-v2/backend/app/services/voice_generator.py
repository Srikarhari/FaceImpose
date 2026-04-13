"""
Grounded voice generation service.

Takes matched archival metadata + retrieved text passages and produces
a short archival-style response grounded strictly in the source text.

Uses the Anthropic API if ANTHROPIC_API_KEY is set; otherwise falls back
to a simple template that summarises the excerpts without generation.
"""

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

_client = None
_api_available = False

SYSTEM_PROMPT = """\
You are an archival narrator. You have been given excerpts from a historical \
text related to a matched archival photograph. Your task is to compose a short \
response (60–140 words) in an observational, archival tone inspired by the \
source text.

Rules:
- Ground every claim in the provided excerpts. Do not invent facts.
- Do not present your response as a direct historical quotation unless you are \
  quoting verbatim from the excerpts (use quotation marks for actual quotes).
- Write in third person, past tense.
- Maintain a measured, documentary register.
- If the excerpts are thin or vague, keep your response brief and cautious \
  rather than speculating.
- Never assign identity, ethnicity, religion, or nationality beyond what the \
  source text explicitly states.
- Do not editorialize or moralize. Let the source material speak.
"""


def _ensure_client():
    """Lazily initialize the Anthropic client."""
    global _client, _api_available
    if _client is not None:
        return

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        logger.info("ANTHROPIC_API_KEY not set — voice generation will use fallback mode")
        _api_available = False
        return

    try:
        import anthropic
        _client = anthropic.Anthropic(api_key=api_key)
        _api_available = True
        logger.info("Anthropic client initialized for voice generation")
    except ImportError:
        logger.warning("anthropic package not installed — voice generation will use fallback mode")
        _api_available = False


def is_available() -> bool:
    _ensure_client()
    return _api_available


def _build_user_prompt(
    metadata: dict,
    passages: list[dict],
) -> str:
    """Build the user prompt from metadata and retrieved passages."""
    parts = ["ARCHIVAL MATCH CONTEXT:"]

    if metadata.get("filename"):
        parts.append(f"Photograph: {metadata['filename']}")
    if metadata.get("title"):
        parts.append(f"Title: {metadata['title']}")
    if metadata.get("source_collection"):
        parts.append(f"Collection: {metadata['source_collection']}")
    if metadata.get("place_text"):
        parts.append(f"Place: {metadata['place_text']}")
    if metadata.get("date_text"):
        parts.append(f"Date: {metadata['date_text']}")
    if metadata.get("generated_caption"):
        parts.append(f"Caption: {metadata['generated_caption']}")

    parts.append("")
    parts.append("RETRIEVED ARCHIVAL EXCERPTS:")
    for i, p in enumerate(passages, 1):
        text = p.get("text", "").strip()
        source = p.get("source_file", "unknown")
        if text:
            parts.append(f"\n[Excerpt {i} — {source}]\n{text}")

    parts.append("")
    parts.append(
        "Based only on the above excerpts, compose a short archival voice "
        "response (60–140 words). Stay grounded in the source text."
    )
    return "\n".join(parts)


def _fallback_response(metadata: dict, passages: list[dict]) -> str:
    """Template-based fallback when no LLM API is available."""
    if not passages:
        return (
            "No archival text was retrieved for this match. "
            "The photograph exists in the archive, but no accompanying "
            "textual record was found in the indexed sources."
        )

    # Use the best passage
    best = passages[0]
    text = best.get("text", "").strip()
    source = best.get("source_file", "the archive")
    title = metadata.get("title") or metadata.get("generated_caption") or "this subject"

    # Trim to ~100 words
    words = text.split()
    if len(words) > 80:
        excerpt = " ".join(words[:80]) + "…"
    else:
        excerpt = text

    return (
        f"The archival record associates {title} with the following passage "
        f"from {source}:\n\n\"{excerpt}\""
    )


def generate_voice(
    metadata: dict,
    passages: list[dict],
    max_tokens: int = 300,
) -> dict:
    """Generate a grounded archival voice response.

    Returns:
        {
            "generated_text": str,
            "mode": "api" | "fallback",
            "grounded": True,
            "disclaimer": str,
        }
    """
    _ensure_client()

    disclaimer = "Constructed from archival text"

    if not _api_available or _client is None:
        return {
            "generated_text": _fallback_response(metadata, passages),
            "mode": "fallback",
            "grounded": True,
            "disclaimer": disclaimer,
        }

    user_prompt = _build_user_prompt(metadata, passages)

    try:
        message = _client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=max_tokens,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        generated = message.content[0].text
    except Exception as exc:
        logger.error("Voice generation API call failed: %s", exc)
        return {
            "generated_text": _fallback_response(metadata, passages),
            "mode": "fallback",
            "grounded": True,
            "disclaimer": disclaimer,
            "error": str(exc),
        }

    return {
        "generated_text": generated,
        "mode": "api",
        "grounded": True,
        "disclaimer": disclaimer,
    }
