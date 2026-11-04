import "server-only";
import { unstable_cache } from "next/cache";
import { brand } from "../brand";
import { activityDb, isDatabaseConfigured } from "../db";
import { periodStarts } from "../activity";
import { getPolarStats } from "./metrics";
import { demoInstallsData } from "./installs-demo";

/**
 * The admin's Installs tab: everyone who uses the app, Free included. Every
 * number comes from something the server already sees (lib/activity.ts):
 *
 * - trials: one row per computer, written on first launch (the app asks for
 *   the trial once), so it doubles as "installs that went online".
 * - device_activity: devices and paid accounts that called us on a day, week
 *   or month: the app's daily check-in (/api/ping, from 0.1.8, every install
 *   whatever its settings) and the trial check, Free usage, hosted AI and plan
 *   checks. Check-in rows carry the OS, architecture and app version. A paid
 *   user has an account row (plan checks) and, from 0.1.8, a device row
 *   (check-in); per plan we count the larger of the two so nobody counts twice.
 * - daily_counts: downloads from the site's /dl links, first launches by
 *   country.
 * - accounts: emails that signed in to the app.
 * - Polar: paying and complimentary subscriptions.
 */
export const INSTALL_DAYS = 30;
export const ACTIVE_PLANS = ["free", "trial", "pro", "team"] as const;
export type ActivePlanKey = (typeof ACTIVE_PLANS)[number];
type ByPlan = Record<ActivePlanKey, number>;

export type InstallsData = {
  /** Last INSTALL_DAYS UTC days, oldest first. */
  days: string[];
  installs: { total: number; last7: number; last30: number; trialing: number; perDay: number[] };
  downloads: { last30: number; perDay: number[] };
  /** Active today, this week (from Monday) and this month, by plan. */
  active: { day: ByPlan; week: ByPlan; month: ByPlan };
  activePerDay: Record<ActivePlanKey, number[]>;
  /** The first day device_activity has rows for (null: none yet). */
  activeSince: string | null;
  downloadFiles: { id: string; n: number }[];
  downloadVersions: { version: string; n: number }[];
  countries: { country: string; downloads: number; firstLaunches: number }[];
  /** OS, version and plan of devices that checked in over the last 7 days, as device-days. */
  mix: { deviceDays: number; os: { key: string; n: number }[]; versions: { key: string; n: number }[]; plans: { key: string; n: number }[] };
  accounts: { email: string; plan: string; firstSeen: string; lastSeen: string }[];
  accountTotals: Record<string, number>;
};

export type PolarCounts = { paying: number; complimentary: number; trialing: number } | null;

export type InstallsView = ({ ok: true; data: InstallsData } | { ok: false; error: string }) & {
  polar: PolarCounts;
  polarError?: string;
};

export function lastDays(n: number, now = new Date()) {
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (n - 1) + i)).toISOString().slice(0, 10),
  );
}

const num = (v: unknown) => Number(v ?? 0);
const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const zero = (): ByPlan => ({ free: 0, trial: 0, pro: 0, team: 0 });
const isPlan = (p: string): p is ActivePlanKey => (ACTIVE_PLANS as readonly string[]).includes(p);
/**
 * Adds a (plan, check-in or not) group to a plan's count. Free and trial rows
 * are all devices, one row each whichever request made it, so they add up. A
 * paid plan's check-in rows are its devices and the others its accounts: the
 * same people seen twice, so the larger group stands for them.
 */
const combine = (plan: ActivePlanKey, have: number, n: number) => (plan === "pro" || plan === "team" ? Math.max(have, n) : have + n);
const ranked = (rows: Record<string, unknown>[], key: string) =>
  rows.map((r) => ({ key: String(r[key] ?? "unknown"), n: num(r.n) })).sort((a, b) => b.n - a.n);

const read = unstable_cache(
  async (): Promise<InstallsData> => {
    const days = lastDays(INSTALL_DAYS);
    const from = days[0];
    const starts = periodStarts(days[days.length - 1]);
    const sql = await activityDb();
    const [trials, trialDays, active, activeDays, since, counts, accounts, accountTotals, os, versions, plans, deviceDays] = await sql.transaction([
      sql`select count(*) as total,
            count(*) filter (where started_at >= now() - interval '7 days') as last7,
            count(*) filter (where started_at >= now() - interval '30 days') as last30,
            count(*) filter (where started_at > now() - make_interval(days => ${brand.trialDays}::int)) as trialing
          from trials`,
      sql`select started_at::date as day, count(*) as n from trials where started_at >= ${from}::date group by 1`,
      sql`select period, plan, os is not null as checkin, count(*) as n from device_activity
          where (period = 'day' and start = ${starts.day}::date)
             or (period = 'week' and start = ${starts.week}::date)
             or (period = 'month' and start = ${starts.month}::date)
          group by 1, 2, 3`,
      sql`select start as day, plan, os is not null as checkin, count(*) as n from device_activity
          where period = 'day' and start >= ${from}::date group by 1, 2, 3`,
      sql`select min(start) as first from device_activity`,
      sql`select day, metric, dim, sum(count) as n from daily_counts where day >= ${from}::date group by 1, 2, 3`,
      sql`select email, plan, first_seen, last_seen from accounts
          order by (plan = 'free') desc, last_seen desc limit 300`,
      sql`select plan, count(*) as n from accounts group by 1`,
      sql`select os || '/' || coalesce(arch, 'other') as os, count(*) as n from device_activity
          where period = 'day' and start >= current_date - 6 and os is not null group by 1`,
      sql`select version, count(*) as n from device_activity
          where period = 'day' and start >= current_date - 6 and os is not null group by 1`,
      sql`select plan, count(*) as n from device_activity
          where period = 'day' and start >= current_date - 6 and os is not null group by 1`,
      sql`select count(*) as n from device_activity where period = 'day' and start >= current_date - 6 and os is not null`,
    ]);

    const idx = new Map(days.map((d, i) => [d, i]));
    const installsPerDay = days.map(() => 0);
    for (const r of trialDays) {
      const i = idx.get(day(r.day));
      if (i !== undefined) installsPerDay[i] = num(r.n);
    }
    const act = { day: zero(), week: zero(), month: zero() };
    for (const r of active) {
      const p = String(r.plan);
      const period = String(r.period) as keyof typeof act;
      if (isPlan(p) && act[period]) act[period][p] = combine(p, act[period][p], num(r.n));
    }
    const activePerDay = Object.fromEntries(ACTIVE_PLANS.map((p) => [p, days.map(() => 0)])) as Record<ActivePlanKey, number[]>;
    for (const r of activeDays) {
      const i = idx.get(day(r.day));
      const p = String(r.plan);
      if (i !== undefined && isPlan(p)) activePerDay[p][i] = combine(p, activePerDay[p][i], num(r.n));
    }

    const downloadsPerDay = days.map(() => 0);
    const files = new Map<string, number>();
    const vers = new Map<string, number>();
    const countries = new Map<string, { downloads: number; firstLaunches: number }>();
    const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
    for (const r of counts) {
      const n = num(r.n);
      const dim = String(r.dim);
      switch (String(r.metric)) {
        case "download": {
          add(files, dim, n);
          const i = idx.get(day(r.day));
          if (i !== undefined) downloadsPerDay[i] += n;
          break;
        }
        case "download_version":
          add(vers, dim, n);
          break;
        case "download_country":
        case "first_launch_country": {
          const c = countries.get(dim) ?? { downloads: 0, firstLaunches: 0 };
          if (r.metric === "download_country") c.downloads += n;
          else c.firstLaunches += n;
          countries.set(dim, c);
          break;
        }
      }
    }

    return {
      days,
      installs: {
        total: num(trials[0]?.total),
        last7: num(trials[0]?.last7),
        last30: num(trials[0]?.last30),
        trialing: num(trials[0]?.trialing),
        perDay: installsPerDay,
      },
      downloads: { last30: downloadsPerDay.reduce((a, b) => a + b, 0), perDay: downloadsPerDay },
      active: act,
      activePerDay,
      activeSince: since[0]?.first ? day(since[0].first) : null,
      downloadFiles: [...files.entries()].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n),
      downloadVersions: [...vers.entries()].map(([version, n]) => ({ version, n })).sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true })),
      countries: [...countries.entries()]
        .map(([country, c]) => ({ country, ...c }))
        .sort((a, b) => b.firstLaunches + b.downloads - (a.firstLaunches + a.downloads)),
      mix: {
        deviceDays: num(deviceDays[0]?.n),
        os: ranked(os, "os"),
        versions: ranked(versions, "version"),
        plans: ranked(plans, "plan"),
      },
      accounts: accounts.map((r) => ({ email: String(r.email), plan: String(r.plan), firstSeen: iso(r.first_seen), lastSeen: iso(r.last_seen) })),
      accountTotals: Object.fromEntries(accountTotals.map((r) => [String(r.plan), num(r.n)])),
    };
  },
  ["admin-installs-v2"],
  { revalidate: 900, tags: ["admin"] },
);

export async function loadInstalls(demo: boolean): Promise<InstallsView> {
  if (demo) {
    return { ok: true, data: demoInstallsData(lastDays(INSTALL_DAYS)), polar: { paying: 38, complimentary: 6, trialing: 0 } };
  }
  const polarP = getPolarStats();
  let base: { ok: true; data: InstallsData } | { ok: false; error: string };
  if (!isDatabaseConfigured()) base = { ok: false, error: "DATABASE_URL isn't set in Vercel." };
  else {
    try {
      base = { ok: true, data: await read() };
    } catch (err) {
      base = { ok: false, error: err instanceof Error ? err.message.slice(0, 120) : "error" };
    }
  }
  const polar = await polarP;
  return polar.ok
    ? { ...base, polar: { paying: polar.payingCustomers, complimentary: polar.complimentary, trialing: polar.trialingSubscriptions } }
    : { ...base, polar: null, polarError: polar.error };
}
