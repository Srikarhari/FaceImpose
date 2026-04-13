/**
 * ArchivalVoicePanel — v2 retrieval + grounded voice panel.
 *
 * Two modes:
 * 1. Auto mode: triggered when a face match succeeds (matchData prop)
 *    - Automatically retrieves archival text and generates a voice response
 * 2. Manual mode: user types a query and searches
 *
 * Shows clearly separated sections:
 * - Retrieved archival excerpts
 * - Generated voice response (with disclaimer)
 */

import { useEffect, useRef, useState } from "react";
import {
  getRetrievalStatus,
  postRetrievalSearch,
  postVoiceAuto,
} from "../api/client";
import type {
  RetrievalHit,
  RetrievalStatusResponse,
  VoicePassage,
  VoiceResponse,
} from "../api/types";
import type { MatchResponse } from "../api/types";

interface Props {
  matchData?: MatchResponse | null;
}

export default function ArchivalVoicePanel({ matchData }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<RetrievalStatusResponse | null>(null);

  // Manual search state
  const [query, setQuery] = useState("");
  const [manualResults, setManualResults] = useState<RetrievalHit[]>([]);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // Auto voice state
  const [voiceResult, setVoiceResult] = useState<VoiceResponse | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const lastMatchId = useRef<number | null>(null);

  // Tab: "auto" (after match) or "manual" (search)
  const [tab, setTab] = useState<"auto" | "manual">("auto");

  // Fetch retrieval status once on mount
  useEffect(() => {
    let cancelled = false;
    getRetrievalStatus()
      .then((s) => { if (!cancelled) setStatus(s); })
      .catch(() => { if (!cancelled) setStatus({ ready: false, total_chunks: 0, sources: [] }); });
    return () => { cancelled = true; };
  }, []);

  // Auto-trigger retrieval + voice after a new match
  useEffect(() => {
    if (!matchData?.twin) return;
    const mid = matchData.twin.match_id;
    if (mid === lastMatchId.current) return;
    lastMatchId.current = mid;

    setOpen(true);
    setTab("auto");
    setVoiceLoading(true);
    setVoiceError(null);
    setVoiceResult(null);

    const twin = matchData.twin;
    postVoiceAuto({
      filename: twin.filename,
      title: twin.metadata.title,
      generated_caption: twin.generated_caption,
      source_collection: twin.metadata.source_collection,
      place_text: twin.metadata.place_text,
      date_text: twin.metadata.date_text,
      original_caption: twin.original_caption,
    })
      .then((res) => {
        setVoiceResult(res);
      })
      .catch((err) => {
        setVoiceError(err instanceof Error ? err.message : "Voice generation failed");
      })
      .finally(() => setVoiceLoading(false));
  }, [matchData]);

  // Manual search handler
  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setManualLoading(true);
    setManualError(null);
    try {
      const res = await postRetrievalSearch(q, 5);
      if (!res.success) {
        setManualError("Retrieval index not ready. Run process_book.py first.");
        setManualResults([]);
      } else {
        setManualResults(res.results);
        if (res.results.length === 0) setManualError("No matches.");
      }
    } catch (err: unknown) {
      setManualError(err instanceof Error ? err.message : "Search failed");
      setManualResults([]);
    } finally {
      setManualLoading(false);
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
          {voiceResult ? " · voice ready" : ""}
        </span>
        <span style={{ marginLeft: 4 }}>▲</span>
      </button>
    );
  }

  // -------------------- Expanded drawer --------------------
  return (
    <section style={drawer} aria-label="Archival voice panel">
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

      {/* Tabs */}
      <div style={tabRow}>
        <button
          type="button"
          style={tab === "auto" ? tabActive : tabInactive}
          onClick={() => setTab("auto")}
        >
          MATCH VOICE
        </button>
        <button
          type="button"
          style={tab === "manual" ? tabActive : tabInactive}
          onClick={() => setTab("manual")}
        >
          MANUAL SEARCH
        </button>
      </div>

      {/* AUTO TAB */}
      {tab === "auto" && (
        <div style={resultsArea}>
          {voiceLoading && (
            <p style={hintLine}>Retrieving archival text and generating voice…</p>
          )}

          {voiceError && <div style={errorLine}>{voiceError}</div>}

          {!voiceLoading && !voiceResult && !voiceError && (
            <p style={hintLine}>
              Capture a face to automatically retrieve archival text and generate a voice response.
            </p>
          )}

          {voiceResult && (
            <>
              {/* Retrieved excerpts */}
              {voiceResult.passages.length > 0 && (
                <div>
                  <div style={sectionLabel}>RETRIEVED ARCHIVAL TEXT</div>
                  {voiceResult.query_used && (
                    <div style={queryUsedLine}>query: "{voiceResult.query_used}"</div>
                  )}
                  {voiceResult.passages.map((p, i) => (
                    <PassageCard key={i} passage={p} />
                  ))}
                </div>
              )}

              {/* Generated voice */}
              <div style={{ marginTop: 12 }}>
                <div style={sectionLabel}>GENERATED VOICE</div>
                <div style={voiceDisclaimer}>{voiceResult.disclaimer}</div>
                <div style={voiceCard}>
                  <p style={voiceText}>{voiceResult.generated_text}</p>
                  <div style={voiceMeta}>
                    mode: {voiceResult.mode}
                    {voiceResult.error && ` · error: ${voiceResult.error}`}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* MANUAL TAB */}
      {tab === "manual" && (
        <>
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
              disabled={manualLoading || !status?.ready}
              style={{
                ...searchBtn,
                opacity: manualLoading || !status?.ready ? 0.4 : 1,
              }}
            >
              {manualLoading ? "…" : "SEARCH"}
            </button>
          </div>

          {manualError && <div style={errorLine}>{manualError}</div>}

          <div style={resultsArea}>
            {manualResults.map((r) => (
              <ResultCard key={r.id} hit={r} />
            ))}
            {!manualError && manualResults.length === 0 && !manualLoading && (
              <p style={hintLine}>
                Type a query and press SEARCH to retrieve archival passages.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------
// Passage card (auto-retrieved, shown in auto tab)
// ----------------------------------------------------------------------
function PassageCard({ passage }: { passage: VoicePassage }) {
  const [expanded, setExpanded] = useState(false);
  const preview =
    passage.text.length > 280 && !expanded
      ? passage.text.slice(0, 280).trimEnd() + "…"
      : passage.text;

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
        <span>{passage.source_file}</span>
        {passage.section && (
          <>
            <span>·</span>
            <span>{passage.section}</span>
          </>
        )}
        {passage.page != null && (
          <>
            <span>·</span>
            <span>page {passage.page}</span>
          </>
        )}
        <span>·</span>
        <span style={{ color: "var(--color-accent)" }}>
          score {passage.score.toFixed(2)}
        </span>
      </div>
    </article>
  );
}

// ----------------------------------------------------------------------
// Result card (manual search)
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
// Styles
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
  width: 480,
  maxWidth: "calc(100vw - 32px)",
  height: 540,
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

const tabRow: React.CSSProperties = {
  display: "flex",
  borderBottom: "1px solid #222",
};

const tabBase: React.CSSProperties = {
  flex: 1,
  padding: "8px 14px",
  background: "transparent",
  border: "none",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const tabActive: React.CSSProperties = {
  ...tabBase,
  color: "var(--color-accent)",
  borderBottom: "2px solid var(--color-accent)",
};

const tabInactive: React.CSSProperties = {
  ...tabBase,
  color: "var(--color-text-dim)",
  borderBottom: "2px solid transparent",
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

const sectionLabel: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: "0.12em",
  color: "var(--color-accent)",
  textTransform: "uppercase",
  marginBottom: 6,
  paddingBottom: 4,
  borderBottom: "1px solid #1a1a1a",
};

const queryUsedLine: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--color-text-dim)",
  marginBottom: 8,
  fontStyle: "italic",
};

const voiceDisclaimer: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--color-text-dim)",
  padding: "6px 10px",
  background: "#0a0a0a",
  border: "1px solid #1a1a1a",
  marginBottom: 8,
  lineHeight: 1.5,
};

const voiceCard: React.CSSProperties = {
  border: "1px solid var(--color-accent-dim)",
  background: "#0d0d0d",
  padding: "12px 14px",
};

const voiceText: React.CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-serif)",
  fontSize: 13,
  lineHeight: 1.55,
  color: "var(--color-text)",
  whiteSpace: "pre-wrap",
};

const voiceMeta: React.CSSProperties = {
  marginTop: 8,
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--color-text-dim)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
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
