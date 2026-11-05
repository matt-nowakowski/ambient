import {
  authorize,
  consumeFreePolish,
  isConfigured,
  rateLimited,
  refundFreePolish,
  streamComplete,
  usagePlan,
  withinFairUse,
  type Message,
} from "@/lib/ai";
import { recordUsage, scheduleUsageFlush } from "@/lib/usage";
import { isSearchConfigured, search, type SearchResult } from "@/lib/search";
import {
  MAX_TOKENS,
  MAX_TOKENS_WRITE,
  answerMessages,
} from "@/lib/answer-core";

export const maxDuration = 30;

/** Caps keep every answer's cost bounded. */
const MAX_QUESTION = 1_000;
/** A search query sent alongside window text (an accepted suggestion). */
const MAX_SEARCH_QUERY = 160;
const MAX_CONTEXT = 6_000;
const MAX_TURNS = 2;

type Body = {
  question?: unknown;
  /** Text of the window the user asked about, already redacted on device. */
  context?: unknown;
  /** Ask the web? Decided by the router; the server never searches otherwise. */
  needs_web?: unknown;
  /** With window text: what to search for alongside it (an accepted
   * suggestion that needs fresh facts, e.g. the error message). Only this
   * query goes to the search provider, never the window text. */
  search_query?: unknown;
  /** Sources from the previous answer, reused for follow-ups (no new search). */
  sources?: unknown;
  /** Previous turns of this conversation, newest last. */
  history?: unknown;
  /** "write": produce ready-to-paste text (a reply, a rewrite) instead of an answer. */
  mode?: unknown;
  /** What `context` is: "window_text" (default) or "selected_text" (a rewrite). */
  context_tag?: unknown;
};

/**
 * The voice agent's answer card. Server-sent events:
 *   event: sources  data: [{title,url}]
 *   data: {"t": "...delta..."}
 *   event: done     data: {}
 *   event: error    data: {"code": "..."}
 */
export async function POST(req: Request) {
  const auth = authorize(req);
  if (!auth.ok)
    return Response.json({ error: auth.error }, { status: auth.status });
  if (!isConfigured())
    return Response.json({ error: "not_configured" }, { status: 503 });
  if (rateLimited(auth.subject))
    return Response.json({ error: "rate_limited" }, { status: 429 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const question =
    typeof body.question === "string"
      ? body.question.trim().slice(0, MAX_QUESTION)
      : "";
  if (!question)
    return Response.json({ error: "missing_question" }, { status: 400 });
  const context =
    typeof body.context === "string" ? body.context.slice(0, MAX_CONTEXT) : "";
  const searchQuery =
    typeof body.search_query === "string"
      ? body.search_query.trim().slice(0, MAX_SEARCH_QUERY)
      : "";
  const history = Array.isArray(body.history)
    ? (body.history as { q?: unknown; a?: unknown }[])
        .slice(-MAX_TURNS)
        .filter((t) => typeof t.q === "string" && typeof t.a === "string")
        .map((t) => ({
          q: (t.q as string).slice(0, MAX_QUESTION),
          a: (t.a as string).slice(0, 2_000),
        }))
    : [];
  const reused = Array.isArray(body.sources)
    ? (body.sources as SearchResult[])
        .filter((s) => typeof s?.url === "string")
        .slice(0, 5)
        .map((s) => ({
          title: String(s.title ?? "").slice(0, 120),
          url: s.url,
          excerpt: String(s.excerpt ?? "").slice(0, 700),
        }))
    : [];

  if (auth.kind === "free" && !(await consumeFreePolish(auth.subject))) {
    return Response.json({ error: "weekly_limit" }, { status: 429 });
  }
  if (auth.kind === "paid" && !(await withinFairUse(auth.subject, "ai"))) {
    return Response.json({ error: "fair_use" }, { status: 429 });
  }

  // Search only when the router said so, there's no window text to answer
  // from (or a query was given to search alongside it), and this isn't a
  // follow-up that can reuse earlier results.
  let sources: SearchResult[] = reused;
  let searchFailed = false;
  // Searches cost the most: paid accounts have their own daily cap (Free's
  // searches already come out of its weekly allowance).
  const searchAllowed =
    auth.kind === "free" || (await withinFairUse(auth.subject, "search"));
  if (
    !sources.length &&
    body.needs_web === true &&
    (!context || searchQuery) &&
    isSearchConfigured() &&
    searchAllowed
  ) {
    recordUsage({
      kind: "search",
      plan: usagePlan(auth),
      subject: auth.subject,
    });
    try {
      sources = await search(searchQuery || question);
    } catch (err) {
      console.error("[agent] search failed", err);
      searchFailed = true;
    }
  }

  const writing = body.mode === "write";
  const messages: Message[] = answerMessages({
    question,
    writing,
    history,
    sources,
    searchFailed,
    context,
    contextTag: body.context_tag,
  });

  let deltas: ReadableStream<string>;
  try {
    deltas = await streamComplete(
      messages,
      writing ? MAX_TOKENS_WRITE : MAX_TOKENS,
      (tokens) =>
        recordUsage({
          kind: writing ? "ai_write" : "ai_answer",
          plan: usagePlan(auth),
          subject: auth.subject,
          inputTokens: tokens.input,
          outputTokens: tokens.output,
        }),
    );
  } catch (err) {
    console.error("[agent] answer failed", err);
    if (auth.kind === "free")
      await refundFreePolish(auth.subject).catch(() => {});
    return Response.json({ error: "upstream_failed" }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const sse = (event: string | null, data: unknown) =>
    encoder.encode(
      `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`,
    );
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(sse("sources", sources));
      const reader = deltas.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          controller.enqueue(sse(null, { t: value }));
        }
        controller.enqueue(sse("done", {}));
      } catch (err) {
        console.error("[agent] stream failed", err);
        controller.enqueue(sse("error", { code: "upstream_failed" }));
      } finally {
        controller.close();
      }
    },
  });
  // Runs once the stream has closed, so this answer's tokens are counted.
  scheduleUsageFlush();
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
