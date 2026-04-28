import type { MatchResponse, StageResult } from "../api/types";
import VisitorPanel from "./VisitorPanel";
import TwinPanel from "./TwinPanel";
import PipelineStatus from "./PipelineStatus";
import DisclosurePanel from "./DisclosurePanel";
import ErrorOverlay from "./ErrorOverlay";
import type { MatchState } from "../hooks/useMatch";
import type { CameraError } from "../hooks/useCamera";
import { IDLE_SUBTITLE, PROCESSING_TEXT } from "../content/disclosureText";
import { type RefObject } from "react";

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraReady: boolean;
  cameraError: CameraError;
  matchState: MatchState;
  backendStatus: string;
  onCapture: () => void;
  onReset: () => void;
}

export default function SplitScreen({
  videoRef,
  cameraReady,
  cameraError,
  matchState,
  backendStatus,
  onCapture,
  onReset,
}: Props) {
  const isDegraded = backendStatus === "degraded";
  const isUnreachable = backendStatus === "unreachable";
  const isMatched = matchState.phase === "matched";
  const isProcessing = matchState.phase === "processing";
  const isError = matchState.phase === "error";
  const matchData: MatchResponse | null =
    isMatched ? matchState.data : null;
  const snapshot: string | null = isMatched ? matchState.snapshot : null;
  const stages: Record<string, StageResult> | null =
    matchData?.stages ?? null;

  return (
    <div style={shell}>
      {/* Split panels */}
      <div style={panels}>
        <VisitorPanel
          videoRef={videoRef}
          cameraReady={cameraReady}
          snapshot={snapshot}
          showSnapshot={isMatched}
        />
        <div style={divider} />
        <TwinPanel twin={matchData?.twin ?? null} visible={isMatched} />
      </div>

      {/* Pipeline + controls bar */}
      <div style={bottomBar}>
        <PipelineStatus
          stages={stages}
          active={isMatched}
          processing={isProcessing}
        />

        <div style={controlArea}>
          {isDegraded && matchState.phase === "idle" && (
            <p style={degradedHint}>
              The classification engine is offline. Camera and interface remain active.
            </p>
          )}
          {isUnreachable && matchState.phase === "idle" && (
            <p style={degradedHint}>
              Backend is unreachable. Ensure the server is running.
            </p>
          )}
          {matchState.phase === "idle" && !isUnreachable && (
            <>
              {!isDegraded && <p style={hint}>{IDLE_SUBTITLE}</p>}
              <button
                style={{
                  ...captureBtn,
                  opacity: cameraReady && !isDegraded ? 1 : 0.3,
                }}
                disabled={!cameraReady || isDegraded}
                onClick={onCapture}
              >
                FIND TWIN
              </button>
            </>
          )}
          {isProcessing && <p style={hint}>{PROCESSING_TEXT}</p>}
          {isMatched && (
            <>
              <button
                style={{ ...captureBtn, opacity: cameraReady ? 1 : 0.3 }}
                disabled={!cameraReady}
                onClick={onCapture}
              >
                FIND TWIN
              </button>
              <button style={resetBtn} onClick={onReset}>
                RESET
              </button>
            </>
          )}
        </div>
      </div>

      {/* Disclosure */}
      <DisclosurePanel
        text={matchData?.disclosure_text ?? ""}
        visible={isMatched}
      />

      {/* Camera error */}
      {cameraError && (
        <ErrorOverlay
          errorCode={
            cameraError === "denied"
              ? "camera_denied"
              : cameraError === "not_found"
                ? "camera_not_found"
                : "camera_error"
          }
          detail={
            cameraError === "denied"
              ? "Camera access was denied. Allow camera access in your browser settings."
              : cameraError === "not_found"
                ? "No camera found on this device."
                : "Could not access camera."
          }
          onDismiss={() => {}}
        />
      )}

      {/* Match error — but not for engine_unavailable in degraded mode (already shown inline) */}
      {isError && !(isDegraded && matchState.error === "engine_unavailable") && (
        <ErrorOverlay
          errorCode={matchState.error}
          detail={matchState.detail}
          onDismiss={onReset}
        />
      )}
    </div>
  );
}

const shell: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const panels: React.CSSProperties = {
  flex: 1,
  display: "grid",
  gridTemplateColumns: "1fr 1px 1fr",
  minHeight: 0,
};

const divider: React.CSSProperties = {
  background: "#222",
};

const bottomBar: React.CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  background: "var(--color-surface)",
  borderTop: "1px solid #222",
  paddingBottom: "var(--safe-bottom)",
};

const controlArea: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "10px 16px",
};

const degradedHint: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.06em",
  color: "var(--color-accent-dim)",
  textAlign: "center",
  textTransform: "uppercase",
  lineHeight: 1.5,
};

const hint: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.06em",
  color: "var(--color-text-dim)",
  textAlign: "center",
  textTransform: "uppercase",
};

const captureBtn: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  letterSpacing: "0.12em",
  padding: "10px 32px",
  border: "1px solid var(--color-accent)",
  color: "var(--color-accent)",
  background: "transparent",
  textTransform: "uppercase",
  transition: "background 0.2s, color 0.2s",
};

const resetBtn: React.CSSProperties = {
  ...captureBtn,
  fontSize: 11,
  padding: "8px 24px",
  borderColor: "var(--color-text-dim)",
  color: "var(--color-text-dim)",
};
