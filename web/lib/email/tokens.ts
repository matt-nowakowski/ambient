import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, stateless links for email confirmation and unsubscribe, so we keep
 * no email list of our own (Resend holds the contacts; Neon never sees them).
 *
 *   base64url(JSON {p, e, l, x}) + "." + base64url(HMAC-SHA256)
 *
 * p = purpose ("confirm" | "unsub"), e = email, l = list ("customers" |
 * "newsletter"), x = expiry (unix seconds). Unsubscribe links last a year
 * (they're in old emails); confirmation links 7 days.
 *
 * Env: EMAIL_TOKEN_SECRET (≥ 32 random chars). Missing → tokens can't be made
 * or checked, and the routes that need them answer 503.
 */
export type TokenPurpose = "confirm" | "unsub";
export type ListName = "customers" | "newsletter";
export type TokenPayload = { p: TokenPurpose; e: string; l: ListName; x: number };

const TTL: Record<TokenPurpose, number> = { confirm: 7 * 86400, unsub: 365 * 86400 };

function secret(): string | null {
  const s = process.env.EMAIL_TOKEN_SECRET ?? "";
  return s.length >= 32 ? s : null;
}

export const tokensConfigured = () => secret() !== null;

const mac = (key: string, body: string) =>
  createHmac("sha256", key).update(`ambient-email:v1:${body}`).digest();

export function signToken(p: TokenPurpose, email: string, l: ListName, now = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  const payload: TokenPayload = { p, e: email.trim().toLowerCase(), l, x: Math.floor(now / 1000) + TTL[p] };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(key, body).toString("base64url")}`;
}

export function verifyToken(token: unknown, purpose: TokenPurpose, now = Date.now()): TokenPayload | null {
  const key = secret();
  if (!key || typeof token !== "string" || token.length > 1024) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const expected = mac(key, body);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    if (payload.p !== purpose || typeof payload.e !== "string" || !payload.e.includes("@")) return null;
    if (payload.l !== "customers" && payload.l !== "newsletter") return null;
    if (!Number.isInteger(payload.x) || payload.x <= Math.floor(now / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
