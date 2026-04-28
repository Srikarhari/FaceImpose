import { useCallback, useEffect, useState } from "react";
import SplitScreen from "./components/SplitScreen";
import ArchivalVoicePanel from "./components/ArchivalVoicePanel";
import { useCamera } from "./hooks/useCamera";
import { useMatch } from "./hooks/useMatch";
import { getHealth } from "./api/client";

export default function App() {
  const { videoRef, ready: cameraReady, error: cameraError, captureFrame } = useCamera();
  const { state: matchState, runMatch, reset } = useMatch();
  const [backendStatus, setBackendStatus] = useState<string>("checking");

  // Check backend health on mount
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

  return (
    <>
      <SplitScreen
        videoRef={videoRef}
        cameraReady={cameraReady}
        cameraError={cameraError}
        matchState={matchState}
        backendStatus={backendStatus}
        onCapture={handleCapture}
        onReset={reset}
      />
      <ArchivalVoicePanel />
    </>
  );
}
