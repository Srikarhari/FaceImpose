import { useRef, useState, useCallback, useEffect } from "react";

export type CameraError =
  | "denied"
  | "not_found"
  | "insecure_context"
  | "unsupported"
  | "unknown"
  | null;

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<CameraError>(null);
  const [starting, setStarting] = useState(false);

  const start = useCallback(async () => {
    setError(null);

    // iOS Safari exposes mediaDevices only in secure contexts (HTTPS or localhost).
    // On a LAN IP over HTTP, navigator.mediaDevices is undefined — surface that clearly.
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      const secure = typeof window !== "undefined" && window.isSecureContext;
      console.error(
        "[camera] getUserMedia not available.",
        { isSecureContext: secure, protocol: window.location.protocol, host: window.location.host },
      );
      setError(secure ? "unsupported" : "insecure_context");
      return;
    }

    setStarting(true);
    try {
      console.log("[camera] requesting getUserMedia…");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // iOS Safari needs play() to resolve from a user gesture; start() is called from one.
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn("[camera] video.play() rejected (will rely on autoPlay):", playErr);
        }
      }
      setReady(true);
      console.log("[camera] stream acquired.");
    } catch (err: unknown) {
      const name = err instanceof DOMException ? err.name : "";
      const message = err instanceof Error ? err.message : String(err);
      console.error("[camera] getUserMedia failed:", name, message, err);
      if (name === "NotAllowedError" || name === "SecurityError") setError("denied");
      else if (name === "NotFoundError" || name === "OverconstrainedError") setError("not_found");
      else setError("unknown");
    } finally {
      setStarting(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.85);
  }, []);

  return { videoRef, ready, error, starting, start, captureFrame };
}
