# Archival Twin — v2 (Experimental)

This is the **experimental v2 copy** of the Archival Twin project.

The original `archival-twin/` folder remains the **stable exhibition version** and must not be modified.

## What's new in v2

- **Book-text retrieval**: ingest, chunk, and search archival book text
- **Archival voice response**: a new UI panel that surfaces relevant book passages alongside face matches
- All v1 face-match functionality is preserved and unchanged

## Project structure (v2 additions)

```
backend/
  data/book/
    raw/           ← drop raw .txt book files here
    processed/     ← cleaned text (generated)
    chunks/        ← chunked JSON (generated)
  scripts/
    process_book.py   ← book text processing pipeline
  app/
    services/
      book_retriever.py   ← retrieval service
    routes/
      retrieval.py        ← /api/retrieval/* endpoints
frontend/
  src/components/
    ArchivalVoicePanel.tsx  ← new UI panel (additive)
```

## Running on Mac

```bash
# Backend
cd archival-twin-v2/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py

# Frontend (separate terminal)
cd archival-twin-v2/frontend
npm install
npm run dev
```

## Running on Windows

```powershell
# Backend
cd archival-twin-v2\backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python run.py

# Frontend (separate terminal)
cd archival-twin-v2\frontend
npm install
npm run dev
```

## Cross-platform notes

- All file paths use `pathlib.Path` (Python) or relative URLs (frontend) — no hardcoded Mac paths
- Startup commands documented for both Mac and Windows
- Avoid OS-specific shell commands in scripts; use Python's `pathlib` / `shutil` instead

## Book text ingestion (Phase A — scaffolding only)

The processing pipeline is ready but no book text is loaded yet. To process a book:

```bash
cd archival-twin-v2/backend
python -m scripts.process_book --input data/book/raw/your_book.txt
```

The retrieval endpoint will automatically load chunks on next server start.

## Architecture decisions

- Retrieval is additive: new routes, new service, new UI panel — nothing removed
- Keyword-based search is a placeholder; will be replaced with embedding similarity in Phase B
- The `ArchivalVoicePanel` component is self-contained and does not modify existing components
