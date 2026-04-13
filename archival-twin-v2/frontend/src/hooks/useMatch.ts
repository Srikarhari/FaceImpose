import { useState, useCallback } from "react";
import { postMatch } from "../api/client";
import type { MatchResponse, MatchError } from "../api/types";

export type MatchState =
  | { phase: "idle" }
  | { phase: "processing" }
  | { phase: "matched"; data: MatchResponse; snapshot: string }
  | { phase: "error"; error: string; detail: string };

export function useMatch() {
  const [state, setState] = useState<MatchState>({ phase: "idle" });

  const runMatch = useCallback(async (imageDataUrl: string) => {
    setState({ phase: "processing" });

    try {
      const result = await postMatch(imageDataUrl);

      if ("matched" in result && result.matched) {
        setState({
          phase: "matched",
          data: result as MatchResponse,
          snapshot: imageDataUrl,
        });
      } else {
        const err = result as MatchError;
        setState({ phase: "error", error: err.error, detail: err.detail });
      }
    } catch {
      setState({
        phase: "error",
        error: "network_error",
        detail: "Could not reach the backend. Check the connection.",
      });
    }
  }, []);

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  return { state, runMatch, reset };
}
