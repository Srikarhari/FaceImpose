import { useEffect, useRef, useState } from "react";
import { postVoiceAuto } from "../api/client";
import type { MatchResponse, VoiceResponse } from "../api/types";

export function useVoice(matchData: MatchResponse | null) {
  const [voiceResult, setVoiceResult] = useState<VoiceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastMatchId = useRef<number | null>(null);

  useEffect(() => {
    if (!matchData?.twin) return;
    const mid = matchData.twin.match_id;
    if (mid === lastMatchId.current) return;
    lastMatchId.current = mid;

    setLoading(true);
    setError(null);
    setVoiceResult(null);

    const twin = matchData.twin;
    postVoiceAuto({
      filename: twin.filename,
      title: twin.metadata.title,
      generated_caption: twin.generated_caption,
      source_collection: twin.metadata.source_collection,
      place_text: twin.metadata.place_text,
      date_text: twin.metadata.date_text,
      original_caption: twin.original_caption,
    })
      .then(setVoiceResult)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Voice generation failed");
      })
      .finally(() => setLoading(false));
  }, [matchData]);

  const reset = () => {
    setVoiceResult(null);
    setLoading(false);
    setError(null);
    lastMatchId.current = null;
  };

  return { voiceResult, voiceLoading: loading, voiceError: error, resetVoice: reset };
}
