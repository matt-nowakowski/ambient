/**
 * Tests which Polar subscriptions unlock Ambient (lib/subscriptions.ts):
 * past due keeps Pro (the grace covers Polar's retries), other projects'
 * products never count, and no configured product ids means nothing counts.
 *
 * Run: bun scripts/subscriptions-test.ts
 */
import {
  LIVE_STATUSES,
  ambientProductIds,
  isAmbientProduct,
  liveAmbientSubscriptions,
} from "../lib/subscriptions";

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}

const env = {
  POLAR_PRODUCT_PRO_MONTHLY: "pro_m",
  POLAR_PRODUCT_PRO_YEARLY: "pro_y",
  POLAR_PRODUCT_TEAM: " team_a, team_b ,",
};
const products = ambientProductIds(env);
check(
  "product ids from env, team comma-separated and trimmed",
  [...products].sort().join() === "pro_m,pro_y,team_a,team_b",
);
check("no env, no product ids", ambientProductIds({}).size === 0);

const sub = (status: string, productId: string, day: number) => ({
  status,
  productId,
  currentPeriodEnd: new Date(Date.UTC(2026, 10, day)),
});

check(
  "active, trialing and past due are live",
  ["active", "trialing", "past_due"].every((s) => LIVE_STATUSES.has(s)),
);
for (const s of [
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "revoked",
]) {
  check(`${s} is not live`, !LIVE_STATUSES.has(s));
}

check(
  "a past-due Ambient subscription keeps Pro",
  liveAmbientSubscriptions([sub("past_due", "pro_m", 5)], products).length ===
    1,
);
check(
  "a cancelled one doesn't",
  liveAmbientSubscriptions([sub("canceled", "pro_m", 5)], products).length ===
    0,
);
check(
  "another project's product doesn't",
  liveAmbientSubscriptions([sub("active", "other", 5)], products).length === 0,
);
check(
  "with no product ids configured nothing unlocks Pro (fail closed)",
  liveAmbientSubscriptions(
    [sub("active", "pro_m", 5), sub("active", "other", 5)],
    new Set(),
  ).length === 0,
);
check(
  "isAmbientProduct rejects an empty id",
  !isAmbientProduct("", products) && !isAmbientProduct(null, products),
);

const newest = liveAmbientSubscriptions(
  [
    sub("active", "pro_m", 3),
    sub("past_due", "pro_y", 20),
    sub("active", "other", 30),
  ],
  products,
);
check(
  "newest period end first, other products dropped",
  newest.length === 2 && newest[0].productId === "pro_y",
);

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nAll passed");
