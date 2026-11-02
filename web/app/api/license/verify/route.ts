import { brand } from "@/lib/brand";
import { verifyLicense } from "@/lib/license";
import { activateCode, activationBlocked, clientIp, isLicenseCodeConfigured, recordActivation } from "@/lib/license-code";
import { readJson } from "@/lib/polar";

/**
 * Signed token: signature + expiry only, no Polar call.
 * Human code (`red-grizzly-4320`): looked up and checked against Polar like
 * /api/license/activate (same throttle), without returning a token.
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  const key = body?.key;

  if (typeof key === "string" && !key.trim().startsWith(brand.licenseKeyPrefix) && isLicenseCodeConfigured()) {
    const ip = clientIp(req);
    if (activationBlocked(ip)) {
      return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "900" } });
    }
    try {
      const result = await activateCode(key);
      recordActivation(ip, result.ok || result.error !== "invalid_code");
      if (result.ok) return Response.json({ valid: true, plan: result.plan, email: result.email, exp: result.exp });
      return Response.json({ valid: false, error: result.error, plan: null, email: null, exp: null });
    } catch (err) {
      console.error("[license/verify] code check failed", err instanceof Error ? err.message : "unknown error");
      return Response.json({ valid: false, error: "check_failed", plan: null, email: null, exp: null }, { status: 502 });
    }
  }

  const result = verifyLicense(key);
  if (!result.ok) {
    return Response.json({ valid: false, error: result.reason, plan: null, email: null, exp: null });
  }
  const { plan, email, exp } = result.payload;
  return Response.json({ valid: !result.expired, plan, email, exp });
}
