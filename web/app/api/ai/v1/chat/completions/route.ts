import {
  LIMITS,
  authorize,
  complete,
  completionKind,
  consumeFreePolish,
  isConfigured,
  parseMessages,
  rateLimited,
  refundFreePolish,
  usagePlan,
  withinFairUse,
} from "@/lib/ai";
import { recordUsage, scheduleUsageFlush, tokensFrom } from "@/lib/usage";

export const maxDuration = 20;

/** OpenAI-compatible chat completions for Pro's hosted AI polish. */
export async function POST(req: Request) {
  const auth = authorize(req);
  if (!auth.ok) return error(auth.status, auth.error);
  if (!isConfigured()) return error(503, "not_configured");
  if (rateLimited(auth.subject)) return error(429, "rate_limited");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return error(400, "invalid_json");
  }
  if (body.stream === true) return error(400, "streaming_not_supported");
  const messages = parseMessages(body);
  if (!messages) {
    return error(413, "request_too_large", `Up to ${LIMITS.maxMessages} text messages, ${LIMITS.maxInputChars} characters in total.`);
  }

  // Paid plans: a generous daily fair-use limit, so nothing can run away.
  if (auth.kind === "paid" && !(await withinFairUse(auth.subject, "ai"))) {
    return error(429, "fair_use", "Today's fair-use limit is reached. It resets at midnight UTC.");
  }

  // Free gets a weekly allowance, counted before the call and refunded on failure.
  if (auth.kind === "free" && !(await consumeFreePolish(auth.subject))) {
    return error(429, "weekly_limit", "This week's free AI polish is used up. Upgrade to Pro for unlimited polish.");
  }

  try {
    const data = await complete(messages, body);
    const tokens = tokensFrom(data.usage, {
      inputChars: messages.reduce((n, m) => n + m.content.length, 0),
      outputChars: String(data.choices?.[0]?.message?.content ?? "").length,
    });
    recordUsage({
      kind: completionKind(messages),
      plan: usagePlan(auth),
      subject: auth.subject,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
    });
    scheduleUsageFlush();
    return Response.json(data);
  } catch (err) {
    console.error("[ai] completion failed", err);
    if (auth.kind === "free") await refundFreePolish(auth.subject).catch(() => {});
    return error(502, "upstream_failed");
  }
}

function error(status: number, code: string, message?: string) {
  return Response.json({ error: { type: code, message: message ?? code } }, { status });
}
