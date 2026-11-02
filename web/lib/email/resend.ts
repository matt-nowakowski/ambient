import { brand } from "../brand";
import type { Rendered } from "./layout";

/**
 * Resend over plain fetch (no SDK dependency). Every call no-ops with a log
 * line when RESEND_API_KEY is unset, so the site and webhook keep working
 * before email is set up. Never throws; returns what happened instead.
 *
 * Logs never include email addresses or keys: only the category and ids.
 */
const API = "https://api.resend.com";

export const FROM = `${brand.name} <${brand.supportEmail}>`;
export const REPLY_TO = brand.supportEmail;

export const resendConfigured = () => Boolean(process.env.RESEND_API_KEY);

export type Result<T = unknown> = { ok: true; data: T } | { ok: false; skipped?: true; status?: number; error: string };

/** Raw Resend REST call (for /admin reads). Never throws. */
export async function resendApi<T>(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>) {
  return call<T>(method, path, body, extraHeaders);
}

async function call<T>(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<Result<T>> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, skipped: true, error: "RESEND_API_KEY not set" };
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "User-Agent": `${brand.slug}-web`,
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg = data && typeof data === "object" && "message" in data ? String((data as { message: unknown }).message) : res.statusText;
      return { ok: false, status: res.status, error: msg };
    }
    return { ok: true, data: data as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  }
}

export type SendInput = {
  to: string;
  email: Rendered;
  /** Resend keeps it 24 h: a retried webhook within that window sends nothing new. */
  idempotencyKey?: string;
  /** Required for marketing: our one-click unsubscribe endpoint (RFC 8058). */
  unsubscribePostUrl?: string;
  tags?: Record<string, string>;
};

const tagValue = (v: string) => v.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);

function payloadFor(input: SendInput): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  const { email } = input;
  const headers: Record<string, string> = {};
  if (email.kind === "marketing") {
    if (!input.unsubscribePostUrl) return { ok: false, error: "marketing email without an unsubscribe URL" };
    headers["List-Unsubscribe"] = `<${input.unsubscribePostUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  const tags = Object.entries({ category: email.category, kind: email.kind, ...input.tags }).map(([name, value]) => ({
    name: tagValue(name),
    value: tagValue(value),
  }));
  return {
    ok: true,
    body: {
      from: FROM,
      to: [input.to],
      reply_to: REPLY_TO,
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: Object.keys(headers).length ? headers : undefined,
      tags,
    },
  };
}

export async function sendEmail(input: SendInput): Promise<Result<{ id: string }>> {
  const { email } = input;
  const payload = payloadFor(input);
  if (!payload.ok) return payload;
  const result = await call<{ id: string }>(
    "POST",
    "/emails",
    payload.body,
    input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey.slice(0, 256) } : undefined,
  );
  if (result.ok) console.info(`[email] sent ${email.category} id=${result.data.id}`);
  else if (result.skipped) console.info(`[email] skipped ${email.category}: RESEND_API_KEY not set`);
  else console.error(`[email] failed ${email.category}: ${result.status ?? ""} ${result.error}`);
  return result;
}

/** Up to 100 emails in one call (Resend batch), one idempotency key for the whole batch. */
export async function sendBatch(items: SendInput[], idempotencyKey: string): Promise<Result<{ data: { id: string }[] }>> {
  if (items.length === 0) return { ok: true, data: { data: [] } };
  if (items.length > 100) return { ok: false, error: "batch over 100" };
  const bodies: Record<string, unknown>[] = [];
  for (const it of items) {
    const p = payloadFor(it);
    if (!p.ok) return p;
    bodies.push(p.body);
  }
  const result = await call<{ data: { id: string }[] }>("POST", "/emails/batch", bodies, { "Idempotency-Key": idempotencyKey.slice(0, 256) });
  const cat = items[0].email.category;
  if (result.ok) console.info(`[email] batch ${cat} sent ${result.data.data?.length ?? 0}`);
  else console.error(`[email] batch ${cat} failed: ${result.status ?? ""} ${result.error}`);
  return result;
}

// ---------------------------------------------------------------------------
// Contacts. Resend contacts are global (one record per address) with one
// `unsubscribed` flag that every Broadcast respects; Segments group them
// (Resend renamed "Audiences" to "Segments" in 2025). Two segments:
//   customers  - added on purchase (soft opt-in, easy opt-out)
//   newsletter - free users, added unsubscribed until they confirm (double opt-in)
// Segment ids come from env (RESEND_AUDIENCE_CUSTOMERS / _NEWSLETTER, names
// kept from the Audiences era); missing → found or created by name on first
// use and the id logged, so it can be pinned in env.
// ---------------------------------------------------------------------------
export type Audience = "customers" | "newsletter";

const SEGMENT_ENV: Record<Audience, string> = {
  customers: "RESEND_AUDIENCE_CUSTOMERS",
  newsletter: "RESEND_AUDIENCE_NEWSLETTER",
};
export const SEGMENT_NAME: Record<Audience, string> = {
  customers: `${brand.name} customers`,
  newsletter: `${brand.name} newsletter`,
};
const segmentCache = new Map<Audience, string>();

export async function segmentId(a: Audience): Promise<string | null> {
  const fromEnv = process.env[SEGMENT_ENV[a]];
  if (fromEnv) return fromEnv;
  const cached = segmentCache.get(a);
  if (cached) return cached;
  const list = await call<{ data?: { id: string; name: string }[] }>("GET", "/segments");
  if (!list.ok) return null;
  let id = list.data.data?.find((x) => x.name === SEGMENT_NAME[a])?.id;
  if (!id) {
    const created = await call<{ id: string }>("POST", "/segments", { name: SEGMENT_NAME[a] });
    if (!created.ok) return null;
    id = created.data.id;
    console.info(`[email] created segment "${SEGMENT_NAME[a]}" id=${id}; set ${SEGMENT_ENV[a]} to pin it`);
  }
  segmentCache.set(a, id);
  return id;
}

type Contact = { id: string; email: string; unsubscribed: boolean };
const contactPath = (email: string) => `/contacts/${encodeURIComponent(email)}`;

export async function getContact(email: string): Promise<Contact | null> {
  const r = await call<Contact>("GET", contactPath(email));
  return r.ok ? r.data : null;
}

/**
 * Puts the address in a segment. A new contact gets `unsubscribed` as given;
 * an existing one keeps its own flag, so someone who opted out is never
 * opted back in by a purchase or a form.
 */
export async function addContactIfNew(a: Audience, email: string, unsubscribed: boolean): Promise<"added" | "exists" | "skipped" | "failed"> {
  if (!resendConfigured()) return "skipped";
  const id = await segmentId(a);
  if (!id) return "failed";
  if (await getContact(email)) {
    await call("POST", `${contactPath(email)}/segments/${id}`);
    return "exists";
  }
  const r = await call("POST", "/contacts", { email, unsubscribed, segments: [{ id }] });
  if (!r.ok) console.error(`[email] add contact to ${a} failed: ${r.status ?? ""} ${r.error}`);
  return r.ok ? "added" : "failed";
}

/** Sets the global marketing opt-out. Unknown address + unsubscribe → nothing to do. */
export async function setUnsubscribed(email: string, unsubscribed: boolean): Promise<boolean> {
  if (!resendConfigured()) return false;
  const r = await call("PATCH", contactPath(email), { unsubscribed });
  if (r.ok) return true;
  if (r.status === 404) return unsubscribed;
  console.error(`[email] update contact failed: ${r.status ?? ""} ${r.error}`);
  return false;
}

/** Creates a Broadcast as a draft (send: false): Matt reviews and sends it from the dashboard. */
export async function createBroadcastDraft(a: Audience, name: string, email: Rendered) {
  const id = await segmentId(a);
  if (!id) return { ok: false as const, error: "segment unavailable (is RESEND_API_KEY set?)" };
  return call<{ id: string }>("POST", "/broadcasts", {
    segment_id: id,
    from: FROM,
    reply_to: REPLY_TO,
    subject: email.subject,
    html: email.html,
    text: email.text,
    name,
    send: false,
  });
}
