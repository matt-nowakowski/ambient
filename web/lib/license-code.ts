import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription.js";
import { brand } from "./brand";
import { mintLicense, type Plan } from "./license";
import { getOrCreateCode, normalizeCode, type CodeStore } from "./license-code-core";
import { getPolar, licenseExpFor, planFor } from "./polar";

export { normalizeCode } from "./license-code-core";

/**
 * Human-readable license codes (`red-grizzly-4320`) backed by one tiny Neon
 * table. The code is what people see (success page, welcome email, the app's
 * Account page); the signed token the app verifies offline is minted from it
 * at /api/license/activate.
 *
 * Neon stays asleep: rows are written only when a key is first issued for a
 * subject (purchase) and read only at activation. Nothing on a public page
 * load touches the table.
 */

/** Missing DATABASE_URL or Polar configuration. */
export class ActivationConfigError extends Error {}

type Sql = NeonQueryFunction<false, false>;
let client: Sql | null = null;
let tableReady: Promise<unknown> | null = null;

/**
 * Its own HTTP client rather than lib/db.ts's db(), which would also create
 * the trial/usage tables on these paths. Neon over HTTP holds no connection.
 */
async function codesDb(): Promise<Sql> {
  if (!process.env.DATABASE_URL) throw new ActivationConfigError("DATABASE_URL");
  client ??= neon(process.env.DATABASE_URL);
  const sql = client;
  // Additive and idempotent, created by the first mint/activation per instance.
  tableReady ??= sql`
    create table if not exists license_codes (
      code text primary key,
      subject text not null unique,
      email text,
      plan text,
      created_at timestamptz not null default now(),
      revoked_at timestamptz
    )`;
  try {
    await tableReady;
  } catch (err) {
    tableReady = null; // retry on the next call
    throw err;
  }
  return sql;
}

export function isLicenseCodeConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function neonStore(sql: Sql): CodeStore {
  return {
    async findBySubject(sub) {
      const rows = await sql`select code, revoked_at is not null as revoked from license_codes where subject = ${sub}`;
      return rows[0] ? { code: String(rows[0].code), revoked: Boolean(rows[0].revoked) } : null;
    },
    async insert(code, rec) {
      const rows = await sql`
        insert into license_codes (code, subject, email, plan)
        values (${code}, ${rec.sub}, ${rec.email || null}, ${rec.plan})
        on conflict do nothing
        returning code`;
      return rows.length === 1;
    },
    async replace(code, rec) {
      try {
        const rows = await sql`
          update license_codes
          set code = ${code}, email = ${rec.email || null}, plan = ${rec.plan}, created_at = now(), revoked_at = null
          where subject = ${rec.sub} and revoked_at is not null
          returning code`;
        return rows.length === 1;
      } catch {
        return false; // primary-key collision on the new code
      }
    },
  };
}

/**
 * The human code for a subject (the Polar customer id: the same `sub` the
 * signed token carries). Get-or-create: calling it again for the same subject
 * returns the same code, so the success page and the welcome email can both
 * call it. Throws if DATABASE_URL is unset or Neon is unreachable; callers
 * should fall back to showing the signed token.
 */
export async function codeForSubject(input: { sub: string; email: string; plan: Plan }): Promise<string> {
  const sql = await codesDb();
  return getOrCreateCode(neonStore(sql), input);
}

/** Looks up a code (any accepted spelling). Null when unknown, revoked or malformed. */
export async function resolveCode(code: unknown): Promise<{ sub: string; email: string; plan: Plan } | null> {
  const normalized = normalizeCode(code, brand.slug);
  if (!normalized) return null; // never wake Neon for something that can't be a code
  const sql = await codesDb();
  const rows = await sql`select subject, email, plan from license_codes where code = ${normalized} and revoked_at is null`;
  const row = rows[0];
  if (!row) return null;
  const plan: Plan = row.plan === "team" ? "team" : "pro";
  return { sub: String(row.subject), email: String(row.email ?? ""), plan };
}

/* ------------------------------------------------------------------ */
/* Activation throttle                                                 */
/* ------------------------------------------------------------------ */

/**
 * In-memory, per instance (like the admin login throttle), 15-minute window:
 * per IP 10 failed lookups or 30 attempts in all; across the instance 30
 * failed lookups. With ~1.07e10 possible codes and N issued, one guess hits
 * with probability N/1.07e10. An attacker who saturates the global limit gets
 * ~2,900 guesses a day per warm instance: at 10k customers that's one hit
 * about every year per instance, and a hit only works while that subscription
 * is paid up (it would reveal the subscriber's email and unlock Pro). Vercel
 * can run several instances, so treat the real ceiling as a small multiple of
 * that. While the global limit is hit, activation returns 429 for everyone on
 * that instance for up to 15 minutes; the app keeps working on its token.
 */
const WINDOW_MS = 15 * 60_000;
const LIMITS = { ipFailures: 10, ipAttempts: 30, allFailures: 30 };
const events = new Map<string, number[]>();

function recent(key: string, now: number) {
  const list = (events.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  events.set(key, list);
  return list;
}

export function activationBlocked(ip: string, now = Date.now()) {
  return (
    recent(`fail:${ip}`, now).length >= LIMITS.ipFailures ||
    recent(`try:${ip}`, now).length >= LIMITS.ipAttempts ||
    recent("fail:all", now).length >= LIMITS.allFailures
  );
}

export function recordActivation(ip: string, found: boolean, now = Date.now()) {
  recent(`try:${ip}`, now).push(now);
  if (!found) {
    recent(`fail:${ip}`, now).push(now);
    recent("fail:all", now).push(now);
  }
  if (events.size > 10_000) events.clear();
}

export function clientIp(req: Request) {
  return req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/* ------------------------------------------------------------------ */
/* Subscription check + token                                          */
/* ------------------------------------------------------------------ */

/** Ambient's products in the shared Polar org; empty = don't filter (sandbox). */
function ambientProducts() {
  return new Set(
    [process.env.POLAR_PRODUCT_PRO_MONTHLY, process.env.POLAR_PRODUCT_PRO_YEARLY, process.env.POLAR_PRODUCT_TEAM].filter(
      (id): id is string => Boolean(id),
    ),
  );
}

/** Newest active/trialing Ambient subscription for a customer (read-only). */
export async function activeAmbientSubscription(customerId: string): Promise<Subscription | null> {
  const polar = getPolar();
  if (!polar) throw new ActivationConfigError("Polar");
  const products = ambientProducts();
  const live: Subscription[] = [];
  for await (const page of await polar.subscriptions.list({ customerId, active: true, limit: 20 })) {
    for (const sub of page.result.items) {
      if ((sub.status === "active" || sub.status === "trialing") && (products.size === 0 || products.has(sub.productId))) {
        live.push(sub);
      }
    }
  }
  live.sort((a, b) => b.currentPeriodEnd.getTime() - a.currentPeriodEnd.getTime());
  return live[0] ?? null;
}

/**
 * Local testing only: skip the Polar check (fake subjects have no
 * subscription). Never on Vercel or in a production build.
 */
export function polarBypass() {
  return (
    process.env.LICENSE_CODE_TEST_BYPASS === "1" &&
    process.env.NODE_ENV !== "production" &&
    !process.env.VERCEL_ENV
  );
}

export type Activation =
  | { ok: true; key: string; code: string; plan: Plan; email: string; exp: number }
  | { ok: false; error: "invalid_code" | "no_active_subscription" };

/**
 * Code → signed token, with the same plan/exp rules as /api/license/refresh
 * (plan from the subscription's metadata, exp = period end + grace). Callers
 * rate limit first (activationBlocked / recordActivation).
 */
export async function activateCode(input: unknown): Promise<Activation> {
  const code = normalizeCode(input, brand.slug);
  const rec = code ? await resolveCode(code) : null;
  if (!code || !rec) return { ok: false, error: "invalid_code" };

  if (polarBypass()) {
    const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
    return { ok: true, key: mintLicense({ ...rec, exp }), code, plan: rec.plan, email: rec.email, exp };
  }

  const sub = await activeAmbientSubscription(rec.sub);
  if (!sub) return { ok: false, error: "no_active_subscription" };
  const plan = planFor(sub);
  const exp = licenseExpFor(sub);
  const email = rec.email || sub.customer?.email || "";
  return { ok: true, key: mintLicense({ sub: rec.sub, email, plan, exp }), code, plan, email, exp };
}
