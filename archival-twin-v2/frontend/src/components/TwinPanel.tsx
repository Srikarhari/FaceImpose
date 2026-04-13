import type { TwinResult } from "../api/types";

interface Props {
  twin: TwinResult | null;
  visible: boolean;
}

const BASE = import.meta.env.VITE_API_URL ?? "";

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
            {twin.generated_caption && (
              <p style={title}>{twin.generated_caption}</p>
            )}
            {twin.original_caption && (
              <p style={caption}>{twin.original_caption}</p>
            )}
            {twin.metadata.date_text && (
              <p style={metaLine}>{twin.metadata.date_text}</p>
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
  fontSize: 11,
  letterSpacing: "0.08em",
  padding: "3px 8px",
  border: "2px solid var(--color-accent)",
  color: "var(--color-accent)",
};

const emotionBadge: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.08em",
  padding: "3px 8px",
  border: "2px solid #555",
  color: "var(--color-text-dim)",
};

const scoreValue: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 14,
  fontWeight: "bold",
  color: "var(--color-text)",
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
