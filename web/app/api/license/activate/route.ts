import { LicenseConfigError, isLicenseSigningConfigured } from "@/lib/license";
import {
  ActivationConfigError,
  activateCode,
  activationBlocked,
  clientIp,
  isLicenseCodeConfigured,
  recordActivation,
} from "@/lib/license-code";
import { notConfigured, readJson } from "@/lib/polar";

/**
 * Trades a human license code (`red-grizzly-4320`) for the signed token the
 * app verifies offline, while the subscription behind it is active.
 *
 * Body: { code, machine? } (`machine` is accepted for future per-device limits
 * and ignored today).
 *
 * 200 { key, code, plan, email, exp } · 400 { error: "invalid_code" } (unknown,
 * revoked or malformed: deliberately one answer) · 402 { error:
 * "no_active_subscription" } · 429 { error: "rate_limited" } · 503 not_configured.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (activationBlocked(ip)) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "900" } });
  }
  if (!isLicenseCodeConfigured() || !isLicenseSigningConfigured()) return notConfigured("License activation");

  const body = await readJson(req);
  try {
    const result = await activateCode(body?.code);
    recordActivation(ip, result.ok || result.error !== "invalid_code");
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.error === "invalid_code" ? 400 : 402 });
    }
    const { key, code, plan, email, exp, periodEnd, cancelAtPeriodEnd } = result;
    return Response.json({ key, code, plan, email, exp, periodEnd, cancelAtPeriodEnd });
  } catch (err) {
    if (err instanceof LicenseConfigError || err instanceof ActivationConfigError) return notConfigured("License activation");
    console.error("[license/activate] failed", err instanceof Error ? err.message : "unknown error");
    return Response.json({ error: "activation_failed" }, { status: 502 });
  }
}
