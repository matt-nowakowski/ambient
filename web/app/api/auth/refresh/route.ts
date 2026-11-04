import { noteAccount } from "@/lib/activity";
import { AuthConfigError, accountStatus, ipAllowed, isAuthConfigured, mintSession, openSession } from "@/lib/auth";
import { LicenseConfigError, isLicenseSigningConfigured } from "@/lib/license";
import { ActivationConfigError, clientIp } from "@/lib/license-code";
import { notConfigured, readJson } from "@/lib/polar";

/**
 * The signed-in app's periodic check (every few hours, and when its window
 * gains focus). Body: { session }. One read-only Polar lookup; the only
 * write is the account's latest sign-in (lib/activity.ts, at most daily,
 * after the response). Renewals, plan changes, cancellations and refunds all show up
 * here, because the answer is whatever Polar says now.
 *
 * 200 { session, email, plan, key, exp }, the same shape as /api/auth/verify,
 * with a renewed session · 401 { error: "invalid_session" } (signed out on
 * the device) · 429 · 503.
 */
export async function POST(req: Request) {
  if (!ipAllowed("auth-refresh", clientIp(req), 120)) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "900" } });
  }
  if (!isAuthConfigured() || !isLicenseSigningConfigured()) return notConfigured("Sign-in");

  const body = await readJson(req);
  try {
    const email = openSession(body?.session);
    if (!email) return Response.json({ error: "invalid_session" }, { status: 401 });
    const account = await accountStatus(email);
    noteAccount(email, account.plan);
    return Response.json({ session: mintSession(email), ...account });
  } catch (err) {
    if (err instanceof AuthConfigError || err instanceof LicenseConfigError || err instanceof ActivationConfigError) {
      return notConfigured("Sign-in");
    }
    console.error("[auth/refresh] failed", err instanceof Error ? err.message : "unknown error");
    return Response.json({ error: "refresh_failed" }, { status: 502 });
  }
}
