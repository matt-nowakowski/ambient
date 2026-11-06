import "server-only";
import { Polar } from "@polar-sh/sdk";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription.js";
import { siteUrl } from "./brand";
import { GRACE_SECONDS, mintLicense, planFromMetadata, type Plan } from "./license";
import { ambientProductIds, liveAmbientSubscriptions, warnIfNoProducts } from "./subscriptions";

/**
 * Polar is the merchant of record: it runs checkout, invoices, tax and the
 * customer portal. We never see card data. Everything is env-gated so the
 * site builds and renders without credentials.
 *
 * Env: POLAR_ACCESS_TOKEN, POLAR_ENV ("production" | "sandbox"),
 * POLAR_PRODUCT_PRO_MONTHLY, POLAR_PRODUCT_PRO_YEARLY, POLAR_PRODUCT_TEAM
 * (Ambient's products in the shared org; none set means nothing unlocks Pro).
 */
let client: Polar | null = null;

export function getPolar(): Polar | null {
  const token = process.env.POLAR_ACCESS_TOKEN;
  if (!token) return null;
  if (!client) {
    client = new Polar({
      accessToken: token,
      server: process.env.POLAR_ENV === "production" ? "production" : "sandbox",
      // The SDK sets no timeout by default: a stalled Polar call would hold a
      // function open for its full max duration. Per-call timeouts still win.
      timeoutMs: 15_000,
    });
  }
  return client;
}

/** Polar models a billing interval as a separate product. */
export function productFor(interval: "month" | "year"): string | undefined {
  return interval === "month"
    ? process.env.POLAR_PRODUCT_PRO_MONTHLY
    : process.env.POLAR_PRODUCT_PRO_YEARLY;
}

export function appUrl() {
  return siteUrl;
}

export function notConfigured(what: string) {
  return Response.json(
    {
      error: "not_configured",
      message: `${what} is not configured on this deployment. Set the required environment variables (see .env.example).`,
    },
    { status: 503 },
  );
}

export function licenseExpFor(sub: Pick<Subscription, "currentPeriodEnd">) {
  return Math.floor(sub.currentPeriodEnd.getTime() / 1000) + GRACE_SECONDS;
}

/**
 * The real end of the paid period and whether it renews, for the app's
 * "Renews …" / "Ends …" line. The token's `exp` is this plus the grace.
 */
export function billingPeriod(sub: Pick<Subscription, "currentPeriodEnd" | "cancelAtPeriodEnd">) {
  return {
    periodEnd: Math.floor(sub.currentPeriodEnd.getTime() / 1000),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd === true,
  };
}

export function planFor(sub: Pick<Subscription, "metadata">): Plan {
  // Polar metadata values may be strings, numbers or booleans; only `plan` matters.
  const plan = sub.metadata?.plan;
  return planFromMetadata(typeof plan === "string" ? { plan } : null);
}

/**
 * Mints the license key for a subscription. One helper for every place that
 * issues a key from a subscription (the success page, the welcome email), so
 * they always agree on plan and expiry. Throws LicenseConfigError when signing
 * isn't configured.
 */
export function licenseForSubscription(
  sub: Pick<Subscription, "metadata" | "currentPeriodEnd">,
  customer: { id: string; email: string },
) {
  const plan = planFor(sub);
  const exp = licenseExpFor(sub);
  return { key: mintLicense({ sub: customer.id, email: customer.email, plan, exp }), plan, exp };
}

/**
 * Newest live Ambient subscription for a customer, or null. Same rules as
 * activeAmbientSubscription (lib/subscriptions.ts), for callers that already
 * hold a client.
 */
export async function findActiveSubscription(polar: Polar, customerId: string) {
  const products = ambientProductIds();
  warnIfNoProducts(products, "polar");
  if (products.size === 0) return null;
  const all: Subscription[] = [];
  for await (const page of await polar.subscriptions.list({ customerId, limit: 50 })) {
    all.push(...page.result.items);
  }
  return liveAmbientSubscriptions(all, products)[0] ?? null;
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
