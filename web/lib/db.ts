import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Neon over HTTP: no pooled connections are held, so nothing keeps the
 * compute awake between requests and it scales to zero when idle. Only trial
 * sign-ups and Free's weekly polish allowance touch the database; paid
 * licenses are verified from their signature alone.
 */
let sql: NeonQueryFunction<false, false> | null = null;
let schemaReady: Promise<unknown> | null = null;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export async function db() {
  if (!sql) sql = neon(process.env.DATABASE_URL as string);
  // Idempotent schema, created on the first query of each instance.
  schemaReady ??= sql`
    create table if not exists trials (
      machine text primary key,
      started_at timestamptz not null default now()
    )`.then(
    () => sql!`
    create table if not exists polish_usage (
      machine text not null,
      week date not null,
      count integer not null default 0,
      primary key (machine, week)
    )`,
  ).then(
    // Fair use on paid plans; only heavy accounts ever get a row here.
    () => sql!`
    create table if not exists fair_use (
      subject text not null,
      day date not null,
      kind text not null,
      count integer not null default 0,
      primary key (subject, day, kind)
    )`,
  );
  await schemaReady;
  return sql;
}

let usageSchemaReady: Promise<unknown> | null = null;

/**
 * Aggregate usage counters (lib/usage.ts), created lazily by the batched
 * flush and the admin page only, so the request paths above never pay for
 * them. Additive: `create table if not exists`, nothing is ever dropped.
 *
 * - usage_daily: one row per (UTC day, kind, plan). No subject ids.
 * - usage_subject_daily: one row per paid account per active day (Pro, Team,
 *   trial; never Free), for top consumers and cost per customer. Pruned after
 *   USAGE_SUBJECT_RETENTION_DAYS.
 */
export async function usageDb() {
  const sql = await db();
  usageSchemaReady ??= sql`
    create table if not exists usage_daily (
      day date not null,
      kind text not null,
      plan text not null,
      requests integer not null default 0,
      input_tokens bigint not null default 0,
      output_tokens bigint not null default 0,
      subjects integer not null default 0,
      primary key (day, kind, plan)
    )`.then(
    () => sql`
    create table if not exists usage_subject_daily (
      day date not null,
      subject text not null,
      plan text not null,
      ai_requests integer not null default 0,
      searches integer not null default 0,
      input_tokens bigint not null default 0,
      output_tokens bigint not null default 0,
      primary key (day, subject)
    )`,
  );
  try {
    await usageSchemaReady;
  } catch (err) {
    usageSchemaReady = null; // retry on the next call
    throw err;
  }
  return sql;
}

let productSchemaReady: Promise<unknown> | null = null;

/**
 * Anonymous product analytics (lib/agent/telemetry-store.ts) and the remote
 * agent config (lib/agent/config-store.ts). Created lazily by those paths and
 * the admin page only; additive, `create table if not exists`.
 *
 * - product_events_daily: counts per (UTC day, event, canonical props, app
 *   version). No install ids, no text: props are allowlisted enums only.
 * - product_installs_daily: opted-in installs per day, as a hash of the
 *   rotating install id and the day, so a row can't be linked to another day,
 *   with the OS, app version and plan the batch came with.
 * - agent_config / agent_config_state / agent_config_history: tunables the
 *   app fetches from /api/agent/config, the auto-tuning pause flag, and every
 *   change with its reason and the numbers behind it.
 *
 * Event rows and install rows are pruned after PRODUCT_RETENTION_DAYS.
 */
export async function productDb() {
  const sql = await db();
  productSchemaReady ??= sql`
    create table if not exists product_events_daily (
      day date not null,
      name text not null,
      props_key text not null,
      version text not null,
      count integer not null default 0,
      primary key (day, name, props_key, version)
    )`
    .then(
      () => sql`
    create table if not exists product_installs_daily (
      day date not null,
      install_hash text not null,
      primary key (day, install_hash)
    )`,
    )
    // Added in 0.1.8: what the batch already carried, for the Installs tab's
    // OS / version / plan mix. Null on rows written before.
    .then(() => sql`alter table product_installs_daily add column if not exists os text`)
    .then(() => sql`alter table product_installs_daily add column if not exists version text`)
    .then(() => sql`alter table product_installs_daily add column if not exists plan text`)
    .then(
      () => sql`
    create table if not exists agent_config (
      key text primary key,
      value jsonb not null,
      source text not null,
      pinned boolean not null default false,
      updated_at timestamptz not null default now()
    )`,
    )
    .then(
      () => sql`
    create table if not exists agent_config_state (
      key text primary key,
      value jsonb not null
    )`,
    )
    .then(
      () => sql`
    create table if not exists agent_config_history (
      id bigserial primary key,
      at timestamptz not null default now(),
      key text not null,
      old_value jsonb,
      new_value jsonb,
      source text not null,
      reason text not null,
      stats jsonb
    )`,
    );
  try {
    await productSchemaReady;
  } catch (err) {
    productSchemaReady = null; // retry on the next call
    throw err;
  }
  return sql;
}

export const PRODUCT_RETENTION_DAYS = 180;

let activitySchemaReady: Promise<unknown> | null = null;

/**
 * Who uses the app at all, Free included (lib/activity.ts), for the admin's
 * Installs tab. Created lazily by those paths and the admin page only;
 * additive, `create table if not exists`, nothing is ever dropped.
 *
 * - device_activity: one row per device (or paid account) per active day,
 *   week and month, as a keyed hash that differs per period, so a row can't
 *   be linked to another period's. Plan only. Pruned after
 *   PRODUCT_RETENTION_DAYS.
 * - daily_counts: plain totals per (UTC day, metric, dimension): installer
 *   downloads by file, version and country, first launches by country. No
 *   identifiers of any kind.
 * - accounts: email addresses that signed in to the app (any plan), with the
 *   plan and first and latest sign-in. Pruned ACCOUNT_RETENTION_DAYS after
 *   the latest.
 */
export async function activityDb() {
  const sql = await db();
  activitySchemaReady ??= sql`
    create table if not exists device_activity (
      period text not null,
      start date not null,
      device text not null,
      plan text not null,
      primary key (period, start, device)
    )`
    .then(
      () => sql`
    create table if not exists daily_counts (
      day date not null,
      metric text not null,
      dim text not null,
      count integer not null default 0,
      primary key (day, metric, dim)
    )`,
    )
    .then(
      () => sql`
    create table if not exists accounts (
      email text primary key,
      plan text not null,
      first_seen timestamptz not null default now(),
      last_seen timestamptz not null default now()
    )`,
    );
  try {
    await activitySchemaReady;
  } catch (err) {
    activitySchemaReady = null; // retry on the next call
    throw err;
  }
  return sql;
}

export const ACCOUNT_RETENTION_DAYS = 365;

/** Monday (UTC) of the current week, and when the next week starts. */
export function currentWeek(now = new Date()) {
  const day = (now.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
  const next = new Date(start.getTime() + 7 * 24 * 3600 * 1000);
  return { week: start.toISOString().slice(0, 10), resetsAt: Math.floor(next.getTime() / 1000) };
}
