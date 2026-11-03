import "server-only";
import { unstable_cache } from "next/cache";
import { isDatabaseConfigured, productDb } from "../db";
import { resolve, type Flat, type Source } from "../agent/config";
import { loadConfig, loadHistory, type ConfigRow, type HistoryRow } from "../agent/config-store";
import { MS_BUCKETS, bucketPercentile, parsePropsKey } from "../agent/telemetry";
import { demoAgentRows, demoConfigRows, demoHistory, demoInstalls } from "./agent-health-demo";

/**
 * The admin's Agent health tab: opt-in product analytics (counts only, from
 * product_events_daily) over the last 30 days, plus the remote agent config
 * and its change history. Event reads are cached for 15 minutes like the rest
 * of the admin; the config is read fresh so the buttons show their effect.
 */
export const HEALTH_DAYS = 30;

export type EventRow = { day: string; name: string; props: string; n: number };

export type AgentHealth = {
  ok: boolean;
  error?: string;
  days: string[];
  installs: number[];
  totals: { events: number; installsLast7: number };
  acceptance: { kind: string; offered: number; accepted: number; dismissed: number; ignored: number; muted: number }[];
  offeredBy: { device: number; cloud: number; rules: number };
  judge: { engine: string; runs: number; ok: number; unparsable: number; timeout: number; error: number; p50: number | null; p95: number | null }[];
  routes: { route: string; n: number }[];
  routeTotal: number;
  routeSources: { source: string; n: number }[];
  didYouMean: { shown: number; typed: number; asked: number; dismissed: number };
  answers: { web: boolean; n: number; firstP50: number | null; firstP95: number | null; totalP50: number | null; totalP95: number | null }[];
  acts: { platform: string; kind: string; ok: number; fallback: number; failed: number }[];
  errors: { area: string; kind: string; n: number }[];
  ratings: { card: string; kind: string; up: number; down: number }[];
  meetings: { outcome: string; n: number }[];
  meetingEmails: { sent: number; failed: number };
  dictation: { n: number; polished: number; p50: number | null; p95: number | null };
};

export type ConfigView = {
  ok: boolean;
  error?: string;
  values: Flat;
  sources: Record<string, Source>;
  pinned: Record<string, boolean>;
  paused: boolean;
  history: HistoryRow[];
};

function lastDays(n: number, now = new Date()) {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)).toISOString().slice(0, 10));
  }
  return out;
}

const bump = <K extends string>(m: Map<string, Record<K, number>>, key: string, init: () => Record<K, number>, field: K, n: number) => {
  const cur = m.get(key) ?? init();
  cur[field] = (cur[field] ?? 0) + n;
  m.set(key, cur);
};

/** Pure: event rows (any period) → the tab's numbers. */
export function buildHealth(rows: EventRow[], installRows: { day: string; n: number }[], days: string[]): AgentHealth {
  const acc = new Map<string, Record<"offered" | "accepted" | "dismissed" | "ignored" | "muted", number>>();
  const accInit = () => ({ offered: 0, accepted: 0, dismissed: 0, ignored: 0, muted: 0 });
  const offeredBy = { device: 0, cloud: 0, rules: 0 };
  const judge = new Map<string, Record<string, number>>();
  const routes = new Map<string, number>();
  const sources = new Map<string, number>();
  const dym = { shown: 0, typed: 0, asked: 0, dismissed: 0 };
  const answers = new Map<string, { n: number; first: Record<string, number>; total: Record<string, number> }>();
  const acts = new Map<string, Record<"ok" | "fallback" | "failed", number>>();
  const errors = new Map<string, number>();
  const ratings = new Map<string, Record<"up" | "down", number>>();
  const meetings = new Map<string, number>();
  const emails = { sent: 0, failed: 0 };
  const dict = { n: 0, polished: 0, buckets: {} as Record<string, number> };
  let events = 0;

  for (const r of rows) {
    const p = parsePropsKey(r.props);
    events += r.n;
    switch (r.name) {
      case "suggestion_offered":
        bump(acc, p.kind, accInit, "offered", r.n);
        if (p.judge === "device" || p.judge === "cloud" || p.judge === "rules") offeredBy[p.judge] += r.n;
        break;
      case "suggestion_result":
        if (p.outcome === "accepted" || p.outcome === "dismissed" || p.outcome === "ignored" || p.outcome === "muted") {
          bump(acc, p.kind, accInit, p.outcome, r.n);
        }
        break;
      case "judge_run": {
        const j = judge.get(p.engine) ?? { runs: 0 };
        j.runs += r.n;
        j[p.outcome] = (j[p.outcome] ?? 0) + r.n;
        j[`ms:${p.ms_bucket}`] = (j[`ms:${p.ms_bucket}`] ?? 0) + r.n;
        judge.set(p.engine, j);
        break;
      }
      case "route":
        routes.set(p.route, (routes.get(p.route) ?? 0) + r.n);
        sources.set(p.source, (sources.get(p.source) ?? 0) + r.n);
        break;
      case "did_you_mean_shown":
        dym.shown += r.n;
        break;
      case "did_you_mean_result":
        if (p.result === "typed" || p.result === "asked" || p.result === "dismissed") dym[p.result] += r.n;
        break;
      case "answer_latency": {
        const a = answers.get(p.web) ?? { n: 0, first: {}, total: {} };
        a.n += r.n;
        a.first[p.first_card_ms_bucket] = (a.first[p.first_card_ms_bucket] ?? 0) + r.n;
        a.total[p.total_ms_bucket] = (a.total[p.total_ms_bucket] ?? 0) + r.n;
        answers.set(p.web, a);
        break;
      }
      case "act":
        if (p.outcome === "ok" || p.outcome === "fallback" || p.outcome === "failed") {
          bump(acts, `${p.platform}|${p.kind}`, () => ({ ok: 0, fallback: 0, failed: 0 }), p.outcome, r.n);
        }
        break;
      case "error":
        errors.set(`${p.area}|${p.kind}`, (errors.get(`${p.area}|${p.kind}`) ?? 0) + r.n);
        break;
      case "card_rating":
        if (p.rating === "up" || p.rating === "down") bump(ratings, `${p.card}|${p.kind}`, () => ({ up: 0, down: 0 }), p.rating, r.n);
        break;
      case "meeting":
        meetings.set(p.outcome, (meetings.get(p.outcome) ?? 0) + r.n);
        break;
      case "meeting_email":
        if (p.outcome === "sent" || p.outcome === "failed") emails[p.outcome] += r.n;
        break;
      case "dictation":
        dict.n += r.n;
        if (p.polish === "true") dict.polished += r.n;
        dict.buckets[p.ms_bucket] = (dict.buckets[p.ms_bucket] ?? 0) + r.n;
        break;
    }
  }

  const installByDay = new Map(installRows.map((r) => [r.day, r.n]));
  const installs = days.map((d) => installByDay.get(d) ?? 0);
  const msOf = (j: Record<string, number>) => Object.fromEntries(MS_BUCKETS.map((b) => [b, j[`ms:${b}`] ?? 0]));
  const byCount = <T extends { n: number }>(a: T[]) => a.sort((x, y) => y.n - x.n);

  return {
    ok: true,
    days,
    installs,
    totals: { events, installsLast7: Math.max(0, ...installs.slice(-7)) },
    acceptance: [...acc.entries()]
      .filter(([k]) => k)
      .map(([kind, v]) => ({ kind, ...v }))
      .sort((a, b) => b.offered - a.offered),
    offeredBy,
    judge: [...judge.entries()].map(([engine, j]) => ({
      engine,
      runs: j.runs,
      ok: j.ok ?? 0,
      unparsable: j.unparsable ?? 0,
      timeout: j.timeout ?? 0,
      error: j.error ?? 0,
      p50: bucketPercentile(msOf(j), 0.5),
      p95: bucketPercentile(msOf(j), 0.95),
    })),
    routes: byCount([...routes.entries()].map(([route, n]) => ({ route, n }))),
    routeTotal: [...routes.values()].reduce((a, b) => a + b, 0),
    routeSources: byCount([...sources.entries()].map(([source, n]) => ({ source, n }))),
    didYouMean: dym,
    answers: [...answers.entries()]
      .map(([web, a]) => ({
        web: web === "true",
        n: a.n,
        firstP50: bucketPercentile(a.first, 0.5),
        firstP95: bucketPercentile(a.first, 0.95),
        totalP50: bucketPercentile(a.total, 0.5),
        totalP95: bucketPercentile(a.total, 0.95),
      }))
      .sort((a, b) => Number(a.web) - Number(b.web)),
    acts: [...acts.entries()]
      .map(([k, v]) => {
        const [platform, kind] = k.split("|");
        return { platform, kind, ...v };
      })
      .sort((a, b) => a.platform.localeCompare(b.platform) || a.kind.localeCompare(b.kind)),
    errors: byCount(
      [...errors.entries()].map(([k, n]) => {
        const [area, kind] = k.split("|");
        return { area, kind, n };
      }),
    ),
    ratings: [...ratings.entries()]
      .map(([k, v]) => {
        const [card, kind] = k.split("|");
        return { card, kind, ...v };
      })
      .sort((a, b) => b.up + b.down - (a.up + a.down)),
    meetings: byCount([...meetings.entries()].map(([outcome, n]) => ({ outcome, n }))),
    meetingEmails: emails,
    dictation: { n: dict.n, polished: dict.polished, p50: bucketPercentile(dict.buckets, 0.5), p95: bucketPercentile(dict.buckets, 0.95) },
  };
}

const empty = (error: string): AgentHealth => ({ ...buildHealth([], [], lastDays(HEALTH_DAYS)), ok: false, error });

const readEvents = unstable_cache(
  async (): Promise<{ rows: EventRow[]; installs: { day: string; n: number }[] }> => {
    const sql = await productDb();
    const [rows, inst] = await Promise.all([
      sql`
        select to_char(day, 'YYYY-MM-DD') as day, name, props_key, sum(count)::bigint as n
        from product_events_daily
        where day >= current_date - ${HEALTH_DAYS - 1}::int
        group by day, name, props_key`,
      sql`
        select to_char(day, 'YYYY-MM-DD') as day, count(*)::int as n
        from product_installs_daily
        where day >= current_date - ${HEALTH_DAYS - 1}::int
        group by day`,
    ]);
    return {
      rows: rows.map((r) => ({ day: String(r.day), name: String(r.name), props: String(r.props_key), n: Number(r.n) })),
      installs: inst.map((r) => ({ day: String(r.day), n: Number(r.n) })),
    };
  },
  ["admin-agent-health"],
  { revalidate: 900, tags: ["admin"] },
);

export async function loadAgentHealth(demo: boolean): Promise<AgentHealth> {
  const days = lastDays(HEALTH_DAYS);
  if (demo) return buildHealth(demoAgentRows(days), demoInstalls(days), days);
  if (!isDatabaseConfigured()) return empty("DATABASE_URL isn't set in Vercel.");
  try {
    const { rows, installs } = await readEvents();
    return buildHealth(rows, installs, days);
  } catch (err) {
    return empty(err instanceof Error ? err.message.slice(0, 120) : "error");
  }
}

export async function loadConfigView(demo: boolean): Promise<ConfigView> {
  if (demo) {
    const rows: ConfigRow[] = demoConfigRows();
    const { values, sources } = resolve(
      Object.fromEntries(rows.filter((r) => r.source === "auto").map((r) => [r.key, r.value])),
      Object.fromEntries(rows.filter((r) => r.source === "manual").map((r) => [r.key, r.value])),
    );
    return { ok: true, values, sources, pinned: Object.fromEntries(rows.map((r) => [r.key, r.pinned])), paused: false, history: demoHistory() };
  }
  const [state, history] = await Promise.all([loadConfig(), loadHistory(40)]);
  return {
    ok: state.ok,
    error: state.error,
    values: state.values,
    sources: state.sources,
    pinned: Object.fromEntries(state.rows.map((r) => [r.key, r.pinned])),
    paused: state.paused,
    history,
  };
}
