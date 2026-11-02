import { brand } from "@/lib/brand";
import { ipAllowed, normalizeEmail } from "@/lib/auth";
import { GIFT_INTERVAL, GiftLookupError, lookupGift, normalizeGiftCode } from "@/lib/gift";
import { clientIp } from "@/lib/license-code";
import { appUrl, getPolar, notConfigured, productFor, readJson } from "@/lib/polar";

/**
 * Starts a Polar checkout for Pro. Body: { plan: "pro", interval, email? }.
 *
 * Gift claims send { gift: "<code>" } instead of an interval: the code is
 * checked against Polar again (fresh, not the page's cached answer), and the
 * checkout is Pro Annual with the discount pre-applied and locked.
 * Gift claims are rate limited per IP, in memory, per instance.
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  const plan = body?.plan;
  const isGift = body?.gift !== undefined;
  const interval = isGift ? GIFT_INTERVAL : body?.interval;
  if (plan !== "pro" || (interval !== "month" && interval !== "year")) {
    return Response.json(
      { error: "invalid_request", message: 'Expected {"plan":"pro","interval":"month"|"year"}' },
      { status: 400 },
    );
  }

  // Optional: the app passes the signed-in email so the purchase lands on the
  // account it will check (Polar still lets the buyer change it).
  const customerEmail = normalizeEmail(body?.email) ?? undefined;

  let discountId: string | undefined;
  if (isGift) {
    if (!ipAllowed("gift-claim", clientIp(req), 10)) {
      return Response.json(
        { error: "rate_limited", message: "Too many tries. Please wait a few minutes and try again." },
        { status: 429, headers: { "Retry-After": "900" } },
      );
    }
    const code = normalizeGiftCode(body?.gift);
    try {
      const gift = code ? await lookupGift(code) : ({ status: "invalid" } as const);
      if (gift.status !== "valid") {
        return Response.json(
          { error: `gift_${gift.status}`, message: `This gift isn’t available any more. ${brand.name} is still free to download.` },
          { status: 410 },
        );
      }
      discountId = gift.discountId;
    } catch (err) {
      if (!(err instanceof GiftLookupError)) throw err;
      console.error("[checkout] gift lookup failed", err.message);
      return Response.json(
        { error: "gift_unavailable", message: "We couldn’t check this gift right now. Please try again in a minute." },
        { status: 502 },
      );
    }
  }

  const polar = getPolar();
  const product = productFor(interval);
  if (!polar || !product) return notConfigured("Checkout");

  try {
    const checkout = await polar.checkouts.create({
      products: [product],
      // The plan rides along so the license can be minted without another lookup.
      metadata: isGift ? { plan, interval, gift: "true" } : { plan, interval },
      customerEmail,
      // A gift's discount is applied by id and locked: no code field to change it.
      ...(discountId ? { discountId, allowDiscountCodes: false } : {}),
      successUrl: `${appUrl()}/checkout/success?checkout_id={CHECKOUT_ID}`,
    });
    return Response.json({ url: checkout.url });
  } catch (err) {
    console.error("[checkout] failed to create checkout", err);
    return Response.json(
      { error: "checkout_failed", message: "Could not start checkout. Please try again." },
      { status: 502 },
    );
  }
}
