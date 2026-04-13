"""
Book text processing pipeline.

Reads raw .txt files from backend/data/book/raw/,
cleans them while preserving paragraph structure,
extracts page + section metadata, then writes
chunked JSON output to backend/data/book/chunks/.

Cross-platform: pathlib only, no shell calls.

Usage:
    # Process every .txt in raw/
    python -m scripts.process_book

    # Process a single file
    python -m scripts.process_book --input data/book/raw/Portman_book1.txt
"""

import argparse
import json
import logging
import re
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

# Resolve paths relative to this script so it works on Mac and Windows
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
BOOK_DIR = BACKEND_DIR / "data" / "book"
RAW_DIR = BOOK_DIR / "raw"
PROCESSED_DIR = BOOK_DIR / "processed"
CHUNKS_DIR = BOOK_DIR / "chunks"

# Tunables
TARGET_WORDS = 250
MAX_WORDS = 400
MIN_HEADER_REPEAT = 4  # a line must appear >=N times to be treated as a running header
PAGE_SENTINEL = "<<<PAGE={n}>>>"
PAGE_SENTINEL_RE = re.compile(r"<<<PAGE=(\d+)>>>")
CHAPTER_RE = re.compile(r"^\s*CHAPTER\s+[IVXLCDM]+\b.*$", re.IGNORECASE)
PAGE_NUM_LINE_RE = re.compile(r"^\s*(\d{1,4})\s*$")
HYPHEN_BREAK_RE = re.compile(r"(\w+)-\n(\w+)")


def read_text(path: Path) -> str:
    """Read a text file with permissive UTF-8 decoding."""
    return path.read_text(encoding="utf-8", errors="replace")


def normalise_line_endings(text: str) -> str:
    """Convert CRLF and bare CR to LF."""
    return text.replace("\r\n", "\n").replace("\r", "\n")


def dehyphenate(text: str) -> str:
    """Join words split across line breaks: 'sarpen-\\ntine' -> 'sarpentine'."""
    return HYPHEN_BREAK_RE.sub(r"\1\2", text)


def detect_running_headers(lines: list[str]) -> set[str]:
    """Find lines that repeat ≥ MIN_HEADER_REPEAT times and look like headers."""
    counts: dict[str, int] = {}
    for ln in lines:
        s = ln.strip()
        if not s or len(s) > 80:
            continue
        # Heuristic: mostly uppercase letters (typical for running headers)
        letters = [c for c in s if c.isalpha()]
        if not letters:
            continue
        upper_ratio = sum(1 for c in letters if c.isupper()) / len(letters)
        if upper_ratio < 0.6:
            continue
        counts[s] = counts.get(s, 0) + 1
    return {s for s, n in counts.items() if n >= MIN_HEADER_REPEAT}


def clean_text(raw: str) -> str:
    """Clean OCR'd text while preserving paragraph structure.

    Embeds <<<PAGE=N>>> sentinels in place of bare page-number lines so
    the chunker can later attach page metadata.
    """
    text = normalise_line_endings(raw)
    text = dehyphenate(text)
    lines = text.split("\n")

    headers = detect_running_headers(lines)
    if headers:
        logger.info("Detected %d running header(s): %s", len(headers), sorted(headers)[:3])

    out: list[str] = []
    for ln in lines:
        stripped = ln.strip()

        # Skip running headers
        if stripped in headers:
            continue

        # Replace bare page-number lines with a sentinel (kept in stream so
        # chunker can pick them up, then drop them from the final text).
        m = PAGE_NUM_LINE_RE.match(ln)
        if m:
            out.append(PAGE_SENTINEL.format(n=int(m.group(1))))
            continue

        out.append(ln)

    cleaned = "\n".join(out)

    # Collapse 3+ consecutive blank lines to 2
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip() + "\n"


SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"'\(])")


def split_long_paragraph(para: str, max_words: int) -> list[str]:
    """Split an oversized paragraph into ≤ max_words sub-paragraphs.

    First tries sentence boundaries; if a sentence is itself larger than
    max_words, hard-splits on word count.
    """
    if word_count(para) <= max_words:
        return [para]

    sentences = SENTENCE_SPLIT_RE.split(para)
    out: list[str] = []
    buf: list[str] = []
    buf_words = 0
    for sent in sentences:
        sent = sent.strip()
        if not sent:
            continue
        wc = word_count(sent)
        # Hard-split a single oversized sentence on word boundaries
        if wc > max_words:
            if buf:
                out.append(" ".join(buf))
                buf, buf_words = [], 0
            words = sent.split()
            for i in range(0, len(words), max_words):
                out.append(" ".join(words[i : i + max_words]))
            continue
        if buf_words + wc > max_words and buf:
            out.append(" ".join(buf))
            buf, buf_words = [], 0
        buf.append(sent)
        buf_words += wc
    if buf:
        out.append(" ".join(buf))
    return out


def split_paragraphs(cleaned: str) -> list[str]:
    """Split cleaned text on blank-line paragraph boundaries.

    Oversized paragraphs are further split on sentence boundaries so the
    chunker can hit its target word count even on poorly-formatted OCR.
    Page sentinels are returned as their own 'pseudo-paragraphs' so the
    chunker can update its current_page state in order.
    """
    raw_paragraphs = re.split(r"\n\s*\n", cleaned)
    out: list[str] = []
    for p in raw_paragraphs:
        p = p.strip()
        if not p:
            continue
        # Each paragraph may itself contain inline sentinels — split them out
        # so we can interleave page state updates with content.
        parts = re.split(r"(<<<PAGE=\d+>>>)", p)
        for part in parts:
            part = part.strip()
            if not part:
                continue
            if PAGE_SENTINEL_RE.fullmatch(part):
                out.append(part)
                continue
            # Split oversized paragraphs into target-sized pieces
            for sub in split_long_paragraph(part, TARGET_WORDS):
                if sub.strip():
                    out.append(sub)
    return out


def word_count(s: str) -> int:
    return len(s.split())


def chunk_paragraphs(
    paragraphs: list[str],
    source_file: str,
    source_stem: str,
) -> list[dict]:
    """Walk paragraphs, accumulating into chunks of ~TARGET_WORDS words.

    Tracks current section (last chapter heading seen) and current page
    (last page sentinel seen) and stamps each chunk with that metadata.
    Includes a 1-paragraph overlap between adjacent chunks.
    """
    chunks: list[dict] = []
    buf: list[str] = []
    buf_words = 0
    current_section: str | None = None
    current_page: int | None = None
    chunk_index = 0

    def flush() -> None:
        nonlocal buf, buf_words, chunk_index
        if not buf:
            return
        text = "\n\n".join(buf).strip()
        if not text:
            buf = []
            buf_words = 0
            return
        chunks.append({
            "id": f"{source_stem}::{chunk_index:04d}",
            "source_file": source_file,
            "chunk_index": chunk_index,
            "text": text,
            "word_count": word_count(text),
            "section": current_section,
            "page": current_page,
        })
        chunk_index += 1
        # Carry the last paragraph forward as overlap
        overlap = buf[-1] if len(buf) > 1 else ""
        buf = [overlap] if overlap else []
        buf_words = word_count(overlap) if overlap else 0

    for para in paragraphs:
        # Page sentinel: update state and continue (do not add to buffer)
        m = PAGE_SENTINEL_RE.fullmatch(para)
        if m:
            current_page = int(m.group(1))
            continue

        # Chapter heading: update section and include in buffer
        if CHAPTER_RE.match(para):
            current_section = para.strip()

        wc = word_count(para)

        # If a single paragraph exceeds MAX_WORDS, force-flush before it
        if wc > MAX_WORDS and buf:
            flush()

        buf.append(para)
        buf_words += wc

        if buf_words >= TARGET_WORDS:
            flush()

    flush()
    return chunks


def process_file(input_path: Path) -> dict:
    """Run the full pipeline on a single source file. Returns a summary dict."""
    source_file = input_path.name
    source_stem = input_path.stem

    logger.info("Processing %s", source_file)
    raw = read_text(input_path)
    raw_words = word_count(raw)

    cleaned = clean_text(raw)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    processed_path = PROCESSED_DIR / f"{source_stem}_cleaned.txt"
    # Strip sentinels from the human-readable cleaned text
    human_readable = PAGE_SENTINEL_RE.sub("", cleaned)
    human_readable = re.sub(r"\n{3,}", "\n\n", human_readable).strip() + "\n"
    processed_path.write_text(human_readable, encoding="utf-8")

    paragraphs = split_paragraphs(cleaned)
    chunks = chunk_paragraphs(paragraphs, source_file, source_stem)

    CHUNKS_DIR.mkdir(parents=True, exist_ok=True)
    chunks_path = CHUNKS_DIR / f"{source_stem}_chunks.json"
    chunks_path.write_text(json.dumps(chunks, indent=2, ensure_ascii=False), encoding="utf-8")

    return {
        "source_file": source_file,
        "raw_words": raw_words,
        "cleaned_path": processed_path,
        "chunks_path": chunks_path,
        "chunk_count": len(chunks),
    }


def discover_inputs() -> list[Path]:
    """Find every .txt under raw/, sorted for stable order."""
    if not RAW_DIR.is_dir():
        return []
    return sorted(p for p in RAW_DIR.iterdir() if p.is_file() and p.suffix.lower() == ".txt")


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    parser = argparse.ArgumentParser(description="Process book text for retrieval")
    parser.add_argument(
        "--input",
        type=Path,
        default=None,
        help="Process a single file (default: process every .txt under raw/)",
    )
    args = parser.parse_args()

    if args.input is not None:
        if not args.input.exists():
            logger.error("Input file not found: %s", args.input)
            return 1
        inputs = [args.input]
    else:
        inputs = discover_inputs()
        if not inputs:
            logger.error("No .txt files found in %s", RAW_DIR)
            return 1

    summaries = [process_file(p) for p in inputs]

    # Console summary
    print()
    print("=" * 60)
    print(f"Processed {len(summaries)} file(s)")
    print("=" * 60)
    total_chunks = 0
    for s in summaries:
        print(
            f"  {s['source_file']:<30} "
            f"{s['raw_words']:>8} words  →  {s['chunk_count']:>5} chunks"
        )
        total_chunks += s["chunk_count"]
    print("-" * 60)
    print(f"  TOTAL{'':<25} {'':>8}        {total_chunks:>5} chunks")
    print(f"\nChunks written to: {CHUNKS_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
