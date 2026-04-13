import { type RefObject, useRef } from "react";
import CameraCapture from "./CameraCapture";
import { useFaceDetector, type FaceReadouts } from "../hooks/useFaceDetector";

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraReady: boolean;
  snapshot: string | null;
  showSnapshot: boolean;
}

export default function VisitorPanel({
  videoRef,
  cameraReady,
  snapshot,
  showSnapshot,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { readouts } = useFaceDetector(videoRef, canvasRef, showSnapshot);

  // Freeze readouts at the moment of capture so they persist on the snapshot
  const frozenReadouts = useRef<FaceReadouts | null>(null);
  const wasSnapshot = useRef(false);
  if (showSnapshot && !wasSnapshot.current) {
    frozenReadouts.current = readouts;
  }
  wasSnapshot.current = showSnapshot;
  const displayReadouts = showSnapshot ? frozenReadouts.current : readouts;

  return (
    <div style={container}>
      <div style={videoWrap}>
        <CameraCapture videoRef={videoRef} ready={cameraReady} />

        {showSnapshot && snapshot && (
          <img
            src={snapshot}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: "scaleX(-1)",
            }}
          />
        )}

        {/* Bounding box canvas — above snapshot; paused = frozen on snapshot */}
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            transform: "scaleX(-1)",
          }}
        />

        {/* Landmark readouts overlay — live pre-capture, frozen post-capture */}
        {displayReadouts && <ReadoutsOverlay r={displayReadouts} />}
      </div>

      <div style={labelBar}>
        <span style={labelText}>VISITOR</span>
      </div>
    </div>
  );
}

function ReadoutsOverlay({ r }: { r: FaceReadouts }) {
  const rows: [string, string][] = [
    ["JAW",   r.jawShape],
    ["EYES",  r.eyeOpenness],
    ["NOSE",  r.noseWidth],
    ["MOUTH", r.mouthWidth],
    ["EXPR",  r.expression],
  ];
  return (
    <div style={overlay}>
      <span style={approxTag}>~ APPROX</span>
      {rows.map(([key, val]) => (
        <div key={key} style={row}>
          <span style={rowKey}>{key}</span>
          <span style={rowVal}>{val}</span>
        </div>
      ))}
    </div>
  );
}

/* ── styles ── */

const container: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "#000",
  overflow: "hidden",
};

const videoWrap: React.CSSProperties = {
  position: "relative",
  flex: 1,
  overflow: "hidden",
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

const overlay: React.CSSProperties = {
  position: "absolute",
  bottom: 16,
  left: 14,
  display: "flex",
  flexDirection: "column",
  gap: 5,
  padding: "10px 14px 12px",
  background: "rgba(0,0,0,0.72)",
  backdropFilter: "blur(4px)",
  borderLeft: "2px solid var(--color-accent-dim)",
  pointerEvents: "none",
  zIndex: 10,
};

const approxTag: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: "0.14em",
  color: "var(--color-accent-dim)",
  marginBottom: 2,
  textTransform: "uppercase",
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 8,
};

const rowKey: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.12em",
  color: "var(--color-accent)",
  textTransform: "uppercase",
  minWidth: 40,
};

const rowVal: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  letterSpacing: "0.04em",
  color: "#e8e4dc",
  textTransform: "lowercase",
};
