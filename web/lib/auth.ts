import "server-only";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { mintLicense, type Plan } from "./license";
import { ActivationConfigError, activeAmbientSubscription, polarBypass } from "./license-code";
import { getPolar, licenseExpFor, planFor } from "./polar";

/**
 * Email sign-in for the desktop app: a 6-digit code by email, then a
 * long-lived session the app trades for its signed license token.
 *
 * Neon stays asleep. Challenges and sessions are HMAC-signed and carry their
 * own state, so refresh (the frequent call) never touches the database. The
 * only rows are short-lived throttle counters, written when a code is sent
 * and when one is tried, keyed by an HMAC of the email (never the email) and
 * deleted once expired.
 *
 *   challenge = base64url(JSON {e, n, h, x}) "." base64url(HMAC)
 *     e = email, n = nonce, h = HMAC of the code (the app can't brute-force it
 *     offline), x = expiry (10 minutes)
 *   session   = base64url(JSON {e, iat, x}) "." base64url(HMAC)
 *     365 days, renewed on every refresh; signing out deletes it on the device
 *
 * Env: AUTH_SECRET (≥ 32 random chars). Without it the secret is derived from
 * LICENSE_PRIVATE_KEY, so a deployment that signs licenses can sign people in.
 * Rotating either signs everyone out (their license tokens keep working until
 * they expire).
 */

export const CODE_TTL_SECONDS = 10 * 60;
export const MAX_CODE_ATTEMPTS = 5;
export const SESSION_TTL_SECONDS = 365 * 24 * 3600;
/** Codes sent per email per hour, and per IP per hour. */
const SENDS_PER_EMAIL_PER_HOUR = 5;
const SENDS_PER_IP_PER_HOUR = 20;

export class AuthConfigError extends Error {}

let cachedSecret: Buffer | null = null;

function secret(): Buffer {
  if (cachedSecret) return cachedSecret;
  const explicit = process.env.AUTH_SECRET ?? "";
  if (explicit.length >= 32) return (cachedSecret = Buffer.from(explicit, "utf8"));
  const licenseKey = process.env.LICENSE_PRIVATE_KEY;
  if (licenseKey) {
    // One-way: knowing the derived secret reveals nothing about the signing key.
    return (cachedSecret = createHash("sha256").update(`ambient-auth:v1:${licenseKey.replace(/\\n/g, "\n").trim()}`).digest());
  }
  throw new AuthConfigError("AUTH_SECRET is not set");
}

export function isAuthConfigured() {
  return (process.env.AUTH_SECRET ?? "").length >= 32 || Boolean(process.env.LICENSE_PRIVATE_KEY);
}

const mac = (purpose: string, body: string) => createHmac("sha256", secret()).update(`ambient-auth:v1:${purpose}:${body}`).digest();

function seal(purpose: string, payload: object) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${mac(purpose, body).toString("base64url")}`;
}

function unseal<T>(purpose: string, token: unknown): T | null {
  if (typeof token !== "string" || token.length > 2048) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const expected = mac(purpose, body);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

const nowSecs = () => Math.floor(Date.now() / 1000);

/** Lower-cased, trimmed address, or null if it can't be one. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/** Stable, non-reversible id for an email: what the throttle table stores. */
const emailId = (email: string) => mac("email-id", email).toString("hex").slice(0, 32);

/* ------------------------------------------------------------------ */
/* Codes and challenges                                                */
/* ------------------------------------------------------------------ */

type Challenge = { e: string; n: string; h: string; x: number };

const codeHash = (nonce: string, email: string, code: string) => mac("code", `${nonce}:${email}:${code}`).toString("base64url");

/** A fresh 6-digit code and the signed challenge that can check it. */
export function newChallenge(email: string) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const n = randomBytes(12).toString("base64url");
  const challenge = seal("challenge", { e: email, n, h: codeHash(n, email, code), x: nowSecs() + CODE_TTL_SECONDS } satisfies Challenge);
  return { code, challenge };
}

export type ChallengeCheck =
  | { ok: true; nonce: string }
  | { ok: false; error: "expired" | "invalid_challenge" };

/** Signature, email and expiry of a challenge (not the code). */
export function openChallenge(token: unknown, email: string): ChallengeCheck {
  const c = unseal<Challenge>("challenge", token);
  if (!c || typeof c.n !== "string" || typeof c.h !== "string" || c.e !== email) return { ok: false, error: "invalid_challenge" };
  if (!Number.isInteger(c.x) || c.x <= nowSecs()) return { ok: false, error: "expired" };
  return { ok: true, nonce: c.n };
}

export function codeMatches(token: string, email: string, code: unknown) {
  const c = unseal<Challenge>("challenge", token);
  if (!c || typeof code !== "string") return false;
  const digits = code.replace(/\D/g, "");
  if (digits.length !== 6) return false;
  const a = Buffer.from(codeHash(c.n, email, digits));
  const b = Buffer.from(c.h);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

type Session = { e: string; iat: number; x: number };

export function mintSession(email: string) {
  const iat = nowSecs();
  return seal("session", { e: email, iat, x: iat + SESSION_TTL_SECONDS } satisfies Session);
}

/** The signed-in email, or null for a bad or expired session. */
export function openSession(token: unknown): string | null {
  const s = unseal<Session>("session", token);
  if (!s || typeof s.e !== "string" || !Number.isInteger(s.x) || s.x <= nowSecs()) return null;
  return normalizeEmail(s.e);
}

/* ------------------------------------------------------------------ */
/* Throttle (the only database use)                                    */
/* ------------------------------------------------------------------ */

type Sql = NeonQueryFunction<false, false>;
let client: Sql | null = null;
let tableReady: Promise<unknown> | null = null;

/** Own HTTP client, like license-code.ts: no other tables are created here. */
async function throttleDb(): Promise<Sql> {
  if (!process.env.DATABASE_URL) throw new AuthConfigError("DATABASE_URL");
  client ??= neon(process.env.DATABASE_URL);
  const sql = client;
  tableReady ??= sql`
    create table if not exists auth_throttle (
      key text primary key,
      count integer not null,
      expires_at timestamptz not null
    )`;
  try {
    await tableReady;
  } catch (err) {
    tableReady = null; // retry on the next call
    throw err;
  }
  return sql;
}

export function isThrottleConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Adds one to each counter (a fresh window if it had expired) and returns the
 * new counts, in one round trip. Expired rows are swept in the same statement,
 * so the table only ever holds the last hour or so.
 */
async function bump(keys: { key: string; ttl: number }[]): Promise<Map<string, number>> {
  const sql = await throttleDb();
  const now = nowSecs();
  const names = keys.map((k) => k.key);
  // The sweep skips the keys being bumped: one statement must not touch a row twice.
  const rows = await sql`
    with gone as (delete from auth_throttle where expires_at < now() and key <> all(${names}::text[]))
    insert into auth_throttle (key, count, expires_at)
    select k, 1, to_timestamp(x)
    from unnest(${names}::text[], ${keys.map((k) => now + k.ttl)}::bigint[]) as t(k, x)
    on conflict (key) do update set
      count = case when auth_throttle.expires_at < now() then 1 else auth_throttle.count + 1 end,
      expires_at = case when auth_throttle.expires_at < now() then excluded.expires_at else auth_throttle.expires_at end
    returning key, count`;
  return new Map(rows.map((r) => [String(r.key), Number(r.count)]));
}

/** Counts a code send; false when the email or IP is over its hourly limit. */
export async function allowSend(email: string, ip: string) {
  const hour = Math.floor(nowSecs() / 3600);
  const emailKey = `send:e:${emailId(email)}:${hour}`;
  const ipKey = `send:i:${mac("ip", ip).toString("hex").slice(0, 32)}:${hour}`;
  const counts = await bump([
    { key: emailKey, ttl: 3600 },
    { key: ipKey, ttl: 3600 },
  ]);
  return (counts.get(emailKey) ?? 0) <= SENDS_PER_EMAIL_PER_HOUR && (counts.get(ipKey) ?? 0) <= SENDS_PER_IP_PER_HOUR;
}

/** Counts a try at a challenge; returns how many tries it has had, this one included. */
export async function countAttempt(nonce: string) {
  const key = `try:${nonce}`;
  const counts = await bump([{ key, ttl: CODE_TTL_SECONDS }]);
  return counts.get(key) ?? MAX_CODE_ATTEMPTS + 1;
}

/* ------------------------------------------------------------------ */
/* In-memory IP throttle (keeps floods from waking Neon at all)        */
/* ------------------------------------------------------------------ */

const WINDOW_MS = 15 * 60_000;
const hits = new Map<string, number[]>();

/** Per-instance sliding window. True when `ip` may make another `kind` call. */
export function ipAllowed(kind: string, ip: string, limit: number, now = Date.now()) {
  const key = `${kind}:${ip}`;
  const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= limit) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 10_000) hits.clear();
  return true;
}

/* ------------------------------------------------------------------ */
/* Account → license                                                   */
/* ------------------------------------------------------------------ */

export type AccountStatus = {
  email: string;
  plan: Plan | "free";
  /** Signed license token while an Ambient subscription is live; null on Free. */
  key: string | null;
  exp: number | null;
};

/**
 * What the email has paid for, from Polar (read-only). Every customer with
 * this address is checked (Polar may hold more than one across the shared
 * org) and only Ambient's products count. Throws ActivationConfigError when
 * Polar isn't configured.
 */
export async function accountStatus(email: string): Promise<AccountStatus> {
  if (polarBypass()) {
    const exp = nowSecs() + 30 * 24 * 3600;
    return { email, plan: "pro", key: mintLicense({ sub: `test_${emailId(email)}`, email, plan: "pro", exp }), exp };
  }
  const polar = getPolar();
  if (!polar) throw new ActivationConfigError("Polar");

  const customers: { id: string; email: string }[] = [];
  for await (const page of await polar.customers.list({ query: email, limit: 20 })) {
    for (const c of page.result.items) {
      if (c.email?.trim().toLowerCase() === email) customers.push({ id: c.id, email: c.email });
    }
  }

  let best: { customerId: string; sub: NonNullable<Awaited<ReturnType<typeof activeAmbientSubscription>>> } | null = null;
  for (const c of customers) {
    const sub = await activeAmbientSubscription(c.id);
    if (sub && (!best || sub.currentPeriodEnd > best.sub.currentPeriodEnd)) best = { customerId: c.id, sub };
  }
  if (!best) return { email, plan: "free", key: null, exp: null };

  const plan = planFor(best.sub);
  const exp = licenseExpFor(best.sub);
  return { email, plan, key: mintLicense({ sub: best.customerId, email, plan, exp }), exp };
}
