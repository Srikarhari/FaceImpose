/**
 * useFaceDetector — MediaPipe FaceLandmarker
 *
 * Replaces blazeface. Gives:
 *  - bounding box drawn on canvas (same as before)
 *  - landmark-derived FaceReadouts (NEW)
 *
 * All descriptors are geometric approximations; labelled "~" in the UI.
 */

import { useEffect, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";

export interface FaceReadouts {
  jawShape: string;     // narrow | oval | wide
  eyeOpenness: string;  // closed | narrowed | open
  eyeSpacing: string;   // close-set | typical | wide-set
  noseWidth: string;    // narrow | medium | broad
  mouthWidth: string;   // narrow | medium | wide
  expression: string;   // neutral | smiling | frowning | surprised | mouth open
}

type Pt = { x: number; y: number };

function d2(a: Pt, b: Pt) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function bucket(v: number, lo: number, hi: number, [a, b, c]: [string, string, string]): string {
  return v < lo ? a : v < hi ? b : c;
}

function computeReadouts(
  lm: Pt[],
  blendshapeCategories: Array<{ categoryName: string; score: number }>
): FaceReadouts {
  // Face width (jaw silhouette: pts 234 ↔ 454) and height (forehead 10 ↔ chin 152)
  const jawW = d2(lm[234], lm[454]);
  const faceH = d2(lm[10], lm[152]);
  const jawRatio = jawW / (faceH || 1);

  // Eye Aspect Ratio (EAR) — left eye: outer 33, inner 133, top 159, bottom 145
  //                          right eye: outer 263, inner 362, top 386, bottom 374
  const earL = d2(lm[159], lm[145]) / (d2(lm[33], lm[133]) || 1);
  const earR = d2(lm[386], lm[374]) / (d2(lm[362], lm[263]) || 1);
  const ear = (earL + earR) / 2;

  // Inter-eye distance (inner corners 133 ↔ 362) relative to jaw width
  const eyeSpacingRatio = d2(lm[133], lm[362]) / (jawW || 1);

  // Nose width (alae 129 ↔ 358) relative to jaw width
  const noseRatio = d2(lm[129], lm[358]) / (jawW || 1);

  // Mouth width (corners 61 ↔ 291) relative to jaw width
  const mouthRatio = d2(lm[61], lm[291]) / (jawW || 1);

  // Expression from blendshapes (52 ARKit-style weights)
  let expression = "neutral";
  if (blendshapeCategories.length > 0) {
    const s: Record<string, number> = {};
    for (const c of blendshapeCategories) s[c.categoryName] = c.score;
    const smile   = ((s.mouthSmileLeft  ?? 0) + (s.mouthSmileRight  ?? 0)) / 2;
    const frown   = ((s.mouthFrownLeft  ?? 0) + (s.mouthFrownRight  ?? 0)) / 2;
    const jawOpen = s.jawOpen ?? 0;
    const wide    = ((s.eyeWideLeft     ?? 0) + (s.eyeWideRight     ?? 0)) / 2;
    if      (smile   > 0.35) expression = "smiling";
    else if (frown   > 0.25) expression = "frowning";
    else if (wide    > 0.30 && jawOpen > 0.25) expression = "surprised";
    else if (jawOpen > 0.30) expression = "mouth open";
  }

  return {
    jawShape:    bucket(jawRatio,        0.72, 0.88, ["narrow",    "oval",    "wide"]),
    eyeOpenness: bucket(ear,             0.15, 0.30, ["closed",   "narrowed", "open"]),
    eyeSpacing:  bucket(eyeSpacingRatio, 0.30, 0.42, ["close-set", "typical", "wide-set"]),
    noseWidth:   bucket(noseRatio,       0.22, 0.31, ["narrow",    "medium",  "broad"]),
    mouthWidth:  bucket(mouthRatio,      0.38, 0.50, ["narrow",    "medium",  "wide"]),
    expression,
  };
}

export function useFaceDetector(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  paused = false
) {
  const [readouts, setReadouts] = useState<FaceReadouts | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    async function load() {
      try {
        const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks("/mediapipe-wasm");
        landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1,
        });
      } catch {
        return; // silently skip if WASM or model unavailable
      }
      if (!cancelled) detect();
    }

    function detect() {
      if (cancelled) return;
      // When paused: keep the loop alive but skip drawing so the canvas stays frozen
      if (pausedRef.current) {
        timeoutId = setTimeout(detect, 160);
        return;
      }
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;

      if (landmarker && video && canvas && video.readyState >= 2) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const W = video.videoWidth;
          const H = video.videoHeight;
          if (canvas.width !== W) canvas.width = W;
          if (canvas.height !== H) canvas.height = H;
          ctx.clearRect(0, 0, W, H);

          try {
            const result = landmarker.detectForVideo(video, performance.now());
            if (result.faceLandmarks.length > 0) {
              const lm = result.faceLandmarks[0]; // normalized [0,1]

              // Bounding box from landmark extents
              let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
              for (const p of lm) {
                if (p.x * W < x0) x0 = p.x * W;
                if (p.y * H < y0) y0 = p.y * H;
                if (p.x * W > x1) x1 = p.x * W;
                if (p.y * H > y1) y1 = p.y * H;
              }
              ctx.strokeStyle = "rgba(255,255,255,0.85)";
              ctx.lineWidth = 2;
              ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

              // Landmark-derived measurements
              const blendshapes = result.faceBlendshapes?.[0]?.categories ?? [];
              setReadouts(computeReadouts(lm, blendshapes));
            } else {
              setReadouts(null);
            }
          } catch {
            // ignore per-frame errors
          }
        }
      }

      timeoutId = setTimeout(detect, 160); // ~6fps — balanced for mobile battery
    }

    load();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [videoRef, canvasRef]);

  return { readouts };
}
