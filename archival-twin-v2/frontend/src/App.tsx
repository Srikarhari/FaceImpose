import { useCallback, useEffect, useState } from "react";
import SplitScreen from "./components/SplitScreen";
import { useCamera } from "./hooks/useCamera";
import { useMatch } from "./hooks/useMatch";
import { useVoice } from "./hooks/useVoice";
import { getHealth } from "./api/client";

export default function App() {
  const { videoRef, ready: cameraReady, error: cameraError, captureFrame } = useCamera();
  const { state: matchState, runMatch, reset } = useMatch();
  const [backendStatus, setBackendStatus] = useState<string>("checking");

  const matchData = matchState.phase === "matched" ? matchState.data : null;
  const { voiceResult, voiceLoading, voiceError, resetVoice } = useVoice(matchData);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const h = await getHealth();
        if (!cancelled) setBackendStatus(h.status);
      } catch {
        if (!cancelled) setBackendStatus("unreachable");
      }
    }
    check();
    return () => { cancelled = true; };
  }, []);

  const handleCapture = useCallback(() => {
    const frame = captureFrame();
    if (frame) runMatch(frame);
  }, [captureFrame, runMatch]);

  const handleReset = useCallback(() => {
    reset();
    resetVoice();
  }, [reset, resetVoice]);

  return (
    <SplitScreen
      videoRef={videoRef}
      cameraReady={cameraReady}
      cameraError={cameraError}
      matchState={matchState}
      backendStatus={backendStatus}
      onCapture={handleCapture}
      onReset={handleReset}
      voiceResult={voiceResult}
      voiceLoading={voiceLoading}
      voiceError={voiceError}
    />
  );
}
