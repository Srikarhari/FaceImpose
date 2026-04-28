import type {
  HealthResponse,
  ConfigResponse,
  MatchResponse,
  MatchError,
  RetrievalSearchResponse,
  RetrievalStatusResponse,
} from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "";

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${BASE}/api/health`);
  return res.json();
}

export async function getConfig(): Promise<ConfigResponse> {
  const res = await fetch(`${BASE}/api/config`);
  return res.json();
}

export async function postMatch(
  imageBase64: string,
): Promise<MatchResponse | MatchError> {
  const res = await fetch(`${BASE}/api/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageBase64 }),
  });
  return res.json();
}

// --- v2: book retrieval ---

export async function getRetrievalStatus(): Promise<RetrievalStatusResponse> {
  const res = await fetch(`${BASE}/api/retrieval/status`);
  return res.json();
}

export async function postRetrievalSearch(
  query: string,
  topK = 5,
): Promise<RetrievalSearchResponse> {
  const res = await fetch(`${BASE}/api/retrieval/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: topK }),
  });
  return res.json();
}
