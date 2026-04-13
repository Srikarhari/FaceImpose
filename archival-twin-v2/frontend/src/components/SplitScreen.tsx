import type { MatchResponse } from "../api/types";
import type { VoiceResponse } from "../api/types";
import VisitorPanel from "./VisitorPanel";
import TwinPanel from "./TwinPanel";
import DisclosurePanel from "./DisclosurePanel";
import ErrorOverlay from "./ErrorOverlay";
import type { MatchState } from "../hooks/useMatch";
import type { CameraError } from "../hooks/useCamera";
import { useSpeech } from "../hooks/useSpeech";
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
  voiceResult: VoiceResponse | null;
  voiceLoading: boolean;
  voiceError: string | null;
}

export default function SplitScreen({
  videoRef,
  cameraReady,
  cameraError,
  matchState,
  backendStatus,
  onCapture,
  onReset,
  voiceResult,
  voiceLoading,
  voiceError,
}: Props) {
  const isDegraded = backendStatus === "degraded";
  const isUnreachable = backendStatus === "unreachable";
  const isMatched = matchState.phase === "matched";
  const isProcessing = matchState.phase === "processing";
  const isError = matchState.phase === "error";
  const matchData: MatchResponse | null = isMatched ? matchState.data : null;
  const snapshot: string | null = isMatched ? matchState.snapshot : null;

  const { speaking, toggle: toggleSpeech, stop: stopSpeech } = useSpeech();

  // Stop speech on reset
  const handleReset = () => {
    stopSpeech();
    onReset();
  };

  return (
    <div style={shell}>
      {/* Image panels */}
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

      {/* Bottom bar: voice text | controls | retrieved text */}
      <div style={bottomBar}>
        {/* Left: generated voice */}
        <div style={textPane}>
          {isMatched && voiceResult?.generated_text && (
            <>
              <div style={paneLabelRow}>
                <span style={paneLabel}>GENERATED VOICE</span>
                <button
                  type="button"
                  style={{
                    ...speakerBtn,
                    color: speaking ? "var(--color-accent)" : "var(--color-text-dim)",
                    borderColor: speaking ? "var(--color-accent)" : "var(--color-text-dim)",
                  }}
                  onClick={() => toggleSpeech(voiceResult.generated_text)}
                  title={speaking ? "Stop speaking" : "Speak generated voice"}
                >
                  {speaking ? "■" : "🔊"}
                </button>
              </div>
              <p style={voiceText}>{voiceResult.generated_text}</p>
              <p style={disclaimer}>{voiceResult.disclaimer}</p>
            </>
          )}
          {isMatched && voiceLoading && (
            <p style={dimText}>Generating voice…</p>
          )}
          {isMatched && voiceError && (
            <p style={errorText}>{voiceError}</p>
          )}
        </div>

        {/* Center: controls */}
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
              <button style={resetBtn} onClick={handleReset}>
                RESET
              </button>
            </>
          )}
        </div>

        {/* Right: retrieved archival text */}
        <div style={textPane}>
          {isMatched && voiceResult && voiceResult.passages.length > 0 && (
            <>
              <span style={paneLabel}>RETRIEVED ARCHIVAL TEXT</span>
              <div style={passagesWrap}>
                {voiceResult.passages.map((p, i) => (
                  <div key={i} style={passageCard}>
                    <p style={passageText}>
                      {p.text.length > 300
                        ? p.text.slice(0, 300).trimEnd() + "…"
                        : p.text}
                    </p>
                    <div style={passageMeta}>
                      {p.source_file}
                      {p.section && ` · ${p.section}`}
                      {p.page != null && ` · p.${p.page}`}
                      {` · ${p.score.toFixed(2)}`}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {isMatched && voiceLoading && (
            <p style={dimText}>Retrieving archival text…</p>
          )}
          {isMatched && voiceResult && voiceResult.passages.length === 0 && !voiceLoading && (
            <p style={dimText}>No archival text retrieved for this match.</p>
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

      {/* Match error */}
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
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  background: "var(--color-surface)",
  borderTop: "1px solid #222",
  paddingBottom: "var(--safe-bottom)",
  minHeight: 80,
  maxHeight: 220,
};

const textPane: React.CSSProperties = {
  padding: "10px 16px",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const paneLabelRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const paneLabel: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: "0.12em",
  color: "var(--color-accent)",
  textTransform: "uppercase",
  flexShrink: 0,
};

const speakerBtn: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 14,
  padding: "3px 8px",
  border: "1px solid var(--color-text-dim)",
  background: "transparent",
  cursor: "pointer",
  lineHeight: 1,
  flexShrink: 0,
};

const voiceText: React.CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-serif)",
  fontSize: 12,
  lineHeight: 1.55,
  color: "var(--color-text)",
  whiteSpace: "pre-wrap",
};

const disclaimer: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  color: "var(--color-text-dim)",
  lineHeight: 1.4,
  marginTop: 2,
};

const dimText: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--color-text-dim)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const errorText: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--color-danger)",
};

const passagesWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const passageCard: React.CSSProperties = {
  borderLeft: "2px solid #222",
  paddingLeft: 10,
};

const passageText: React.CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-serif)",
  fontSize: 11,
  lineHeight: 1.5,
  color: "var(--color-text)",
  whiteSpace: "pre-wrap",
};

const passageMeta: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  color: "var(--color-text-dim)",
  marginTop: 3,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const controlArea: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "10px 24px",
  borderLeft: "1px solid #222",
  borderRight: "1px solid #222",
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
