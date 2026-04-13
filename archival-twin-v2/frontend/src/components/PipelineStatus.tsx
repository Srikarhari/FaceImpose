import type { StageResult } from "../api/types";
import { usePipelineStages, STAGE_LABELS } from "../hooks/usePipelineStages";

interface Props {
  stages: Record<string, StageResult> | null;
  active: boolean;
  processing: boolean;
}

export default function PipelineStatus({ stages, active, processing }: Props) {
  const { STAGE_KEYS, visibleCount } = usePipelineStages(stages, active);

  return (
    <div style={container}>
      {STAGE_KEYS.map((key, i) => {
        const done = active && i < visibleCount;
        const pulsing = processing && !active && i === 0;
        return (
          <div key={key} style={row}>
            <span
              style={{
                ...dot,
                background: done
                  ? "var(--color-stage-done)"
                  : "var(--color-stage-pending)",
                animation: pulsing ? "pulse 1s infinite" : "none",
              }}
            />
            <span
              style={{
                ...label,
                color: done ? "var(--color-text)" : "var(--color-text-dim)",
              }}
            >
              {STAGE_LABELS[key]}
            </span>
          </div>
        );
      })}
      <style>{`@keyframes pulse { 0%,100% { opacity:.3 } 50% { opacity:1 } }`}</style>
    </div>
  );
}

const container: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "12px 16px",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const dot: React.CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: "50%",
  flexShrink: 0,
  transition: "background 0.3s",
};

const label: React.CSSProperties = {
  transition: "color 0.3s",
};
