import "server-only";
import { createHmac } from "node:crypto";
import { after } from "next/server";
import { ACCOUNT_RETENTION_DAYS, PRODUCT_RETENTION_DAYS, activityDb, isDatabaseConfigured } from "./db";

/**
 * Who uses the app, Free included, for the admin's Installs tab. Fed by the
 * app's anonymous daily check-in (/api/ping: machine hash, OS, version and
 * plan, nothing else), by requests the app already makes (trial check, Free
 * usage, hosted AI, sign-in and plan checks) and by the website's download
 * links.
 *
 * Every write runs after the response (`after()`), never throws, and is
 * deduplicated per server instance per day, so a busy device costs at most a
 * write or two a day.
 */
export type ActivePlan = "free" | "trial" | "pro" | "team";

const PERIODS = ["day", "week", "month"] as const;
const MAX_SEEN = 50_000;

let seenDay = "";
let seen = new Set<string>();
let lastPrune = "";

const today = () => new Date().toISOString().slice(0, 10);

/** Forgets yesterday's dedupe keys; true when `key` was already written today. */
function alreadySeen(key: string) {
  const day = today();
  if (day !== seenDay || seen.size > MAX_SEEN) {
    seenDay = day;
    seen = new Set();
  }
  if (seen.has(key)) return true;
  seen.add(key);
  return false;
}

function run(task: () => Promise<unknown>, what: string) {
  const go = () =>
    task().catch((err) => console.error(`[activity] ${what} failed:`, err instanceof Error ? err.message.slice(0, 80) : "error"));
  try {
    after(go);
  } catch {
    // Outside a request scope (build, tests): nothing to record.
  }
}

/** UTC start of the day, ISO week (Monday) and month a day falls in. */
export function periodStarts(day: string): Record<(typeof PERIODS)[number], string> {
  const d = new Date(`${day}T00:00:00Z`);
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return { day, week: monday.toISOString().slice(0, 10), month: `${day.slice(0, 7)}-01` };
}

/**
 * A keyed hash of the device (or paid account) that differs per period, so a
 * day's row can't be matched to another day's, or to the trials table,
 * without the server key.
 */
function periodHash(identity: string, period: string, start: string) {
  const secret = process.env.LICENSE_PRIVATE_KEY ?? "";
  return createHmac("sha256", `active:${secret}`).update(`${identity}|${period}|${start}`).digest("hex").slice(0, 24);
}

/**
 * The identity a subject counts under. Free's subject is the keyed machine
 * hash and a trial's is `trial_` + its first 24 characters, so one computer
 * counts once whichever plan it is on; paid plans count per account.
 */
export function activityIdentity(subject: string, plan: ActivePlan): string {
  if (plan === "free") return `d:${subject.slice(0, 24)}`;
  if (subject.startsWith("trial_")) return `d:${subject.slice(6)}`;
  return `a:${subject}`;
}

/** What the daily check-in adds to a device's rows (`/api/ping`). */
export type CheckinDetails = { os: string; arch: string; version: string };

/** Marks a device or account active today (and this week and month). */
export function noteActive(subject: string, plan: ActivePlan) {
  try {
    if (!isDatabaseConfigured() || !subject) return;
    const identity = activityIdentity(subject, plan);
    if (alreadySeen(`active|${identity}|${plan}`)) return;
    writeActive(identity, plan, null);
  } catch {
    // Counting never affects the response.
  }
}

/**
 * The app's daily check-in: always counts the computer (by its machine hash,
 * on every plan), with its OS, architecture and app version. Free and trial
 * land on the same rows as noteActive's; Pro and Team get a device row beside
 * their account row (the Installs tab counts the larger of the two, so a paid
 * user isn't counted twice).
 */
export function noteCheckin(machineSubject: string, plan: ActivePlan, details: CheckinDetails) {
  try {
    if (!isDatabaseConfigured() || !machineSubject) return;
    const identity = `d:${machineSubject.slice(0, 24)}`;
    if (alreadySeen(`checkin|${identity}|${plan}|${details.version}`)) return;
    writeActive(identity, plan, details);
  } catch {
    // Counting never affects the response.
  }
}

function writeActive(identity: string, plan: ActivePlan, details: CheckinDetails | null) {
  const day = today();
  const starts = periodStarts(day);
  const rows = PERIODS.map((p) => ({ period: p, start: starts[p], device: periodHash(identity, p, starts[p]) }));
  run(async () => {
    const sql = await activityDb();
    const queries = [
      sql`
        insert into device_activity (period, start, device, plan, os, arch, version)
        select p, s, d, ${plan}::text, ${details?.os ?? null}::text, ${details?.arch ?? null}::text, ${details?.version ?? null}::text
        from unnest(
          ${rows.map((r) => r.period)}::text[],
          ${rows.map((r) => r.start)}::date[],
          ${rows.map((r) => r.device)}::text[]
        ) as t(p, s, d)
        on conflict (period, start, device) do update set
          plan = excluded.plan,
          os = coalesce(excluded.os, device_activity.os),
          arch = coalesce(excluded.arch, device_activity.arch),
          version = coalesce(excluded.version, device_activity.version)`,
    ];
    if (lastPrune !== day) {
      queries.push(sql`delete from device_activity where start < current_date - ${PRODUCT_RETENTION_DAYS}::int`);
      queries.push(sql`delete from accounts where last_seen < now() - make_interval(days => ${ACCOUNT_RETENTION_DAYS}::int)`);
    }
    await sql.transaction(queries);
    lastPrune = day;
  }, details ? "checkin" : "active");
}

/** Adds to plain daily totals, e.g. `[["download", "macArm"], ["download_country", "PL"]]`. */
export function countDaily(entries: [metric: string, dim: string][]) {
  try {
    if (!isDatabaseConfigured() || entries.length === 0) return;
    const day = today();
    run(async () => {
      const sql = await activityDb();
      await sql`
        insert into daily_counts (day, metric, dim, count)
        select ${day}::date, m, d, 1 from unnest(${entries.map((e) => e[0])}::text[], ${entries.map((e) => e[1])}::text[]) as t(m, d)
        on conflict (day, metric, dim) do update set count = daily_counts.count + 1`;
    }, "count");
  } catch {
    // Counting never affects the response.
  }
}

/** Records an email that signed in to the app (verify or refresh), with its plan. */
export function noteAccount(email: string, plan: string) {
  try {
    if (!isDatabaseConfigured() || !email) return;
    if (alreadySeen(`account|${email}|${plan}`)) return;
    run(async () => {
      const sql = await activityDb();
      await sql`
        insert into accounts (email, plan) values (${email}, ${plan})
        on conflict (email) do update set plan = excluded.plan, last_seen = now()`;
    }, "account");
  } catch {
    // Recording never affects sign-in.
  }
}

/**
 * The visitor's country as Vercel geolocates it from the IP (two letters), or
 * null. Only the country is kept, as a count; the IP never is.
 */
export function requestCountry(req: Request): string | null {
  const c = req.headers.get("x-vercel-ip-country")?.toUpperCase() ?? "";
  return /^[A-Z]{2}$/.test(c) && c !== "XX" ? c : null;
}

/** Crawlers and link previews follow download links too; don't count them. */
export function looksLikeBot(req: Request): boolean {
  const ua = req.headers.get("user-agent") ?? "";
  return !ua || /bot|crawl|spider|slurp|preview|facebookexternalhit|curl|wget|python|headless|monitor/i.test(ua);
}
