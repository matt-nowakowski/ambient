import { authorize, complete, isConfigured, rateLimited, usagePlan, withinFairUse, type Message } from "@/lib/ai";
import { recordUsage, scheduleUsageFlush, tokensFrom } from "@/lib/usage";
import { MAX_TEXT, NO_HELP, allowedKinds, parseVerdict, safeLocale, systemPrompt } from "@/lib/suggest-core";

export const maxDuration = 10;

/**
 * The cloud suggestion judge: "is there something here I can help with?",
 * for computers without an on-device model (Windows, Linux, older Macs) when
 * the user chose the cloud. The app sends a redacted snippet of the window
 * the user has stayed on, `{app, title, text, kinds_allowed, locale}`, and
 * gets back the same strict verdict its on-device judge produces:
 * `{help, kind, title, confidence}`.
 *
 * Pro only, fair-use capped per account per day, a tiny output cap and a
 * short deadline. The window text is never logged or stored.
 */

const MAX_TITLE = 200;
const MAX_APP = 80;
/** The verdict is one short JSON object. */
const MAX_TOKENS = 80;
/** A suggestion that arrives late is worthless: one quick attempt and a retry. */
const BUDGET = { totalMs: 5_000, attemptMs: 3_500 };

type Body = {
  app?: unknown;
  title?: unknown;
  /** Window text, already redacted on the device. */
  text?: unknown;
  kinds_allowed?: unknown;
  locale?: unknown;
};

export async function POST(req: Request) {
  const auth = authorize(req);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  // A Pro feature: Free computers judge with on-device rules only.
  if (auth.kind === "free") return Response.json({ error: "pro_only" }, { status: 403 });
  if (!isConfigured()) return Response.json({ error: "not_configured" }, { status: 503 });
  if (rateLimited(auth.subject)) return Response.json({ error: "rate_limited" }, { status: 429 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.slice(0, MAX_TEXT) : "";
  if (text.trim().length < 50) return Response.json({ error: "missing_text" }, { status: 400 });
  const app = typeof body.app === "string" ? body.app.slice(0, MAX_APP) : "";
  const title = typeof body.title === "string" ? body.title.slice(0, MAX_TITLE) : "";
  const kinds = allowedKinds(body.kinds_allowed);
  // Nothing the user still wants offered: no need to ask the model.
  if (!kinds.length) return Response.json(NO_HELP);

  if (!(await withinFairUse(auth.subject, "suggest"))) {
    return Response.json({ error: "fair_use" }, { status: 429 });
  }

  const messages: Message[] = [
    { role: "system", content: systemPrompt(kinds, safeLocale(body.locale)) },
    { role: "user", content: `App: ${app}\nWindow: ${title}\n---\n${text}` },
  ];
  try {
    const data = await complete(messages, { max_tokens: MAX_TOKENS, temperature: 0 }, BUDGET);
    const reply: string = data?.choices?.[0]?.message?.content ?? "";
    const tokens = tokensFrom(data?.usage, {
      inputChars: messages.reduce((n, m) => n + m.content.length, 0),
      outputChars: reply.length,
    });
    recordUsage({
      kind: "ai_suggest",
      plan: usagePlan(auth),
      subject: auth.subject,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
    });
    scheduleUsageFlush();
    const verdict = parseVerdict(reply, kinds);
    if (!verdict) return Response.json({ error: "unparsable" }, { status: 502 });
    return Response.json(verdict, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // Only the kind of failure: never the request, the reply or the window text.
    console.error("[agent] suggest failed:", err instanceof Error ? err.message.split(":")[0].slice(0, 40) : "error");
    return Response.json({ error: "upstream_failed" }, { status: 502 });
  }
}
