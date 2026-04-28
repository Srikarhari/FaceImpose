/**
 * ArchivalVoicePanel — v2 retrieval test panel.
 *
 * Floating bottom-right drawer that does NOT touch SplitScreen layout.
 * Toggles between a collapsed header bar and an expanded search panel.
 *
 * Purely additive: this component lives alongside <SplitScreen /> in App.tsx
 * via a fragment, so the existing face-match interface is unaffected.
 */

import { useEffect, useState } from "react";
import {
  getRetrievalStatus,
  postRetrievalSearch,
} from "../api/client";
import type {
  RetrievalHit,
  RetrievalStatusResponse,
} from "../api/types";

export default function ArchivalVoicePanel() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<RetrievalStatusResponse | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RetrievalHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch retrieval status once on mount
  useEffect(() => {
    let cancelled = false;
    getRetrievalStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus({ ready: false, total_chunks: 0, sources: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const res = await postRetrievalSearch(q, 5);
      if (!res.success) {
        setError("Retrieval index not ready. Run process_book.py first.");
        setResults([]);
      } else {
        setResults(res.results);
        if (res.results.length === 0) setError("No matches.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // -------------------- Collapsed bar --------------------
  if (!open) {
    return (
      <button
        type="button"
        style={collapsedBar}
        onClick={() => setOpen(true)}
        aria-label="Open archival voice panel"
      >
        <span style={{ letterSpacing: "0.12em" }}>ARCHIVAL VOICE</span>
        <span style={{ color: "var(--color-text-dim)", fontSize: 9 }}>
          {status?.ready
            ? `${status.total_chunks} chunks · ${status.sources.length} sources`
            : "index empty"}
        </span>
        <span style={{ marginLeft: 4 }}>▲</span>
      </button>
    );
  }

  // -------------------- Expanded drawer --------------------
  return (
    <section style={drawer} aria-label="Archival voice retrieval test">
      {/* Header */}
      <header style={drawerHeader}>
        <div>
          <div style={{ letterSpacing: "0.12em", fontSize: 11 }}>
            ARCHIVAL VOICE
          </div>
          <div style={metaLine}>
            {status?.ready
              ? `${status.total_chunks} chunks · ${status.sources.join(" · ")}`
              : "Retrieval index empty"}
          </div>
        </div>
        <button
          type="button"
          style={closeBtn}
          onClick={() => setOpen(false)}
          aria-label="Close panel"
        >
          ▼
        </button>
      </header>

      {/* Search input */}
      <div style={searchRow}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="search the archival text…"
          style={input}
          disabled={!status?.ready}
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading || !status?.ready}
          style={{
            ...searchBtn,
            opacity: loading || !status?.ready ? 0.4 : 1,
          }}
        >
          {loading ? "…" : "SEARCH"}
        </button>
      </div>

      {error && <div style={errorLine}>{error}</div>}

      {/* Results */}
      <div style={resultsArea}>
        {results.map((r) => (
          <ResultCard key={r.id} hit={r} />
        ))}
        {!error && results.length === 0 && !loading && (
          <p style={hintLine}>
            Type a query and press SEARCH to retrieve archival passages.
          </p>
        )}
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------
// Result card
// ----------------------------------------------------------------------
function ResultCard({ hit }: { hit: RetrievalHit }) {
  const [expanded, setExpanded] = useState(false);
  const preview =
    hit.text.length > 320 && !expanded
      ? hit.text.slice(0, 320).trimEnd() + "…"
      : hit.text;

  return (
    <article style={card}>
      <p
        style={cardText}
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? "Click to collapse" : "Click to expand"}
      >
        {preview}
      </p>
      <div style={cardMeta}>
        <span>{hit.source_file}</span>
        <span>·</span>
        <span>chunk {hit.chunk_index}</span>
        <span>·</span>
        <span>page {hit.page ?? "—"}</span>
        {hit.section && (
          <>
            <span>·</span>
            <span>{hit.section}</span>
          </>
        )}
        <span>·</span>
        <span style={{ color: "var(--color-accent)" }}>
          score {hit.score.toFixed(2)}
        </span>
      </div>
    </article>
  );
}

// ----------------------------------------------------------------------
// Styles (inline, matching codebase convention)
// ----------------------------------------------------------------------
const collapsedBar: React.CSSProperties = {
  position: "fixed",
  right: 16,
  bottom: "calc(16px + var(--safe-bottom))",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 14px",
  background: "var(--color-surface)",
  border: "1px solid var(--color-accent-dim)",
  color: "var(--color-accent)",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  textTransform: "uppercase",
  cursor: "pointer",
  zIndex: 25,
};

const drawer: React.CSSProperties = {
  position: "fixed",
  right: 16,
  bottom: "calc(16px + var(--safe-bottom))",
  width: 440,
  maxWidth: "calc(100vw - 32px)",
  height: 460,
  maxHeight: "calc(100vh - 32px)",
  display: "flex",
  flexDirection: "column",
  background: "var(--color-surface)",
  border: "1px solid var(--color-accent-dim)",
  color: "var(--color-text)",
  fontFamily: "var(--font-serif)",
  zIndex: 25,
  boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
};

const drawerHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  padding: "10px 14px",
  borderBottom: "1px solid #222",
  fontFamily: "var(--font-mono)",
  color: "var(--color-accent)",
  textTransform: "uppercase",
};

const metaLine: React.CSSProperties = {
  marginTop: 4,
  fontSize: 9,
  color: "var(--color-text-dim)",
  letterSpacing: "0.04em",
  textTransform: "none",
};

const closeBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--color-text-dim)",
  color: "var(--color-text-dim)",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  padding: "2px 8px",
  cursor: "pointer",
};

const searchRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "10px 14px",
  borderBottom: "1px solid #222",
};

const input: React.CSSProperties = {
  flex: 1,
  padding: "6px 10px",
  background: "#0a0a0a",
  border: "1px solid #333",
  color: "var(--color-text)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  outline: "none",
};

const searchBtn: React.CSSProperties = {
  padding: "6px 14px",
  background: "transparent",
  border: "1px solid var(--color-accent)",
  color: "var(--color-accent)",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const errorLine: React.CSSProperties = {
  padding: "6px 14px",
  color: "var(--color-danger)",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  borderBottom: "1px solid #222",
};

const resultsArea: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "10px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const hintLine: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--color-text-dim)",
  textAlign: "center",
  marginTop: 20,
};

const card: React.CSSProperties = {
  border: "1px solid #222",
  background: "#0d0d0d",
  padding: "10px 12px",
};

const cardText: React.CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-serif)",
  fontSize: 13,
  lineHeight: 1.45,
  color: "var(--color-text)",
  whiteSpace: "pre-wrap",
  cursor: "pointer",
};

const cardMeta: React.CSSProperties = {
  marginTop: 8,
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--color-text-dim)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
