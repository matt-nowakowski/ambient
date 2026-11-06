import { createHmac, timingSafeEqual } from "node:crypto";
import { ambientProductIds } from "../subscriptions";

/**
 * Polar webhooks (Standard Webhooks), verified and mapped to emails.
 *
 * Verification is done here, not with `validateEvent` from the installed
 * @polar-sh/sdk 0.49: that helper always base64-encodes the secret, which only
 * matches secrets Polar created before 2026-09-08. Newer secrets are used as
 * a normal Standard Webhooks key (the `whsec_` body, base64-decoded). We try
 * both, like SDK 1.x does. Signed content is `${id}.${timestamp}.${body}`,
 * HMAC-SHA256, header `webhook-signature: v1,<base64> [v1,<base64> …]`.
 * Timestamps more than 5 minutes off are rejected (replay window).
 *
 * The Polar org is shared with another product: every event is filtered to
 * Ambient's product ids before anything happens.
 */
const TOLERANCE_SECONDS = 5 * 60;

function candidateKeys(secret: string): Buffer[] {
  const keys = [Buffer.from(secret, "utf8")]; // pre-2026-09-08 secrets
  const body = secret.replace(/^(whsec_|polar_whs_)/, "");
  const decoded = Buffer.from(body, "base64");
  if (decoded.length >= 16) keys.push(decoded); // standard whsec_ secrets
  return keys;
}

export type Verified = { id: string; payload: unknown };

export function verifyPolarWebhook(
  body: string,
  headers: Headers,
  secret: string,
  now = Date.now(),
): Verified | { error: string } {
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigHeader = headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) return { error: "missing_headers" };
  const tsNum = Number(ts);
  if (!Number.isInteger(tsNum) || Math.abs(now / 1000 - tsNum) > TOLERANCE_SECONDS) return { error: "stale_timestamp" };

  const given = sigHeader
    .split(" ")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("v1,"))
    .map((s) => Buffer.from(s.slice(3), "base64"));
  const content = `${id}.${ts}.${body}`;
  const ok = candidateKeys(secret).some((key) => {
    const expected = createHmac("sha256", key).update(content).digest();
    return given.some((g) => g.length === expected.length && timingSafeEqual(g, expected));
  });
  if (!ok) return { error: "bad_signature" };

  try {
    return { id, payload: JSON.parse(body) };
  } catch {
    return { error: "bad_json" };
  }
}

// ---------------------------------------------------------------------------
// Payload reading. Raw JSON (snake_case); only the fields we use.
// ---------------------------------------------------------------------------
type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const date = (v: unknown) => {
  const s = str(v);
  const d = s ? new Date(s) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

export type SubInfo = {
  id: string;
  productId: string | null;
  status: string | null;
  interval: "month" | "year" | null;
  metadata: Record<string, string | number | boolean>;
  currentPeriodEnd: Date | null;
  endsAt: Date | null;
  cancelAtPeriodEnd: boolean;
};

function readSub(v: unknown): SubInfo | null {
  const s = obj(v);
  const id = s && str(s.id);
  if (!s || !id) return null;
  const interval = str(s.recurring_interval);
  return {
    id,
    productId: str(s.product_id) ?? str(obj(s.product)?.id),
    status: str(s.status),
    interval: interval === "month" || interval === "year" ? interval : null,
    metadata: (obj(s.metadata) as SubInfo["metadata"]) ?? {},
    currentPeriodEnd: date(s.current_period_end),
    endsAt: date(s.ends_at),
    cancelAtPeriodEnd: s.cancel_at_period_end === true,
  };
}

/**
 * A first order that carries a discount and costs nothing: the total or net is
 * 0, or the discount is 100% (10000 basis points). Generic on purpose: any
 * such code, not one discount id. Returns the discount's name and code (for
 * the log), or null.
 */
export function fullyDiscounted(order: Json): { name: string | null; code: string | null } | null {
  const discount = obj(order.discount);
  if (!discount && !str(order.discount_id)) return null;
  const free =
    order.total_amount === 0 || order.net_amount === 0 || discount?.basis_points === 10000;
  return free ? { name: str(discount?.name), code: str(discount?.code) } : null;
}

/** Ambient's Polar product ids. Everything else in the shared org is ignored. */
export { ambientProductIds };

export type EmailAction =
  | { email: "welcome"; to: string; customerId: string; sub: SubInfo }
  /** A first order paid in full by a discount (the friends-and-family code). Replaces "welcome". */
  | { email: "welcome_gift"; to: string; customerId: string; sub: SubInfo; discount: { name: string | null; code: string | null } }
  | { email: "plan_changed"; to: string; customerId: string; sub: SubInfo }
  | { email: "cancel_scheduled"; to: string; sub: SubInfo }
  | { email: "ended"; to: string; sub: SubInfo };

export type Decision = { action: EmailAction | null; type: string; reason: string };

/**
 * Event → email. Polar's own emails (receipts, invoices, renewals, payment
 * failed, cancellation/uncancel/revoked notices, plan-change notice) still go
 * out; these add the license key and a person's voice, never a receipt.
 *
 *   order.paid, billing_reason subscription_create → welcome (sign-in card + steps)
 *     …paid in full by a discount (total/net 0, or 100%) → friends-and-family thank-you instead
 *   order.paid, billing_reason subscription_update → plan changed
 *       (an interval change, monthly↔yearly, always invoices immediately)
 *   subscription.canceled, still active + cancel_at_period_end → cancel scheduled
 *   subscription.revoked → ended
 *   everything else → nothing (subscription.past_due: Polar's dunning email covers it)
 */
export function decide(payload: unknown, products = ambientProductIds()): Decision {
  const ev = obj(payload);
  const type = str(ev?.type) ?? "unknown";
  const data = obj(ev?.data);
  if (!data) return { action: null, type, reason: "no data" };
  if (products.size === 0) return { action: null, type, reason: "no Ambient product ids configured" };

  const customer = obj(data.customer);
  const to = str(customer?.email);

  if (type === "order.paid") {
    const sub = readSub(data.subscription);
    const productId = str(data.product_id) ?? sub?.productId ?? null;
    if (!productId || !products.has(productId)) return { action: null, type, reason: "not an Ambient product" };
    const customerId = str(data.customer_id);
    if (!to || !customerId || !sub) return { action: null, type, reason: "missing customer or subscription" };
    const reason = str(data.billing_reason);
    if (reason === "subscription_create") {
      const gift = fullyDiscounted(data);
      if (gift) return { action: { email: "welcome_gift", to, customerId, sub, discount: gift }, type, reason: `${reason}, 100% discount` };
      return { action: { email: "welcome", to, customerId, sub }, type, reason };
    }
    if (reason === "subscription_update") return { action: { email: "plan_changed", to, customerId, sub }, type, reason };
    return { action: null, type, reason: `billing_reason ${reason ?? "none"}: Polar's receipt covers it` };
  }

  if (type === "subscription.canceled" || type === "subscription.revoked") {
    const sub = readSub(data);
    if (!sub?.productId || !products.has(sub.productId)) return { action: null, type, reason: "not an Ambient product" };
    if (!to) return { action: null, type, reason: "missing customer email" };
    if (type === "subscription.revoked") return { action: { email: "ended", to, sub }, type, reason: "access ended" };
    if (sub.cancelAtPeriodEnd && sub.status !== "canceled") {
      return { action: { email: "cancel_scheduled", to, sub }, type, reason: "cancel at period end" };
    }
    return { action: null, type, reason: "immediate cancel: the revoked event sends the goodbye" };
  }

  return { action: null, type, reason: "no email for this event" };
}
