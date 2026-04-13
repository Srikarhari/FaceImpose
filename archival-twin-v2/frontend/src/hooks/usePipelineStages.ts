import { useState, useEffect, useRef } from "react";
import type { StageResult } from "../api/types";

const STAGE_KEYS = [
  "image_decoded",
  "face_detected",
  "pose_estimated",
  "features_extracted",
  "archive_queried",
  "twin_found",
] as const;

export const STAGE_LABELS: Record<string, string> = {
  image_decoded: "Image received",
  face_detected: "Face detected",
  pose_estimated: "Pose estimated",
  features_extracted: "Features extracted",
  archive_queried: "Archive queried",
  twin_found: "Twin found",
};

export function usePipelineStages(
  stages: Record<string, StageResult> | null,
  active: boolean,
) {
  const [visibleCount, setVisibleCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active || !stages) {
      setVisibleCount(0);
      return;
    }

    setVisibleCount(0);
    let i = 0;
    const total = STAGE_KEYS.filter((k) => stages[k]?.completed).length;

    timerRef.current = setInterval(() => {
      i++;
      setVisibleCount(i);
      if (i >= total && timerRef.current != null) clearInterval(timerRef.current);
    }, 120);

    return () => { if (timerRef.current != null) clearInterval(timerRef.current); };
  }, [stages, active]);

  return { STAGE_KEYS, visibleCount };
}
