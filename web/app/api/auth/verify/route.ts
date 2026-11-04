import { noteAccount } from "@/lib/activity";
import {
  AuthConfigError,
  MAX_CODE_ATTEMPTS,
  accountStatus,
  codeMatches,
  countAttempt,
  ipAllowed,
  isAuthConfigured,
  isThrottleConfigured,
  mintSession,
  normalizeEmail,
  openChallenge,
} from "@/lib/auth";
import { LicenseConfigError, isLicenseSigningConfigured } from "@/lib/license";
import { ActivationConfigError, clientIp } from "@/lib/license-code";
import { notConfigured, readJson } from "@/lib/polar";

/**
 * Checks a sign-in code. Body: { email, code, challenge } (the challenge from
 * /api/auth/code).
 *
 * 200 { session, email, plan, key, exp }: `plan` is "pro" | "team" with the
 * signed license token in `key`, or "free" with `key: null` when the email has
 * no live Ambient subscription. `session` is what the app keeps to refresh.
 *
 * 400 { error: "invalid_code", attemptsLeft } · 400 { error: "expired" |
 * "invalid_challenge" | "invalid_email" } · 429 { error: "too_many_attempts" }
 * (5 per code; ask for a new one) · 429 { error: "rate_limited" } · 503.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!ipAllowed("auth-verify", ip, 60)) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "900" } });
  }

  const body = await readJson(req);
  const email = normalizeEmail(body?.email);
  if (!email) return Response.json({ error: "invalid_email" }, { status: 400 });
  if (!isAuthConfigured() || !isThrottleConfigured() || !isLicenseSigningConfigured()) return notConfigured("Sign-in");

  try {
    // Signature and expiry first: a forged or stale challenge never wakes Neon.
    const challenge = openChallenge(body?.challenge, email);
    if (!challenge.ok) return Response.json({ error: challenge.error }, { status: 400 });

    const tries = await countAttempt(challenge.nonce);
    if (tries > MAX_CODE_ATTEMPTS) return Response.json({ error: "too_many_attempts" }, { status: 429 });
    if (!codeMatches(body?.challenge as string, email, body?.code)) {
      return Response.json({ error: "invalid_code", attemptsLeft: MAX_CODE_ATTEMPTS - tries }, { status: 400 });
    }

    const account = await accountStatus(email);
    noteAccount(email, account.plan);
    return Response.json({ session: mintSession(email), ...account });
  } catch (err) {
    if (err instanceof AuthConfigError || err instanceof LicenseConfigError || err instanceof ActivationConfigError) {
      return notConfigured("Sign-in");
    }
    console.error("[auth/verify] failed", err instanceof Error ? err.message : "unknown error");
    return Response.json({ error: "verify_failed" }, { status: 502 });
  }
}
