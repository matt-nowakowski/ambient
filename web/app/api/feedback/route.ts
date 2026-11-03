import { after } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { parseFeedback, type FeedbackInput } from "@/lib/feedback-core";
import { insertFeedback } from "@/lib/feedback-store";
import { clientIp } from "@/lib/license-code";
import { renderEmail } from "@/lib/email/layout";
import { resendConfigured, sendEmail } from "@/lib/email/resend";
import { brand, siteUrl } from "@/lib/brand";

export const maxDuration = 15;

/**
 * Feedback and bug reports from the app, sent only when the user chooses to
 * (the Send feedback dialog, a 👎 on a card, or a report by voice), after the
 * app showed exactly what goes. Stored in Neon for the admin inbox; the body
 * is never logged. Optionally emails FEEDBACK_NOTIFY_EMAIL (unset = no email).
 */
const PER_HOUR = 10;
const HOUR = 3_600_000;
const hits = new Map<string, number[]>();

function allowed(key: string, now = Date.now()) {
  const list = (hits.get(key) ?? []).filter((t) => now - t < HOUR);
  if (list.length >= PER_HOUR) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 10_000) hits.clear(); // bound memory
  return true;
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!allowed(`ip:${ip}`)) return Response.json({ error: "rate_limited" }, { status: 429 });
  // A generous byte cap before parsing: diagnostics are at most 64 KB.
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > 96 * 1024) return Response.json({ error: "too_large" }, { status: 413 });
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > 96 * 1024) return Response.json({ error: "too_large" }, { status: 413 });
    raw = JSON.parse(text);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = parseFeedback(raw);
  if (!parsed.ok) return Response.json({ error: "invalid", field: parsed.error }, { status: 400 });
  const f = parsed.value;
  if (f.install && !allowed(`install:${f.install}`)) return Response.json({ error: "rate_limited" }, { status: 429 });
  if (!isDatabaseConfigured()) return Response.json({ error: "not_configured" }, { status: 503 });

  try {
    await insertFeedback(f);
  } catch (err) {
    console.error("[feedback] store failed:", err instanceof Error ? err.message.split(":")[0].slice(0, 60) : "error");
    return Response.json({ error: "store_failed" }, { status: 502 });
  }
  const notify = process.env.FEEDBACK_NOTIFY_EMAIL?.trim();
  if (notify && resendConfigured()) {
    try {
      after(() => notifyFounder(notify, f).catch(() => undefined));
    } catch {
      // Outside a request scope: skip the notification.
    }
  }
  return Response.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

const KIND_LABEL = { bug: "Bug", idea: "Idea", other: "Feedback" } as const;

async function notifyFounder(to: string, f: FeedbackInput) {
  const email = renderEmail({
    subject: `[${brand.name}] ${KIND_LABEL[f.kind]}: ${f.message.replace(/\s+/g, " ").slice(0, 60)}`,
    preheader: f.message.slice(0, 110),
    eyebrow: `New ${KIND_LABEL[f.kind].toLowerCase()} from the app`,
    kind: "transactional",
    category: "feedback_notify",
    reason: "You get this because FEEDBACK_NOTIFY_EMAIL is set.",
    blocks: [
      { t: "h", text: KIND_LABEL[f.kind] },
      { t: "note", text: `${f.source} · ${f.version} · ${f.os} · ${f.plan}${f.diagnostics ? " · diagnostics" : ""}${f.example ? " · example" : ""}` },
      ...f.message.split(/\n\s*\n/).map((p) => ({ t: "p" as const, text: p })),
      { t: "button", href: `${siteUrl}/admin?tab=feedback`, label: "Open the inbox" },
    ],
  });
  await sendEmail({ to, email });
}
