import type { TwinResult } from "../api/types";

interface Props {
  twin: TwinResult | null;
  visible: boolean;
}

const BASE = import.meta.env.VITE_API_URL ?? "";

// Cross-platform basename: takes a path stored as POSIX in the DB
// (e.g. "test_collection/12 _Biala_, …png") and returns just the
// final segment.
function basename(path: string): string {
  if (!path) return "";
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(slash + 1) : path;
}

export default function TwinPanel({ twin, visible }: Props) {
  return (
    <div style={container}>
      {twin && visible ? (
        <div style={inner}>
          <div style={imageWrap}>
            <img
              src={`${BASE}${twin.image_url}`}
              alt="Archival twin"
              style={image}
            />
          </div>
          <div style={meta}>
            <p style={scoreRow}>
              <span style={scoreBadge}>{twin.confidence_label.toUpperCase()}</span>
              <span style={scoreValue}>
                {(twin.similarity_score * 100).toFixed(1)}%
              </span>
              {twin.dominant_emotion && twin.dominant_emotion !== "unknown" && (
                <span style={emotionBadge}>{twin.dominant_emotion.toUpperCase()}</span>
              )}
            </p>
            {twin.filename && (
              <p style={filenameLine} title={twin.filename}>
                {basename(twin.filename)}
              </p>
            )}
            {twin.metadata.title && (
              <p style={title}>{twin.metadata.title}</p>
            )}
            {twin.original_caption && (
              <p style={caption}>{twin.original_caption}</p>
            )}
            <p style={generatedCaption}>{twin.generated_caption}</p>
            {twin.metadata.date_text && (
              <p style={metaLine}>{twin.metadata.date_text}</p>
            )}
            {twin.metadata.source_collection && (
              <p style={metaLine}>{twin.metadata.source_collection}</p>
            )}
          </div>
        </div>
      ) : (
        <div style={empty}>
          <p style={emptyLabel}>ARCHIVAL TWIN</p>
          <p style={emptyHint}>Awaiting classification</p>
        </div>
      )}
      <div style={labelBar}>
        <span style={labelText}>ARCHIVE</span>
      </div>
    </div>
  );
}

const container: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "var(--color-surface)",
  overflow: "hidden",
};

const inner: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  overflow: "auto",
};

const imageWrap: React.CSSProperties = {
  flex: "1 1 60%",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#000",
};

const image: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
};

const meta: React.CSSProperties = {
  padding: "12px 16px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const scoreRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const scoreBadge: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.08em",
  padding: "2px 6px",
  border: "1px solid var(--color-accent-dim)",
  color: "var(--color-accent)",
};

const emotionBadge: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.08em",
  padding: "2px 6px",
  border: "1px solid #444",
  color: "var(--color-text-dim)",
};

const scoreValue: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "var(--color-text-dim)",
};

const filenameLine: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.04em",
  color: "var(--color-text-dim)",
  margin: 0,
  wordBreak: "break-all",
  lineHeight: 1.4,
};

const title: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontSize: 15,
  fontStyle: "italic",
  color: "var(--color-text)",
};

const caption: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--color-text-dim)",
};

const generatedCaption: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontSize: 13,
  lineHeight: 1.6,
  color: "var(--color-text)",
  borderLeft: "2px solid var(--color-accent-dim)",
  paddingLeft: 12,
  marginTop: 4,
};

const metaLine: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--color-text-dim)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const empty: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

const emptyLabel: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  letterSpacing: "0.15em",
  color: "var(--color-text-dim)",
};

const emptyHint: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontSize: 13,
  fontStyle: "italic",
  color: "var(--color-text-dim)",
  opacity: 0.5,
};

const labelBar: React.CSSProperties = {
  padding: "8px 16px",
  background: "var(--color-surface)",
  borderTop: "1px solid #222",
};

const labelText: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.12em",
  color: "var(--color-text-dim)",
  textTransform: "uppercase",
};
