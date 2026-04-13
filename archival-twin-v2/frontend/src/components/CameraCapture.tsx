import { type RefObject } from "react";

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  ready: boolean;
}

export default function CameraCapture({ videoRef, ready }: Props) {
  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        opacity: ready ? 1 : 0,
        transition: "opacity 0.4s",
        transform: "scaleX(-1)",
      }}
    />
  );
}
