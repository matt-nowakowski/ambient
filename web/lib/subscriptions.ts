/**
 * Which Polar subscriptions unlock Ambient. Pure (no Polar client, no
 * server-only) so scripts/subscriptions-test.ts can run it with bun.
 *
 * The Polar organisation is shared with another project, so a subscription
 * counts only when its product is one of Ambient's. With no product ids
 * configured nothing counts: failing open would hand Pro to every customer of
 * the other project.
 */

/**
 * Statuses that keep Pro. `past_due` is a failed renewal that Polar is still
 * retrying: the token's period end + 7-day grace covers the retries, so one
 * declined card doesn't take Pro away within hours.
 */
export const LIVE_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "trialing",
  "past_due",
]);

/** Ambient's Polar product ids (POLAR_PRODUCT_TEAM may list several, comma-separated). */
export function ambientProductIds(
  env: Record<string, string | undefined> = process.env,
): Set<string> {
  return new Set(
    [
      env.POLAR_PRODUCT_PRO_MONTHLY,
      env.POLAR_PRODUCT_PRO_YEARLY,
      ...(env.POLAR_PRODUCT_TEAM ?? "").split(","),
    ]
      .map((s) => s?.trim())
      .filter((s): s is string => Boolean(s)),
  );
}

let warned = false;

/** Logs once per instance that no product ids are set, so nothing unlocks Pro. */
export function warnIfNoProducts(products: Set<string>, where: string) {
  if (products.size > 0 || warned) return;
  warned = true;
  console.error(
    `[${where}] No Ambient Polar product ids are configured (POLAR_PRODUCT_PRO_MONTHLY, POLAR_PRODUCT_PRO_YEARLY, POLAR_PRODUCT_TEAM): no subscription will unlock Pro until they are set.`,
  );
}

/** An Ambient product, failing closed when none are configured. */
export function isAmbientProduct(
  productId: string | null | undefined,
  products: Set<string>,
) {
  return Boolean(productId) && products.has(productId as string);
}

type Sub = { status: string; productId: string; currentPeriodEnd: Date };

/** The live Ambient subscriptions, newest period end first. */
export function liveAmbientSubscriptions<T extends Sub>(
  subs: Iterable<T>,
  products: Set<string>,
): T[] {
  const live = [...subs].filter(
    (s) =>
      LIVE_STATUSES.has(s.status) && isAmbientProduct(s.productId, products),
  );
  return live.sort(
    (a, b) => b.currentPeriodEnd.getTime() - a.currentPeriodEnd.getTime(),
  );
}
