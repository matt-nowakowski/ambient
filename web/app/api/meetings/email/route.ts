import { createHash } from "node:crypto";
import { authorize, withinFairUse } from "@/lib/ai";
import { ipAllowed, normalizeEmail, openSession } from "@/lib/auth";
import { clientIp } from "@/lib/license-code";
import { parseMeetingEmail } from "@/lib/meeting-email-core";
import { resendConfigured, sendEmail } from "@/lib/email/resend";
import { meetingNotes } from "@/lib/email/templates";

export const maxDuration = 15;

/**
 * "Email to me" for meeting notes. The app sends one call's notes (summary,
 * decisions, action items, questions, follow-up draft), redacted on the
 * device, and we email them to the signed-in account's own address: the
 * email in the app's sign-in session, or else the one in its paid license.
 * Never to an address from the request body.
 *
 * Nothing is stored and nothing about the content is logged: the notes are
 * rendered, handed to Resend and forgotten. 20 emails a day per account,
 * plus a per-IP limit.
 */
const PER_IP_PER_15_MIN = 30;

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

function sessionEmail(token: string | null): string | null {
  if (!token) return null;
  try {
    return openSession(token);
  } catch {
    // Sign-in isn't configured here: fall back to the license.
    return null;
  }
}

export async function POST(req: Request) {
  if (!ipAllowed("meeting-email", clientIp(req), PER_IP_PER_15_MIN)) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const input = parseMeetingEmail(raw);
  if (!input) return Response.json({ error: "invalid" }, { status: 400 });

  const auth = authorize(req);
  const fromLicense = auth.ok && auth.kind === "paid" ? normalizeEmail(auth.license.email) : null;
  const to = sessionEmail(input.session) ?? fromLicense;
  if (!to) return Response.json({ error: "not_signed_in" }, { status: 401 });
  if (!resendConfigured()) return Response.json({ error: "not_configured" }, { status: 503 });

  const recipient = hash(`meeting-email:${to}`);
  if (!(await withinFairUse(recipient, "meeting_email"))) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const email = meetingNotes({
    title: input.title,
    date: input.date,
    durationMin: input.durationMin,
    summary: input.summary,
    decisions: input.decisions,
    actionItems: input.actionItems,
    questions: input.questions,
    followUp: input.followUp,
  });
  const result = await sendEmail({
    to,
    email,
    idempotencyKey: `meeting-notes/${hash(`${to}|${input.title}|${input.date}`)}`,
  });
  if (!result.ok) {
    // sendEmail has logged the category and status: never the address or the notes.
    return Response.json({ error: result.skipped ? "not_configured" : "send_failed" }, { status: result.skipped ? 503 : 502 });
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
