/**
 * The local stand-in for our server while scenarios run. The app in test
 * mode sends everything here (`api_base`), under /s/<scenario>/ so each call
 * is counted against its scenario:
 *
 * - POST /api/ai/v1/chat/completions: the hosted model (router, polish,
 *   how-to-type, extraction), as web/lib/ai.ts `complete` would call it.
 * - POST /api/agent/answer: answers and drafts, with the server's own
 *   prompts (web/lib/answer-core.ts) and canned web results (no Tavily).
 * - POST /api/agent/suggest: the cloud suggestion judge
 *   (web/lib/suggest-core.ts).
 * Anything else is answered 404 and reported: the app reached for
 * something the suite doesn't stand in for.
 */
import {
  answerMessages,
  stripCitations,
  MAX_TOKENS,
  MAX_TOKENS_WRITE,
} from "../../web/lib/answer-core";
import {
  allowedKinds,
  NO_HELP,
  parseVerdict,
  safeLocale,
  systemPrompt,
  userMessage,
  MAX_CONTEXT,
  MAX_TEXT,
} from "../../web/lib/suggest-core";
import { type Message, type Model, Refused } from "./model";
import { cannedSearch } from "./search";

export type CallLog = {
  calls: { path: string; status: number; why?: string }[];
  /** A model call was refused (dry mode, budget) or failed. */
  /** Why a model reply wasn't had in time; "slow": past the app's deadline. */
  refused?: "dry" | "budget" | "no_key" | "error" | "slow";
  unexpected: string[];
  error?: string;
};

export type Registry = Map<string, { plan: string; log: CallLog }>;

export function startServer(model: Model, registry: Registry) {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    idleTimeout: 60,
    async fetch(req) {
      const url = new URL(req.url);
      const m = url.pathname.match(/^\/s\/([^/]+)(\/.*)$/);
      const entry = m ? registry.get(decodeURIComponent(m[1])) : undefined;
      if (!m || !entry)
        return new Response("unknown scenario", { status: 404 });
      const path = m[2];
      const log = entry.log;
      const done = (res: Response, why?: string) => {
        log.calls.push({ path, status: res.status, why });
        return res;
      };
      const refuse = (e: unknown) => {
        log.refused = e instanceof Refused ? e.why : "error";
        if (!(e instanceof Refused)) {
          log.error = String(e).slice(0, 300);
          console.error(`  ${m?.[1]} ${path}: ${log.error}`);
        }
        return done(
          Response.json({ error: "upstream_failed" }, { status: 502 }),
          log.refused,
        );
      };
      try {
        if (path === "/api/ai/v1/models")
          return done(Response.json({ data: [] }));
        if (path === "/api/ai/v1/chat/completions" && req.method === "POST") {
          const body = await req.json();
          const messages = (body.messages ?? []) as Message[];
          // Past the router's 6 s deadline (ROUTE_TIMEOUT) the app has
          // already fallen back: that run says nothing about its reasoning.
          // Marked when the deadline passes, not when the reply arrives: by
          // then the app may have finished and been graded.
          const slow = setTimeout(() => (log.refused = "slow"), 5_500);
          let content: string;
          try {
            content = await model.complete(
              messages,
              Number(body.max_tokens ?? 2048),
            );
          } finally {
            clearTimeout(slow);
          }
          return done(
            Response.json({
              id: "test",
              object: "chat.completion",
              model: "polish",
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content },
                  finish_reason: "stop",
                },
              ],
            }),
          );
        }
        if (path === "/api/agent/answer" && req.method === "POST") {
          const started = Date.now();
          const res = await answer(model, await req.json());
          // The app gives an answer about 20 s before it gives up.
          if (Date.now() - started > 20_000) log.refused = "slow";
          return done(res);
        }
        if (path === "/api/agent/suggest" && req.method === "POST") {
          if (entry.plan !== "pro")
            return done(Response.json({ error: "pro_only" }, { status: 403 }));
          return done(await suggest(model, await req.json()));
        }
        log.unexpected.push(`${req.method} ${path}`);
        return done(new Response("not stood in for", { status: 404 }));
      } catch (e) {
        return refuse(e);
      }
    },
  });
  return server;
}

/** /api/agent/answer: the same messages the server builds; one SSE delta. */
async function answer(model: Model, body: Record<string, unknown>) {
  const question =
    typeof body.question === "string"
      ? body.question.trim().slice(0, 1_000)
      : "";
  if (!question)
    return Response.json({ error: "missing_question" }, { status: 400 });
  const context =
    typeof body.context === "string" ? body.context.slice(0, 6_000) : "";
  const searchQuery =
    typeof body.search_query === "string"
      ? body.search_query.trim().slice(0, 160)
      : "";
  const history = Array.isArray(body.history)
    ? (body.history as { q?: unknown; a?: unknown }[])
        .slice(-2)
        .filter((t) => typeof t.q === "string" && typeof t.a === "string")
        .map((t) => ({ q: t.q as string, a: t.a as string }))
    : [];
  let sources = Array.isArray(body.sources)
    ? (body.sources as { title?: string; url: string; excerpt?: string }[])
        .filter((s) => typeof s?.url === "string")
        .map((s) => ({
          title: String(s.title ?? ""),
          url: s.url,
          excerpt: String(s.excerpt ?? ""),
        }))
    : [];
  if (!sources.length && body.needs_web === true && (!context || searchQuery)) {
    sources = cannedSearch(searchQuery || question);
  }
  const writing = body.mode === "write";
  const messages = answerMessages({
    question,
    writing,
    history,
    sources,
    searchFailed: false,
    context,
    contextTag: body.context_tag,
  });
  const text = await model.complete(
    messages,
    writing ? MAX_TOKENS_WRITE : MAX_TOKENS,
  );
  const enc = new TextEncoder();
  const sse = (event: string | null, data: unknown) =>
    `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`;
  // As the server does: answers lose citation markers, drafts don't.
  const t = writing ? text : stripCitations(text);
  const out = sse("sources", sources) + sse(null, { t }) + sse("done", {});
  return new Response(enc.encode(out), {
    headers: { "Content-Type": "text/event-stream" },
  });
}

/** /api/agent/suggest: the cloud judge's verdict. */
async function suggest(model: Model, body: Record<string, unknown>) {
  const text =
    typeof body.text === "string" ? body.text.slice(0, MAX_TEXT) : "";
  if (text.trim().length < 50)
    return Response.json({ error: "missing_text" }, { status: 400 });
  const app = typeof body.app === "string" ? body.app.slice(0, 80) : "";
  const title = typeof body.title === "string" ? body.title.slice(0, 200) : "";
  const context =
    typeof body.context === "string" ? body.context.slice(0, MAX_CONTEXT) : "";
  const kinds = allowedKinds(body.kinds_allowed);
  if (!kinds.length) return Response.json(NO_HELP);
  const messages: Message[] = [
    { role: "system", content: systemPrompt(kinds, safeLocale(body.locale)) },
    { role: "user", content: userMessage(app, title, context, text) },
  ];
  const reply = await model.complete(messages, 80);
  const verdict = parseVerdict(reply, kinds);
  if (!verdict) return Response.json({ error: "unparsable" }, { status: 502 });
  return Response.json(verdict);
}
