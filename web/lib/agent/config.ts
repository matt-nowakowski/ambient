/**
 * The remote agent config: tunables the desktop app fetches from
 * /api/agent/config and applies within its own hard-coded bounds. Pure (no
 * server-only imports), shared by the route, the daily tuning cron, the admin
 * tab and scripts/agent-config-test.ts.
 *
 * Values are kept flat ("judge.timeout_ms", "kind.draft_reply.enabled") and
 * resolved in three layers: built-in defaults ← auto-tuned ← manual
 * overrides. Manual always wins. Every value is clamped to the bounds in
 * config-schema.json (the app clamps again with its own copy).
 */
import schema from "./config-schema.json";

export const CONFIG_SCHEMA = schema.schema;
export const KINDS: readonly string[] = schema.kinds;

export type Bound = { min: number; max: number; default: number };
const BOUNDS = schema.bounds as Record<string, Bound>;

export type ConfigValue = number | boolean;
export type Flat = Record<string, ConfigValue>;
export type Source = "default" | "auto" | "manual";

/** Keys outside `kind.*`, in display order. */
export const GLOBAL_KEYS = [
  "hourly_budget",
  "judge.timeout_ms",
  "judge.cloud_timeout_ms",
  "judge.min_confidence",
  "router.did_you_mean_bias",
  "answer.first_byte_timeout_ms",
  "answer.idle_timeout_ms",
  "search.timeout_ms",
  "writing.written_threshold",
  "writing.ambiguous_floor",
  "writing.polish_disfluency",
  "writing.run_on_words",
  "writing.skip_polish_words",
  "free.ai_per_week",
  "free.suggestions_per_week",
  "free.memory_hours",
  "free.meetings_per_month",
] as const;

const KIND_FIELDS = ["enabled", "min_confidence", "cooldown_min"] as const;

/** Every config key. */
export function configKeys(): string[] {
  return [...GLOBAL_KEYS, ...KINDS.flatMap((k) => KIND_FIELDS.map((f) => `kind.${k}.${f}`))];
}

/** The bound for a key, "bool" for kind enabled flags, or null for an unknown key. */
export function boundFor(key: string): Bound | "bool" | null {
  const m = /^kind\.([a-z_]+)\.(enabled|min_confidence|cooldown_min)$/.exec(key);
  if (m) {
    if (!KINDS.includes(m[1])) return null;
    return m[2] === "enabled" ? "bool" : BOUNDS[`kind.${m[2]}`];
  }
  return (GLOBAL_KEYS as readonly string[]).includes(key) ? BOUNDS[key] : null;
}

export function defaultValue(key: string): ConfigValue | null {
  const b = boundFor(key);
  if (b === null) return null;
  return b === "bool" ? true : b.default;
}

/** Fractions (confidence, bias) keep two decimals; everything else is whole. */
const isFraction = (b: Bound) => b.max <= 1;

/**
 * A value held inside its bounds, or null when the key is unknown or the
 * value isn't the right type (both are ignored, never applied).
 */
export function clampValue(key: string, value: unknown): ConfigValue | null {
  const b = boundFor(key);
  if (b === null) return null;
  if (b === "bool") return typeof value === "boolean" ? value : null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const v = Math.min(b.max, Math.max(b.min, value));
  return isFraction(b) ? Math.round(v * 100) / 100 : Math.round(v);
}

export function defaults(): Flat {
  return Object.fromEntries(configKeys().map((k) => [k, defaultValue(k) as ConfigValue]));
}

/** Only known keys with valid values, clamped. */
export function sanitize(layer: Record<string, unknown>): Flat {
  const out: Flat = {};
  for (const [k, v] of Object.entries(layer)) {
    const c = clampValue(k, v);
    if (c !== null) out[k] = c;
  }
  return out;
}

/** Defaults ← auto ← manual, with where each value came from. */
export function resolve(auto: Record<string, unknown>, manual: Record<string, unknown>) {
  const a = sanitize(auto);
  const m = sanitize(manual);
  const values: Flat = defaults();
  const sources: Record<string, Source> = Object.fromEntries(configKeys().map((k) => [k, "default" as Source]));
  for (const [k, v] of Object.entries(a)) {
    values[k] = v;
    sources[k] = "auto";
  }
  for (const [k, v] of Object.entries(m)) {
    values[k] = v;
    sources[k] = "manual";
  }
  return { values, sources };
}

export type PublicConfig = {
  schema: number;
  generated_at: string;
  hourly_budget: number;
  judge: { timeout_ms: number; cloud_timeout_ms: number; min_confidence: number };
  router: { did_you_mean_bias: number };
  answer: { first_byte_timeout_ms: number; idle_timeout_ms: number };
  search: { timeout_ms: number };
  writing: { written_threshold: number; ambiguous_floor: number; polish_disfluency: number; run_on_words: number; skip_polish_words: number };
  /** Free's limits. The server enforces ai_per_week on hosted AI; the app the rest. */
  free: { ai_per_week: number; suggestions_per_week: number; memory_hours: number; meetings_per_month: number };
  kinds: Record<string, { enabled: boolean; min_confidence: number; cooldown_min: number }>;
};

/** The JSON the app reads. */
export function toPublic(values: Flat, now = new Date()): PublicConfig {
  const n = (k: string) => Number(values[k] ?? defaultValue(k));
  return {
    schema: CONFIG_SCHEMA,
    generated_at: now.toISOString(),
    hourly_budget: n("hourly_budget"),
    judge: { timeout_ms: n("judge.timeout_ms"), cloud_timeout_ms: n("judge.cloud_timeout_ms"), min_confidence: n("judge.min_confidence") },
    router: { did_you_mean_bias: n("router.did_you_mean_bias") },
    answer: { first_byte_timeout_ms: n("answer.first_byte_timeout_ms"), idle_timeout_ms: n("answer.idle_timeout_ms") },
    search: { timeout_ms: n("search.timeout_ms") },
    writing: {
      written_threshold: n("writing.written_threshold"),
      ambiguous_floor: n("writing.ambiguous_floor"),
      polish_disfluency: n("writing.polish_disfluency"),
      run_on_words: n("writing.run_on_words"),
      skip_polish_words: n("writing.skip_polish_words"),
    },
    free: {
      ai_per_week: n("free.ai_per_week"),
      suggestions_per_week: n("free.suggestions_per_week"),
      memory_hours: n("free.memory_hours"),
      meetings_per_month: n("free.meetings_per_month"),
    },
    kinds: Object.fromEntries(
      KINDS.map((k) => [
        k,
        {
          enabled: values[`kind.${k}.enabled`] !== false,
          min_confidence: n(`kind.${k}.min_confidence`),
          cooldown_min: n(`kind.${k}.cooldown_min`),
        },
      ]),
    ),
  };
}

// ── Daily auto-tuning ────────────────────────────────────────────────────

/** Aggregates over the tuning window (14 days), from product_events_daily. */
export type TuneStats = {
  /** Per suggestion kind: offers and accepted results. */
  kinds: Record<string, { offered: number; accepted: number }>;
  /** Per judge engine: runs and timeouts. */
  judge: Partial<Record<"device" | "cloud", { runs: number; timeouts: number }>>;
  /** Routed utterances, and how many ended on a "did you mean to type this?" card. */
  route: { total: number; didYouMean: number };
  /** Smart writing: "Written for you" decisions, and how many were reverted ("Use my words"). */
  writing?: { written: number; writtenReverts: number };
};

export type Change = {
  key: string;
  old: ConfigValue;
  new: ConfigValue;
  reason: string;
  stats: Record<string, number>;
};

/** Thresholds of the tuning rules (also shown in the README and admin). */
export const RULES = {
  /** Low acceptance: tighten. */
  lowRate: 0.15,
  lowMinOffers: 50,
  /** Very low acceptance: turn the kind off. */
  offRate: 0.05,
  offMinOffers: 100,
  /** Strong acceptance: relax a little. */
  highRate: 0.5,
  highMinOffers: 50,
  confidenceUp: 0.05,
  confidenceDown: 0.02,
  cooldownGrow: 1.5,
  cooldownShrink: 1.25,
  /** Judge timeouts. */
  timeoutRate: 0.2,
  timeoutMinRuns: 50,
  timeoutStepMs: 1_000,
  /** Misroutes ("did you mean to type this?"). */
  didYouMeanRate: 0.25,
  didYouMeanMinRoutes: 50,
  biasStep: 0.05,
  /** "Written for you" reverted too often: write less eagerly. */
  writtenRevertRate: 0.2,
  writtenMinCases: 50,
  writtenThresholdStep: 0.05,
} as const;

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * What the rules would change, given the current resolved values. Keys in
 * `locked` (manual overrides, pinned values) are never touched. Each rule
 * needs its minimum sample size; every step stays inside the bounds, and a
 * change that the bounds would cancel isn't proposed.
 */
export function tune(current: Flat, stats: TuneStats, locked: ReadonlySet<string> = new Set()): Change[] {
  const changes: Change[] = [];
  const propose = (key: string, next: ConfigValue, reason: string, s: Record<string, number>) => {
    if (locked.has(key)) return false;
    const value = clampValue(key, next);
    const old = current[key] ?? defaultValue(key);
    if (value === null || old === null || value === old) return false;
    changes.push({ key, old, new: value, reason, stats: s });
    return true;
  };

  for (const kind of KINDS) {
    const k = stats.kinds[kind];
    if (!k || k.offered <= 0) continue;
    const enabledKey = `kind.${kind}.enabled`;
    if (current[enabledKey] === false) continue;
    const rate = k.accepted / k.offered;
    const s = { offered: k.offered, accepted: k.accepted, rate: Math.round(rate * 1000) / 1000 };
    const confKey = `kind.${kind}.min_confidence`;
    const coolKey = `kind.${kind}.cooldown_min`;
    const conf = Number(current[confKey] ?? defaultValue(confKey));
    const cool = Number(current[coolKey] ?? defaultValue(coolKey));

    if (k.offered >= RULES.offMinOffers && rate < RULES.offRate) {
      propose(enabledKey, false, `Accepted ${pct(rate)} of ${k.offered} offers (under ${pct(RULES.offRate)} over ${RULES.offMinOffers}+): turned off`, s);
    } else if (k.offered >= RULES.lowMinOffers && rate < RULES.lowRate) {
      // Raise the bar first; once it's at the ceiling, show it less often.
      if (!propose(confKey, conf + RULES.confidenceUp, `Accepted ${pct(rate)} of ${k.offered} offers (under ${pct(RULES.lowRate)}): higher minimum confidence`, s)) {
        propose(coolKey, cool * RULES.cooldownGrow, `Accepted ${pct(rate)} of ${k.offered} offers (under ${pct(RULES.lowRate)}), confidence at its ceiling: longer cooldown`, s);
      }
    } else if (k.offered >= RULES.highMinOffers && rate >= RULES.highRate) {
      if (!propose(confKey, conf - RULES.confidenceDown, `Accepted ${pct(rate)} of ${k.offered} offers (${pct(RULES.highRate)}+): slightly lower minimum confidence`, s)) {
        // At least a minute shorter, so a short cooldown doesn't round back to itself.
        propose(coolKey, Math.min(cool - 1, cool / RULES.cooldownShrink), `Accepted ${pct(rate)} of ${k.offered} offers (${pct(RULES.highRate)}+), confidence at its floor: shorter cooldown`, s);
      }
    }
  }

  const engineKey = { device: "judge.timeout_ms", cloud: "judge.cloud_timeout_ms" } as const;
  for (const engine of ["device", "cloud"] as const) {
    const j = stats.judge[engine];
    if (!j || j.runs < RULES.timeoutMinRuns) continue;
    const rate = j.timeouts / j.runs;
    if (rate <= RULES.timeoutRate) continue;
    const key = engineKey[engine];
    const cur = Number(current[key] ?? defaultValue(key));
    propose(key, cur + RULES.timeoutStepMs, `The ${engine} judge timed out on ${pct(rate)} of ${j.runs} runs (over ${pct(RULES.timeoutRate)}): longer timeout`, {
      runs: j.runs,
      timeouts: j.timeouts,
      rate: Math.round(rate * 1000) / 1000,
    });
  }

  if (stats.route.total >= RULES.didYouMeanMinRoutes) {
    const rate = stats.route.didYouMean / stats.route.total;
    if (rate > RULES.didYouMeanRate) {
      const key = "router.did_you_mean_bias";
      const cur = Number(current[key] ?? defaultValue(key));
      propose(key, cur + RULES.biasStep, `${pct(rate)} of ${stats.route.total} requests ended on "did you mean to type this?" (over ${pct(RULES.didYouMeanRate)}): lean towards the agent`, {
        routes: stats.route.total,
        did_you_mean: stats.route.didYouMean,
        rate: Math.round(rate * 1000) / 1000,
      });
    }
  }
  const w = stats.writing;
  if (w && w.written >= RULES.writtenMinCases) {
    const rate = w.writtenReverts / w.written;
    if (rate > RULES.writtenRevertRate) {
      const key = "writing.written_threshold";
      const cur = Number(current[key] ?? defaultValue(key));
      propose(key, cur + RULES.writtenThresholdStep, `${pct(rate)} of ${w.written} "Written for you" were reverted (over ${pct(RULES.writtenRevertRate)}): write for them less eagerly`, {
        written: w.written,
        reverts: w.writtenReverts,
        rate: Math.round(rate * 1000) / 1000,
      });
    }
  }
  return changes;
}
