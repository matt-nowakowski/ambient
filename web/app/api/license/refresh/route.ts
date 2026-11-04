import { noteActive } from "@/lib/activity";
import { LicenseConfigError, isLicenseSigningConfigured, mintLicense, verifyLicense } from "@/lib/license";
import { activeAmbientSubscription } from "@/lib/license-code";
import { getPolar, licenseExpFor, notConfigured, planFor, readJson } from "@/lib/polar";

/**
 * Verifies the signature (expiry ignored), then asks Polar for an
 * active/trialing Ambient subscription on the key's customer and re-issues the key
 * with a fresh `exp`.
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  const result = verifyLicense(body?.key);
  if (!result.ok) {
    return Response.json({ error: "invalid_key", reason: result.reason }, { status: 400 });
  }

  // A trial ends on its date; only a subscription renews.
  if (result.payload.plan === "trial") {
    return Response.json({ error: "no_active_subscription" }, { status: 402 });
  }

  const polar = getPolar();
  if (!polar || !isLicenseSigningConfigured()) return notConfigured("License refresh");

  try {
    // Ambient's products only: the Polar org is shared with another project.
    const sub = await activeAmbientSubscription(result.payload.sub);
    if (!sub) return Response.json({ error: "no_active_subscription" }, { status: 402 });

    const plan = planFor(sub);
    const exp = licenseExpFor(sub);
    const key = mintLicense({ sub: result.payload.sub, email: result.payload.email, plan, exp });
    noteActive(result.payload.sub, plan);
    return Response.json({ key, plan, exp });
  } catch (err) {
    if (err instanceof LicenseConfigError) return notConfigured("License signing");
    console.error("[license/refresh] failed", err);
    return Response.json({ error: "refresh_failed" }, { status: 502 });
  }
}
