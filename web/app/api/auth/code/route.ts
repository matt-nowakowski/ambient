import { AuthConfigError, CODE_TTL_SECONDS, allowSend, ipAllowed, isAuthConfigured, isThrottleConfigured, newChallenge, normalizeEmail } from "@/lib/auth";
import { deliverSignInCode } from "@/lib/auth-email";
import { clientIp } from "@/lib/license-code";
import { notConfigured, readJson } from "@/lib/polar";

/**
 * Emails a 6-digit sign-in code. Body: { email }.
 *
 * 200 { challenge, expiresIn } for any well-formed address, bought or not:
 * the answer never says whether the email has a purchase. The app sends the
 * challenge back with the code to /api/auth/verify.
 *
 * 400 { error: "invalid_email" } · 429 { error: "rate_limited" } (5 codes per
 * email and 20 per IP an hour) · 502 { error: "send_failed" } · 503.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  // Per instance, before anything wakes Neon.
  if (!ipAllowed("auth-code", ip, 30)) return rateLimited();

  const body = await readJson(req);
  const email = normalizeEmail(body?.email);
  if (!email) return Response.json({ error: "invalid_email" }, { status: 400 });
  if (!isAuthConfigured() || !isThrottleConfigured()) return notConfigured("Sign-in");

  try {
    if (!(await allowSend(email, ip))) return rateLimited();
    const { code, challenge } = newChallenge(email);
    const delivered = await deliverSignInCode(email, code);
    if (delivered === "not_configured") return notConfigured("Sign-in email");
    if (delivered === "failed") return Response.json({ error: "send_failed" }, { status: 502 });
    return Response.json({ challenge, expiresIn: CODE_TTL_SECONDS });
  } catch (err) {
    if (err instanceof AuthConfigError) return notConfigured("Sign-in");
    console.error("[auth/code] failed", err instanceof Error ? err.message : "unknown error");
    return Response.json({ error: "send_failed" }, { status: 502 });
  }
}

const rateLimited = () => Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "900" } });
