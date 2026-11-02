import "server-only";
import { unstable_cache } from "next/cache";
import { recordUsage } from "./usage";

/**
 * Web search for the voice agent's answers (Tavily). Spent sparingly:
 * - basic depth (1 credit; advanced is 2), at most 5 results;
 * - we use Tavily's own excerpts, never page extraction or its answer field;
 * - excerpts are trimmed to a fixed budget before they reach the model;
 * - results are cached by normalised query for 6 hours across all users, in
 *   Vercel's data cache, so repeated and follow-up questions cost nothing.
 * Only the query text is sent to Tavily.
 */
const TAVILY_URL = "https://api.tavily.com/search";
const MAX_RESULTS = 5;
const EXCERPT_CHARS = 700;
const CACHE_SECONDS = 6 * 3600;

export type SearchResult = { title: string; url: string; excerpt: string };

export function isSearchConfigured() {
  return Boolean(process.env.TAVILY_API_KEY);
}

/** Lowercase, collapse whitespace, drop trailing punctuation: "What's X?" ≈ "what's x". */
export function normaliseQuery(q: string) {
  return q.toLowerCase().replace(/\s+/g, " ").replace(/[?.!]+$/, "").trim().slice(0, 300);
}

async function tavily(query: string): Promise<SearchResult[]> {
  const res = await fetch(TAVILY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: MAX_RESULTS,
      include_answer: false,
      include_raw_content: false,
      include_images: false,
    }),
    // Basic search usually answers in 2–4 s; 6 s cut off the slow tail.
    signal: AbortSignal.timeout(8_000),
  });
  // Runs only on a cache miss: this is the call Tavily bills (1 credit, basic).
  recordUsage({ kind: "search_upstream", plan: "all" });
  if (!res.ok) throw new Error(`search ${res.status}`);
  const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
  return (data.results ?? [])
    .filter((r) => r.url)
    .slice(0, MAX_RESULTS)
    .map((r) => ({
      title: (r.title ?? "").slice(0, 120),
      url: r.url as string,
      excerpt: (r.content ?? "").replace(/\s+/g, " ").slice(0, EXCERPT_CHARS),
    }));
}

/** Cached search. The cache key is the normalised query only. */
export function search(query: string): Promise<SearchResult[]> {
  const key = normaliseQuery(query);
  return unstable_cache(() => tavily(key), ["tavily", key], { revalidate: CACHE_SECONDS })();
}
