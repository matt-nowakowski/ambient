import "server-only";
import { unstable_cache } from "next/cache";
import { getPolar, productFor } from "./polar";

/**
 * Gift links: /gift/<code> claims Pro with a 100%-off Polar discount code.
 *
 * Read-only against Polar: we look the discount up by code and never change
 * it. The Polar org is shared with another project, so a code only counts as
 * a gift when it takes 100% off Ambient Pro (it lists the gift product, or no
 * products at all). Anything else is "invalid", so the page never says
 * whether an arbitrary code exists.
 *
 * The gift is Pro Annual: the friends-and-family code is "forever", so either
 * interval stays $0, and annual means one $0 renewal a year instead of twelve.
 */
export const GIFT_INTERVAL = "year" as const;

export type GiftStatus = "valid" | "invalid" | "expired" | "used_up";
export type Gift = { status: "valid"; discountId: string } | { status: Exclude<GiftStatus, "valid"> };

/** Thrown when Polar is unconfigured or unreachable. Never cached. */
export class GiftLookupError extends Error {}

const CODE_RE = /^[A-Za-z0-9_-]{3,64}$/;

export function normalizeGiftCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim();
  return CODE_RE.test(code) ? code.toUpperCase() : null;
}

/** Fresh lookup. Used by the claim endpoint; the page uses the cached one. */
export async function lookupGift(code: string): Promise<Gift> {
  const polar = getPolar();
  const product = productFor(GIFT_INTERVAL);
  if (!polar || !product) throw new GiftLookupError("Polar is not configured");

  let match;
  try {
    // `query` searches name and code; keep only an exact code match.
    const page = await polar.discounts.list({ query: code, limit: 20 });
    match = page.result.items.find((d) => d.code?.toUpperCase() === code);
  } catch (err) {
    throw new GiftLookupError(err instanceof Error ? err.message : "discount lookup failed");
  }

  const isGift =
    match &&
    match.type === "percentage" &&
    "basisPoints" in match &&
    match.basisPoints === 10000 &&
    (match.products.length === 0 || match.products.some((p) => p.id === product));
  if (!match || !isGift) return { status: "invalid" };

  const now = Date.now();
  if (match.startsAt && match.startsAt.getTime() > now) return { status: "invalid" };
  if (match.endsAt && match.endsAt.getTime() <= now) return { status: "expired" };
  if (match.maxRedemptions != null && match.redemptionsCount >= match.maxRedemptions) return { status: "used_up" };
  return { status: "valid", discountId: match.id };
}

/** The page's lookup, cached for 5 minutes per code so views don't hit Polar. */
export const getGift = unstable_cache(lookupGift, ["gift-discount"], { revalidate: 300 });
