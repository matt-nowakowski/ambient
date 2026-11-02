import { createHash } from "node:crypto";
import { siteUrl } from "../brand";
import { addContactIfNew, getContact, resendConfigured, sendEmail, setUnsubscribed } from "./resend";
import { confirmNewsletter } from "./templates";
import { signToken, tokensConfigured, verifyToken, type ListName } from "./tokens";

/**
 * Newsletter double opt-in and unsubscribe, shared by the API routes and the
 * /email/* pages. State lives only in Resend (contact.unsubscribed); links are
 * HMAC-signed (tokens.ts), so there is no table of our own.
 */
export const emailListsConfigured = () => resendConfigured() && tokensConfigured();

const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;
export const normaliseEmail = (raw: unknown) => {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
};

/** Short, non-reversible id for logs and idempotency keys (never log the address). */
export const emailHash = (email: string) => createHash("sha256").update(email).digest("hex").slice(0, 16);

export const unsubscribeLinks = (email: string, list: ListName) => {
  const t = signToken("unsub", email, list);
  if (!t) return null;
  return {
    page: `${siteUrl}/email/unsubscribe?t=${encodeURIComponent(t)}`,
    oneClick: `${siteUrl}/api/email/unsubscribe?t=${encodeURIComponent(t)}`,
  };
};

/** Starts double opt-in. Same outcome whatever the address's state, so it can't be used to probe. */
export async function requestNewsletter(email: string): Promise<void> {
  const existing = await getContact(email);
  if (existing && !existing.unsubscribed) {
    await addContactIfNew("newsletter", email, false); // already opted in (e.g. a customer): just tag
    return;
  }
  await addContactIfNew("newsletter", email, true); // unconfirmed until they click
  const t = signToken("confirm", email, "newsletter");
  if (!t) return;
  const day = new Date().toISOString().slice(0, 10);
  await sendEmail({
    to: email,
    email: confirmNewsletter({ confirmUrl: `${siteUrl}/email/confirm?t=${encodeURIComponent(t)}` }),
    // At most one confirmation per address per day, however often the form is sent.
    idempotencyKey: `confirm/${emailHash(email)}/${day}`,
  });
}

export async function confirmFromToken(token: unknown): Promise<boolean> {
  const p = verifyToken(token, "confirm");
  if (!p) return false;
  const ok = await setUnsubscribed(p.e, false);
  console.info(`[email] newsletter confirm ${ok ? "ok" : "failed"} ${emailHash(p.e)}`);
  return ok;
}

export async function unsubscribeFromToken(token: unknown): Promise<boolean> {
  const p = verifyToken(token, "unsub");
  if (!p) return false;
  const ok = await setUnsubscribed(p.e, true);
  console.info(`[email] unsubscribe ${p.l} ${ok ? "ok" : "failed"} ${emailHash(p.e)}`);
  return ok;
}
