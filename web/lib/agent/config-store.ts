import "server-only";
import { isDatabaseConfigured, productDb } from "../db";
import { parsePropsKey } from "./telemetry";
import {
  boundFor,
  clampValue,
  defaults,
  resolve,
  tune,
  type Change,
  type ConfigValue,
  type Flat,
  type Source,
  type TuneStats,
} from "./config";

/**
 * The agent config in Neon: one row per key that isn't at its default
 * (`source` auto or manual; manual rows can be pinned), a pause flag for
 * auto-tuning, and the history of every change. Every read falls back to the
 * built-in defaults when the database is missing or fails, so the app's
 * config endpoint always answers.
 */
export const TUNE_WINDOW_DAYS = 14;
const PAUSED_KEY = "auto_tuning_paused";

export type ConfigRow = { key: string; value: ConfigValue; source: "auto" | "manual"; pinned: boolean; updatedAt: string };
export type HistoryRow = {
  id: number;
  at: string;
  key: string;
  oldValue: ConfigValue | null;
  newValue: ConfigValue | null;
  source: string;
  reason: string;
  stats: Record<string, number> | null;
};
export type ConfigState = {
  values: Flat;
  sources: Record<string, Source>;
  rows: ConfigRow[];
  paused: boolean;
  ok: boolean;
  error?: string;
};

function fallback(error?: string): ConfigState {
  const values = defaults();
  return {
    values,
    sources: Object.fromEntries(Object.keys(values).map((k) => [k, "default" as Source])),
    rows: [],
    paused: false,
    ok: false,
    error,
  };
}

/** The resolved config and where each value comes from. Never throws. */
export async function loadConfig(): Promise<ConfigState> {
  if (!isDatabaseConfigured()) return fallback("DATABASE_URL not set");
  try {
    const sql = await productDb();
    const [rows, state] = await Promise.all([
      sql`select key, value, source, pinned, updated_at from agent_config`,
      sql`select value from agent_config_state where key = ${PAUSED_KEY}`,
    ]);
    const parsed: ConfigRow[] = rows.map((r) => ({
      key: String(r.key),
      value: r.value as ConfigValue,
      source: r.source === "manual" ? "manual" : "auto",
      pinned: Boolean(r.pinned),
      updatedAt: new Date(r.updated_at as string).toISOString(),
    }));
    const auto = Object.fromEntries(parsed.filter((r) => r.source === "auto").map((r) => [r.key, r.value]));
    const manual = Object.fromEntries(parsed.filter((r) => r.source === "manual").map((r) => [r.key, r.value]));
    const { values, sources } = resolve(auto, manual);
    return { values, sources, rows: parsed, paused: state[0]?.value === true, ok: true };
  } catch (err) {
    return fallback(err instanceof Error ? err.message.slice(0, 120) : "error");
  }
}

const FREE_AI_TTL_MS = 5 * 60_000;
let freeAiCache: { value: number; at: number } | null = null;

/**
 * Free's weekly AI uses (`free.ai_per_week`, clamped), the same value the app
 * reads from /api/agent/config. Held in memory for five minutes, so a change
 * in /admin reaches every instance within that and Free requests don't read
 * the config each time.
 */
export async function freeAiPerWeek(now = Date.now()): Promise<number> {
  if (freeAiCache && now - freeAiCache.at < FREE_AI_TTL_MS) return freeAiCache.value;
  const state = await loadConfig();
  const value = Number(state.values["free.ai_per_week"] ?? defaults()["free.ai_per_week"]);
  // A failed read isn't cached for long: try again within a minute.
  freeAiCache = { value, at: state.ok ? now : now - FREE_AI_TTL_MS + 60_000 };
  return value;
}

export async function loadHistory(limit = 50): Promise<HistoryRow[]> {
  if (!isDatabaseConfigured()) return [];
  try {
    const sql = await productDb();
    const rows = await sql`
      select id, at, key, old_value, new_value, source, reason, stats
      from agent_config_history order by at desc, id desc limit ${limit}`;
    return rows.map((r) => ({
      id: Number(r.id),
      at: new Date(r.at as string).toISOString(),
      key: String(r.key),
      oldValue: (r.old_value ?? null) as ConfigValue | null,
      newValue: (r.new_value ?? null) as ConfigValue | null,
      source: String(r.source),
      reason: String(r.reason),
      stats: (r.stats ?? null) as Record<string, number> | null,
    }));
  } catch {
    return [];
  }
}

/** The 14-day aggregates the tuning rules read. */
export async function tuneStats(days = TUNE_WINDOW_DAYS): Promise<TuneStats> {
  const sql = await productDb();
  const rows = await sql`
    select name, props_key, sum(count)::bigint as n
    from product_events_daily
    where day >= current_date - ${days}::int
      and name in ('suggestion_offered', 'suggestion_result', 'judge_run', 'route', 'did_you_mean_shown')
    group by name, props_key`;
  return statsFromRows(rows.map((r) => ({ name: String(r.name), props: String(r.props_key), n: Number(r.n) })));
}

/** Pure: event rows → the tuning aggregates (exported for the admin tab). */
export function statsFromRows(rows: { name: string; props: string; n: number }[]): TuneStats {
  const stats: TuneStats = { kinds: {}, judge: {}, route: { total: 0, didYouMean: 0 } };
  for (const r of rows) {
    const p = parsePropsKey(r.props);
    if (r.name === "suggestion_offered" && p.kind) {
      (stats.kinds[p.kind] ??= { offered: 0, accepted: 0 }).offered += r.n;
    } else if (r.name === "suggestion_result" && p.kind && p.outcome === "accepted") {
      (stats.kinds[p.kind] ??= { offered: 0, accepted: 0 }).accepted += r.n;
    } else if (r.name === "judge_run" && (p.engine === "device" || p.engine === "cloud")) {
      const j = (stats.judge[p.engine] ??= { runs: 0, timeouts: 0 });
      j.runs += r.n;
      if (p.outcome === "timeout") j.timeouts += r.n;
    } else if (r.name === "route") {
      stats.route.total += r.n;
    } else if (r.name === "did_you_mean_shown") {
      stats.route.didYouMean += r.n;
    }
  }
  return stats;
}

async function writeHistory(c: { key: string; old: ConfigValue | null; next: ConfigValue | null; source: string; reason: string; stats?: Record<string, number> | null }) {
  const sql = await productDb();
  await sql`
    insert into agent_config_history (key, old_value, new_value, source, reason, stats)
    values (${c.key}, ${JSON.stringify(c.old)}::jsonb, ${JSON.stringify(c.next)}::jsonb, ${c.source}, ${c.reason}, ${c.stats ? JSON.stringify(c.stats) : null}::jsonb)`;
}

export type TuneResult = { skipped?: "paused" | "no_database"; changes: Change[]; stats?: TuneStats };

/** The daily cron: apply the rules to every key that isn't manual or pinned. */
export async function runTuning(): Promise<TuneResult> {
  if (!isDatabaseConfigured()) return { skipped: "no_database", changes: [] };
  const state = await loadConfig();
  if (!state.ok) throw new Error(state.error ?? "config unavailable");
  if (state.paused) return { skipped: "paused", changes: [] };
  const locked = new Set(state.rows.filter((r) => r.source === "manual" || r.pinned).map((r) => r.key));
  const stats = await tuneStats();
  const changes = tune(state.values, stats, locked);
  if (changes.length) {
    const sql = await productDb();
    const queries = changes.flatMap((c) => [
      sql`
        insert into agent_config (key, value, source, pinned, updated_at)
        values (${c.key}, ${JSON.stringify(c.new)}::jsonb, 'auto', false, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()
        where agent_config.source = 'auto' and not agent_config.pinned`,
      sql`
        insert into agent_config_history (key, old_value, new_value, source, reason, stats)
        values (${c.key}, ${JSON.stringify(c.old)}::jsonb, ${JSON.stringify(c.new)}::jsonb, 'auto', ${c.reason}, ${JSON.stringify(c.stats)}::jsonb)`,
    ]);
    await sql.transaction(queries);
  }
  return { changes, stats };
}

/** Admin: set a manual value (an override), optionally pinned. */
export async function setManual(key: string, raw: unknown, opts: { pinned: boolean; by: string }) {
  const value = clampValue(key, raw);
  if (value === null) throw new Error("unknown key or invalid value");
  const state = await loadConfig();
  if (!state.ok) throw new Error(state.error ?? "config unavailable");
  const sql = await productDb();
  await sql`
    insert into agent_config (key, value, source, pinned, updated_at)
    values (${key}, ${JSON.stringify(value)}::jsonb, 'manual', ${opts.pinned}, now())
    on conflict (key) do update set value = excluded.value, source = 'manual', pinned = excluded.pinned, updated_at = now()`;
  await writeHistory({
    key,
    old: state.values[key] ?? null,
    next: value,
    source: "manual",
    reason: `${opts.pinned ? "Pinned" : "Overridden"} by ${opts.by}`,
  });
}

/** Admin: drop the manual value; auto-tuning owns the key again (from its default). */
export async function resetToAuto(key: string, by: string) {
  if (boundFor(key) === null) throw new Error("unknown key");
  const state = await loadConfig();
  if (!state.ok) throw new Error(state.error ?? "config unavailable");
  const sql = await productDb();
  await sql`delete from agent_config where key = ${key}`;
  await writeHistory({ key, old: state.values[key] ?? null, next: defaults()[key] ?? null, source: "manual", reason: `Reset to auto by ${by}` });
}

/** Admin: pause or resume the daily tuning. */
export async function setPaused(paused: boolean, by: string) {
  const sql = await productDb();
  await sql`
    insert into agent_config_state (key, value) values (${PAUSED_KEY}, ${JSON.stringify(paused)}::jsonb)
    on conflict (key) do update set value = excluded.value`;
  await writeHistory({ key: "auto_tuning", old: !paused, next: paused, source: "manual", reason: `${paused ? "Paused" : "Resumed"} by ${by}` });
}
