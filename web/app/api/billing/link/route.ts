import { after } from "next/server";
import {
  allowBillingLink,
  AuthConfigError,
  ipAllowed,
  isThrottleConfigured,
  normalizeEmail,
} from "@/lib/auth";
import { resendConfigured, sendEmail } from "@/lib/email/resend";
import { billingLink } from "@/lib/email/templates";
import { ambientProducts, clientIp } from "@/lib/license-code";
import { isAmbientProduct, warnIfNoProducts } from "@/lib/subscriptions";
import { getPolar, notConfigured, readJson } from "@/lib/polar";

/**
 * Emails a billing-portal link to an address with an Ambient plan, for people
 * without the app at hand (/billing). Body: { email, website? }.
 *
 * 200 { ok: true } for any well-formed address, customer or not, and whether
 * or not an email went out: the answer never says who has a plan. `website`
 * is a honeypot. 400 invalid_email · 429 rate_limited (3 per email and 10 per
 * IP an hour, plus a per-instance IP window) · 503 not configured.
 *
 * Polar's organisation is shared, so only a customer with an Ambient
 * subscription (any status: a cancelled plan still has invoices) gets a link.
 * Read-only on Polar apart from the customer session it creates. Logs never
 * include the address.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  // Per instance, before anything wakes Neon or Polar.
  if (!ipAllowed("billing-link", ip, 20)) return rateLimited();

  const body = await readJson(req);
  const email = normalizeEmail(body?.email);
  if (!email) return Response.json({ error: "invalid_email" }, { status: 400 });
  if (typeof body?.website === "string" && body.website) return sent();

  const polar = getPolar();
  if (!polar || !isThrottleConfigured() || !resendConfigured())
    return notConfigured("Billing links");

  try {
    if (!(await allowBillingLink(email, ip))) return rateLimited();
  } catch (err) {
    if (err instanceof AuthConfigError) return notConfigured("Billing links");
    console.error(
      "[billing/link] throttle failed",
      err instanceof Error ? err.name : "unknown error",
    );
    return Response.json({ error: "server" }, { status: 502 });
  }

  // The lookup and send run after the response, so a customer and a stranger
  // get the same answer in the same time, and Polar errors never reach it.
  after(() => sendLink(polar, email));
  return sent();
}

async function sendLink(polar: PolarClient, email: string) {
  try {
    const customerId = await ambientCustomer(polar, email);
    if (!customerId) return;
    const session = await polar.customerSessions.create({ customerId });
    // sendEmail logs the outcome by category and id, never the address.
    await sendEmail({
      to: email,
      email: billingLink({
        portalUrl: session.customerPortalUrl,
        expiresAt: session.expiresAt,
      }),
      idempotencyKey: `billing-link/${session.id}`,
    });
  } catch (err) {
    // Polar's errors can echo the request; log only the error's name.
    console.error(
      "[billing/link] failed",
      err instanceof Error ? err.name : "unknown error",
    );
  }
}

type PolarClient = NonNullable<ReturnType<typeof getPolar>>;

/** The customer with this exact address whose Ambient subscription is newest, or null. */
async function ambientCustomer(
  polar: PolarClient,
  email: string,
): Promise<string | null> {
  const products = ambientProducts();
  // Fail closed: with no product ids, any customer of the shared org would match.
  warnIfNoProducts(products, "billing/link");
  if (products.size === 0) return null;
  let best: { id: string; at: number } | null = null;
  for await (const page of await polar.customers.list({ email, limit: 20 })) {
    for (const c of page.result.items) {
      if (c.email?.trim().toLowerCase() !== email) continue;
      for await (const subs of await polar.subscriptions.list({
        customerId: c.id,
        limit: 50,
      })) {
        for (const sub of subs.result.items) {
          if (!isAmbientProduct(sub.productId, products)) continue;
          const at = sub.createdAt.getTime();
          if (!best || at > best.at) best = { id: c.id, at };
        }
      }
    }
  }
  return best?.id ?? null;
}

const sent = () => Response.json({ ok: true });
const rateLimited = () =>
  Response.json(
    { error: "rate_limited" },
    { status: 429, headers: { "Retry-After": "900" } },
  );
