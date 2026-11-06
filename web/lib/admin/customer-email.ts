import "server-only";
import { createHash } from "node:crypto";
import { siteUrl } from "../brand";
import type { Rendered } from "../email/layout";
import { sendBatch, sendEmail, type SendInput } from "../email/resend";
import { emailHash, unsubscribeLinks } from "../email/subscriptions";
import { highlightAsk, highlightMeetings, personalNote, welcome, winBack } from "../email/templates";
import { getPolar, planFor } from "../polar";
import { dailyQuota, templateById, unsubscribedEmails, type AdminTemplateId } from "./customers";
import type { CustomerRow } from "./metrics";
import { LIVE_STATUSES } from "../subscriptions";

/**
 * Rendering and sending for /admin/customers. Every send:
 * - is idempotent per (template, recipient or segment, UTC day, note text), so a
 *   double click or a resubmitted form can't send twice;
 * - checks Resend Free's 100/day first and refuses what wouldn't fit;
 * - for marketing, skips opted-out contacts and adds unsubscribe links and
 *   List-Unsubscribe headers.
 */
export type Note = { subject: string; body: string };

export const today = () => new Date().toISOString().slice(0, 10);
const noteHash = (n: Note) => createHash("sha256").update(`${n.subject}\n${n.body}`).digest("hex").slice(0, 12);

export function validNote(n: Note): string | null {
  if (!n.subject.trim()) return "Add a subject.";
  if (n.subject.length > 140) return "Keep the subject under 140 characters.";
  if (!n.body.trim()) return "Write the note.";
  if (n.body.length > 5000) return "Keep the note under 5,000 characters.";
  return null;
}

/** For the preview iframe: what the recipient would see (sample unsubscribe link). */
export function renderPreview(template: AdminTemplateId, c: CustomerRow | null, note: Note, segment: boolean): Rendered {
  const unsub = `${siteUrl}/email/unsubscribe?t=preview`;
  // Relative image URLs: an iframe srcdoc resolves them against this page, so previews work on any host.
  const assetBase = "";
  switch (template) {
    case "welcome":
      return welcome({ plan: c?.plan ?? "pro", interval: (c?.interval as "month" | "year") ?? "month", email: c?.email ?? "customer@example.com", renewsAt: new Date(c?.renewsAt ?? Date.now() + 30 * 86_400_000), assetBase });
    case "win-back":
      return winBack({ audience: "customers", unsubscribeUrl: unsub, assetBase });
    case "highlight-ask":
      return highlightAsk({ audience: "customers", unsubscribeUrl: unsub, assetBase });
    case "highlight-meetings":
      return highlightMeetings({ audience: "customers", unsubscribeUrl: unsub, assetBase });
    case "personal-note":
      return personalNote({ subject: note.subject || "(no subject)", body: note.body || "(your note)", unsubscribeUrl: segment ? unsub : undefined, assetBase });
  }
}

type Built = { ok: true; input: SendInput } | { ok: false; error: string };

async function build(template: AdminTemplateId, c: CustomerRow, note: Note, segment: boolean): Promise<Built> {
  if (!c.email) return { ok: false, error: "This customer has no email address in Polar." };
  const t = templateById(template)!;
  const marketing = t.marketing || (template === "personal-note" && segment);
  let links: ReturnType<typeof unsubscribeLinks> = null;
  if (marketing) {
    links = unsubscribeLinks(c.email, "customers");
    if (!links) return { ok: false, error: "EMAIL_TOKEN_SECRET is not set, so marketing emails can't carry an unsubscribe link." };
  }
  let email: Rendered;
  switch (template) {
    case "welcome": {
      const polar = getPolar();
      if (!polar) return { ok: false, error: "Polar isn't configured." };
      const sub = await polar.subscriptions.get({ id: c.subscriptionId });
      if (!LIVE_STATUSES.has(sub.status)) return { ok: false, error: "No live subscription, so there's nothing to sign in to." };
      const plan = planFor(sub) === "team" ? "team" : "pro";
      email = welcome({ plan, interval: sub.recurringInterval === "year" ? "year" : "month", email: c.email, renewsAt: sub.currentPeriodEnd });
      break;
    }
    case "win-back":
      email = winBack({ audience: "customers", unsubscribeUrl: links!.page });
      break;
    case "highlight-ask":
      email = highlightAsk({ audience: "customers", unsubscribeUrl: links!.page });
      break;
    case "highlight-meetings":
      email = highlightMeetings({ audience: "customers", unsubscribeUrl: links!.page });
      break;
    case "personal-note":
      email = personalNote({ subject: note.subject.trim(), body: note.body, unsubscribeUrl: links?.page });
      break;
  }
  return { ok: true, input: { to: c.email, email, unsubscribePostUrl: links?.oneClick, tags: { source: "admin" } } };
}

export type SendOutcome = { ok: true; sent: number; skipped: number } | { ok: false; error: string };

export async function sendToCustomer(template: AdminTemplateId, c: CustomerRow, note: Note): Promise<SendOutcome> {
  const t = templateById(template);
  if (!t) return { ok: false, error: "Unknown template." };
  if (template === "personal-note") {
    const bad = validNote(note);
    if (bad) return { ok: false, error: bad };
  }
  if (t.marketing && c.email) {
    const opted = await unsubscribedEmails();
    if (!opted.ok) return { ok: false, error: `Resend: ${opted.error}` };
    if (opted.set.has(c.email.toLowerCase())) return { ok: false, error: "This customer unsubscribed from marketing emails." };
  }
  const quota = await dailyQuota();
  if (!quota.ok) return { ok: false, error: `Resend: ${quota.error}` };
  if (quota.remaining < 1) return { ok: false, error: `Today's Resend quota is used up (${quota.used}/${quota.limit} in 24 hours).` };

  const built = await build(template, c, note, false);
  if (!built.ok) return built;
  const key = `admin/${template}/${c.customerId}/${today()}${template === "personal-note" ? `/${noteHash(note)}` : ""}`;
  const r = await sendEmail({ ...built.input, idempotencyKey: key });
  console.info(`[admin] send ${template} to ${emailHash(c.email!)}: ${r.ok ? "ok" : r.error}`);
  return r.ok ? { ok: true, sent: 1, skipped: 0 } : { ok: false, error: r.error };
}

export type SegmentPlan = {
  recipients: CustomerRow[];
  skippedUnsubscribed: number;
  skippedNoEmail: number;
  quota: { used: number; limit: number; remaining: number } | null;
  error?: string;
};

/** Who a segment send would reach, after opt-outs. Fresh reads, for the confirm step and the send. */
export async function planSegment(template: AdminTemplateId, rows: CustomerRow[]): Promise<SegmentPlan> {
  const withEmail = rows.filter((r) => r.email);
  const skippedNoEmail = rows.length - withEmail.length;
  const t = templateById(template);
  const marketing = Boolean(t?.marketing) || template === "personal-note";
  let recipients = withEmail;
  let skippedUnsubscribed = 0;
  let error: string | undefined;
  if (marketing) {
    const opted = await unsubscribedEmails();
    if (opted.ok) {
      recipients = withEmail.filter((r) => !opted.set.has(r.email!.toLowerCase()));
      skippedUnsubscribed = withEmail.length - recipients.length;
    } else error = `Resend: ${opted.error}`;
  }
  const q = await dailyQuota();
  if (!q.ok) error ??= `Resend: ${q.error}`;
  return { recipients, skippedUnsubscribed, skippedNoEmail, quota: q.ok ? q : null, error };
}

export async function sendToSegment(template: AdminTemplateId, segmentId: string, rows: CustomerRow[], note: Note, expected: number): Promise<SendOutcome> {
  const t = templateById(template);
  if (!t || t.single) return { ok: false, error: "That template can only go to one customer at a time." };
  if (template === "personal-note") {
    const bad = validNote(note);
    if (bad) return { ok: false, error: bad };
  }
  const plan = await planSegment(template, rows);
  if (plan.error || !plan.quota) return { ok: false, error: plan.error ?? "Couldn't read today's quota." };
  if (plan.recipients.length === 0) return { ok: false, error: "Nobody to send to." };
  if (plan.recipients.length !== expected) {
    return { ok: false, error: `The segment changed since you reviewed it (${expected} → ${plan.recipients.length}). Review it again.` };
  }
  if (plan.recipients.length > plan.quota.remaining) {
    return { ok: false, error: `${plan.recipients.length} emails won't fit: ${plan.quota.remaining} left of today's ${plan.quota.limit}.` };
  }
  const inputs: SendInput[] = [];
  for (const c of plan.recipients) {
    const b = await build(template, c, note, true);
    if (!b.ok) return b;
    inputs.push(b.input);
  }
  let sent = 0;
  for (let i = 0; i < inputs.length; i += 100) {
    const key = `admin-seg/${template}/${segmentId}/${today()}/${template === "personal-note" ? noteHash(note) : "t"}/${i / 100}`;
    const r = await sendBatch(inputs.slice(i, i + 100), key);
    if (!r.ok) return { ok: false, error: `Sent ${sent}, then Resend refused: ${r.error}` };
    sent += r.data.data?.length ?? 0;
  }
  console.info(`[admin] segment ${segmentId} ${template}: sent ${sent}, skipped ${plan.skippedUnsubscribed + plan.skippedNoEmail}`);
  return { ok: true, sent, skipped: plan.skippedUnsubscribed + plan.skippedNoEmail };
}
