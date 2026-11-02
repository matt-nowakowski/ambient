import { createHmac, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Admin auth for /admin. There are no user accounts on this site, so this is
 * deliberately small: an email allowlist, one shared scrypt password hash and
 * an HMAC-signed session cookie. Used by proxy.ts (Node runtime) and by every
 * admin page, server action and /api/admin route, so a check never depends on
 * the proxy alone.
 *
 * Env (all required, or /admin is a 404 — fail closed):
 *   ADMIN_EMAILS          comma-separated allowlist, case-insensitive
 *   ADMIN_PASSWORD_HASH   scrypt:<N>:<r>:<p>:<salt base64>:<key base64>
 *                         (make one with `bun scripts/admin-hash.ts`)
 *   ADMIN_SESSION_SECRET  ≥ 32 random chars, e.g. `openssl rand -base64 48`
 *
 * Cookie: <base64url(email)>.<exp unix>.<base64url(HMAC-SHA256)> over
 * "ambient-admin:v1:<email>:<exp>", httpOnly, SameSite=Strict, Secure in
 * production, 12 hours. Changing ADMIN_SESSION_SECRET signs everyone out;
 * removing an email from ADMIN_EMAILS invalidates that email's sessions.
 */
export const SESSION_TTL_SECONDS = 12 * 3600;
export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-ambient_admin" : "ambient_admin";

export function adminConfigured(): boolean {
  return Boolean(
    adminEmails().length &&
      parseHash(process.env.ADMIN_PASSWORD_HASH ?? "") &&
      (process.env.ADMIN_SESSION_SECRET ?? "").length >= 32,
  );
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

type ParsedHash = { N: number; r: number; p: number; salt: Buffer; key: Buffer };

function parseHash(value: string): ParsedHash | null {
  const parts = value.trim().split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], "base64");
  const key = Buffer.from(parts[5], "base64");
  if (!Number.isInteger(N) || N < 16384 || (N & (N - 1)) !== 0) return null;
  if (!Number.isInteger(r) || r < 1 || !Number.isInteger(p) || p < 1) return null;
  if (salt.length < 16 || key.length < 32) return null;
  return { N, r, p, salt, key };
}

export function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export const HASH_PARAMS = { N: 32768, r: 8, p: 1, keylen: 32 } as const;

export function scryptOptions(N: number, r: number, p: number): ScryptOptions {
  return { N, r, p, maxmem: 256 * N * r };
}

/**
 * Checks email and password together, always doing the scrypt work so a
 * wrong email and a wrong password take the same time and look the same.
 */
export async function checkCredentials(email: string, password: string): Promise<string | null> {
  const parsed = parseHash(process.env.ADMIN_PASSWORD_HASH ?? "");
  if (!parsed || !adminConfigured()) return null;
  const normalised = email.trim().toLowerCase();
  const derived = await scrypt(password.slice(0, 1024), parsed.salt, parsed.key.length, scryptOptions(parsed.N, parsed.r, parsed.p));
  const passwordOk = timingSafeEqual(derived, parsed.key);
  const emailOk = adminEmails().some((allowed) => safeEqual(allowed, normalised));
  return passwordOk && emailOk ? normalised : null;
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function mac(email: string, exp: number) {
  return createHmac("sha256", process.env.ADMIN_SESSION_SECRET as string)
    .update(`ambient-admin:v1:${email}:${exp}`)
    .digest();
}

export function signSession(email: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const value = `${Buffer.from(email).toString("base64url")}.${exp}.${mac(email, exp).toString("base64url")}`;
  return { value, exp };
}

/** The signed-in admin's email, or null. */
export function verifySession(cookie: string | undefined | null, now = Date.now()): string | null {
  if (!cookie || !adminConfigured()) return null;
  const parts = cookie.split(".");
  if (parts.length !== 3) return null;
  const [emailPart, expPart, sigPart] = parts;
  const exp = Number(expPart);
  if (!Number.isInteger(exp) || exp <= Math.floor(now / 1000)) return null;
  let email: string;
  try {
    email = Buffer.from(emailPart, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = mac(email, exp);
  const given = Buffer.from(sigPart, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return adminEmails().includes(email) ? email : null;
}

export function sessionCookieOptions(exp: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    expires: new Date(exp * 1000),
  };
}

/**
 * Failed-login throttle, per client IP and overall, in this instance's memory:
 * 5 failures per IP and 30 overall per 15 minutes. Per instance only, which
 * is fine next to a 32k-cost scrypt hash and a strong password.
 */
const WINDOW_MS = 15 * 60_000;
const failures = new Map<string, number[]>();

function recent(key: string, now: number) {
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(key, list);
  return list;
}

export function loginBlocked(ip: string, now = Date.now()) {
  return recent(`ip:${ip}`, now).length >= 5 || recent("all", now).length >= 30;
}

export function recordLoginFailure(ip: string, now = Date.now()) {
  recent(`ip:${ip}`, now).push(now);
  recent("all", now).push(now);
  if (failures.size > 5_000) failures.clear();
}

export function clearLoginFailures(ip: string) {
  failures.delete(`ip:${ip}`);
}
