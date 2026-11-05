import { createHash } from "node:crypto";
import { siteUrl } from "../brand";
import { addContactIfNew, getContact, resendConfigured, sendEmail, setUnsubscribed } from "./resend";
import { confirmNewsletter, confirmTips } from "./templates";
import { startTips, stopTips } from "./tips";
import { signToken, tokensConfigured, verifyToken, type ListName, type TipsRequest } from "./tokens";

/**
 * Newsletter double opt-in and unsubscribe, shared by the API routes and the
 * /email/* pages. Opt-in state lives in Resend (contact.unsubscribed); links
 * are HMAC-signed (tokens.ts), so pending sign-ups need no table. Confirmed
 * tips from the app also get a row in our database (tips.ts), deleted again
 * on unsubscribe.
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

/**
 * Starts double opt-in. Same outcome whatever the address's state, so it
 * can't be used to probe. `tips` (the app's "Email me tips") always sends a
 * confirmation, even to an address already opted in, because tips start only
 * from a click in that inbox; what the app sent rides in the signed link and
 * is stored only once it's clicked (startTips).
 */
export async function requestNewsletter(email: string, tips?: TipsRequest): Promise<void> {
  const existing = await getContact(email);
  if (existing && !existing.unsubscribed && !tips) {
    await addContactIfNew("newsletter", email, false); // already opted in (e.g. a customer): just tag
    return;
  }
  // Unconfirmed until they click (an existing contact keeps its own flag).
  await addContactIfNew("newsletter", email, true);
  const t = signToken("confirm", email, "newsletter", Date.now(), tips);
  if (!t) return;
  const day = new Date().toISOString().slice(0, 10);
  const confirmUrl = `${siteUrl}/email/confirm?t=${encodeURIComponent(t)}`;
  await sendEmail({
    to: email,
    email: tips ? confirmTips({ confirmUrl }) : confirmNewsletter({ confirmUrl }),
    // At most one confirmation per address per day, however often the form is sent.
    idempotencyKey: `${tips ? "confirm-tips" : "confirm"}/${emailHash(email)}/${day}`,
  });
}

export async function confirmFromToken(token: unknown): Promise<boolean> {
  const p = verifyToken(token, "confirm");
  if (!p) return false;
  const ok = await setUnsubscribed(p.e, false);
  if (ok && p.a) {
    try {
      await startTips(p.e, p.a);
    } catch (err) {
      console.error("[email] tips start failed:", err instanceof Error ? err.message.slice(0, 80) : "error");
      return false;
    }
  }
  console.info(`[email] ${p.a ? "tips" : "newsletter"} confirm ${ok ? "ok" : "failed"} ${emailHash(p.e)}`);
  return ok;
}

export async function unsubscribeFromToken(token: unknown): Promise<boolean> {
  const p = verifyToken(token, "unsub");
  if (!p) return false;
  const ok = await setUnsubscribed(p.e, true);
  // Our own record goes even if Resend didn't answer: we stop sending either way.
  let forgotten = true;
  try {
    await stopTips(p.e);
  } catch (err) {
    forgotten = false;
    console.error("[email] tips stop failed:", err instanceof Error ? err.message.slice(0, 80) : "error");
  }
  console.info(`[email] unsubscribe ${p.l} ${ok ? "ok" : "failed"} ${emailHash(p.e)}`);
  return ok && forgotten;
}
