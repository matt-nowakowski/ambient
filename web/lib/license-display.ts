import "server-only";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription.js";
import { codeForSubject } from "./license-code";
import { licenseForSubscription } from "./polar";

/**
 * What a person is shown as their license key: the human code
 * (`red-grizzly-4320`) when it can be issued, else the signed token, so a
 * purchase is never stuck when Neon is unavailable. Used by /checkout/success,
 * the welcome and plan-change emails and the admin "resend key".
 * Throws LicenseConfigError (from minting) when signing isn't configured.
 */
export async function licenseForDisplay(
  sub: Pick<Subscription, "metadata" | "currentPeriodEnd">,
  customer: { id: string; email: string },
): Promise<{ key: string; plan: ReturnType<typeof licenseForSubscription>["plan"]; exp: number; isCode: boolean }> {
  const minted = licenseForSubscription(sub, customer);
  try {
    const code = await codeForSubject({ sub: customer.id, email: customer.email, plan: minted.plan });
    return { ...minted, key: code, isCode: true };
  } catch (err) {
    console.warn("[license] code unavailable, showing the signed token:", err instanceof Error ? err.message : err);
    return { ...minted, isCode: false };
  }
}
