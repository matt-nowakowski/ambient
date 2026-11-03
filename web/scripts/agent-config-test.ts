/**
 * Tests the remote agent config (lib/agent/config.ts): the schema's shape,
 * clamping, unknown keys, layer precedence and every tuning rule with sample
 * data, including the minimum sample sizes. No network or database.
 *
 * Run: bun scripts/agent-config-test.ts
 */
import schema from "../lib/agent/config-schema.json";
import telemetry from "../lib/agent/telemetry-schema.json";
import {
  GLOBAL_KEYS,
  KINDS,
  RULES,
  boundFor,
  clampValue,
  configKeys,
  defaults,
  resolve,
  sanitize,
  toPublic,
  tune,
  type TuneStats,
} from "../lib/agent/config";

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}

// ── Schema shape ──────────────────────────────────────────────────────
check("schema version is 1", schema.schema === 1);
check(
  "every bound has min ≤ default ≤ max",
  Object.values(schema.bounds).every((b) => b.min <= b.default && b.default <= b.max),
);
check("every global key has a bound", GLOBAL_KEYS.every((k) => boundFor(k) !== null && boundFor(k) !== "bool"));
check("config kinds match telemetry suggestion kinds", JSON.stringify(KINDS) === JSON.stringify(telemetry.enums.suggestion_kind));
check("16 kinds × 3 + 8 globals", configKeys().length === KINDS.length * 3 + GLOBAL_KEYS.length);
const pub = toPublic(defaults(), new Date("2026-11-02T00:00:00Z"));
check(
  "public config shape",
  pub.schema === 1 &&
    pub.hourly_budget === 3 &&
    pub.judge.timeout_ms === 4000 &&
    pub.judge.cloud_timeout_ms === 7000 &&
    pub.judge.min_confidence === 0.7 &&
    pub.router.did_you_mean_bias === 0.5 &&
    pub.answer.first_byte_timeout_ms === 25000 &&
    pub.answer.idle_timeout_ms === 20000 &&
    pub.search.timeout_ms === 6000 &&
    Object.keys(pub.kinds).length === KINDS.length &&
    pub.kinds.draft_reply.enabled === true &&
    pub.kinds.draft_reply.min_confidence === 0.7 &&
    pub.kinds.draft_reply.cooldown_min === 60 &&
    pub.generated_at === "2026-11-02T00:00:00.000Z",
);

// ── Clamping ──────────────────────────────────────────────────────────
check("clamped to max", clampValue("judge.timeout_ms", 999_999) === 10_000);
check("clamped to min", clampValue("hourly_budget", 0) === 1);
check("integers rounded", clampValue("kind.draft_reply.cooldown_min", 61.6) === 62);
check("fractions keep two decimals", clampValue("judge.min_confidence", 0.7345) === 0.73);
check("fraction clamped", clampValue("router.did_you_mean_bias", 3) === 1 && clampValue("kind.help_here.min_confidence", 0.1) === 0.5);
check("unknown key ignored", clampValue("judge.temperature", 0.3) === null);
check("unknown kind ignored", clampValue("kind.make_coffee.enabled", true) === null);
check("wrong type ignored", clampValue("hourly_budget", "5") === null && clampValue("kind.draft_reply.enabled", 1) === null);
check("NaN / Infinity ignored", clampValue("hourly_budget", NaN) === null && clampValue("hourly_budget", Infinity) === null);
const clean = sanitize({ hourly_budget: 50, nonsense: 1, "kind.draft_reply.enabled": false });
check("sanitize keeps known, clamps, drops unknown", clean.hourly_budget === 10 && clean["kind.draft_reply.enabled"] === false && !("nonsense" in clean));

// ── Precedence: manual > auto > default ───────────────────────────────
const r = resolve({ hourly_budget: 5, "judge.timeout_ms": 6000 }, { hourly_budget: 2 });
check("manual wins over auto", r.values.hourly_budget === 2 && r.sources.hourly_budget === "manual");
check("auto wins over default", r.values["judge.timeout_ms"] === 6000 && r.sources["judge.timeout_ms"] === "auto");
check("default otherwise", r.values["answer.idle_timeout_ms"] === 20000 && r.sources["answer.idle_timeout_ms"] === "default");
check("manual is clamped too", resolve({}, { "judge.timeout_ms": 1 }).values["judge.timeout_ms"] === 2000);

// ── Tuning rules ──────────────────────────────────────────────────────
const base: TuneStats = { kinds: {}, judge: {}, route: { total: 0, didYouMean: 0 } };
const stats = (s: Partial<TuneStats>): TuneStats => ({ ...base, ...s });
const d = defaults();
const keys = (cs: { key: string }[]) => cs.map((c) => c.key).sort().join(",");

let c = tune(d, stats({ kinds: { help_here: { offered: 60, accepted: 6 } } }));
check("<15% over ≥50 offers → +0.05 min confidence", c.length === 1 && c[0].key === "kind.help_here.min_confidence" && c[0].new === 0.75 && c[0].old === 0.7);
check("the change carries its reason and numbers", /10%/.test(c[0].reason) && c[0].stats.offered === 60 && c[0].stats.accepted === 6);

c = tune(d, stats({ kinds: { help_here: { offered: 49, accepted: 0 } } }));
check("low acceptance under the minimum sample → no change", c.length === 0);

c = tune({ ...d, "kind.help_here.min_confidence": 0.95 }, stats({ kinds: { help_here: { offered: 60, accepted: 6 } } }));
check("confidence at its ceiling → longer cooldown (×1.5)", c.length === 1 && c[0].key === "kind.help_here.cooldown_min" && c[0].new === 90);

c = tune({ ...d, "kind.help_here.min_confidence": 0.95, "kind.help_here.cooldown_min": 1440 }, stats({ kinds: { help_here: { offered: 60, accepted: 6 } } }));
check("both at their bounds → no change", c.length === 0);

c = tune(d, stats({ kinds: { price_check: { offered: 120, accepted: 4 } } }));
check("<5% over ≥100 offers → disabled", c.length === 1 && c[0].key === "kind.price_check.enabled" && c[0].new === false);

c = tune(d, stats({ kinds: { price_check: { offered: 99, accepted: 2 } } }));
check("<5% over 99 offers → tightened, not disabled", c.length === 1 && c[0].key === "kind.price_check.min_confidence");

c = tune({ ...d, "kind.price_check.enabled": false }, stats({ kinds: { price_check: { offered: 120, accepted: 4 } } }));
check("an already disabled kind isn't touched", c.length === 0);

c = tune(d, stats({ kinds: { summarise_thread: { offered: 80, accepted: 48 } } }));
check("≥50% over ≥50 offers → −0.02 min confidence", c.length === 1 && c[0].key === "kind.summarise_thread.min_confidence" && c[0].new === 0.68);

c = tune({ ...d, "kind.summarise_thread.min_confidence": 0.5 }, stats({ kinds: { summarise_thread: { offered: 80, accepted: 48 } } }));
check("confidence at its floor → shorter cooldown (÷1.25)", c.length === 1 && c[0].key === "kind.summarise_thread.cooldown_min" && c[0].new === 48);

c = tune(d, stats({ kinds: { summarise_thread: { offered: 80, accepted: 20 } } }));
check("25–50% acceptance → no change", c.length === 0);

c = tune(d, stats({ judge: { device: { runs: 100, timeouts: 25 }, cloud: { runs: 100, timeouts: 10 } } }));
check("device judge timeouts >20% over ≥50 runs → +1000 ms", c.length === 1 && c[0].key === "judge.timeout_ms" && c[0].new === 5000);

c = tune(d, stats({ judge: { cloud: { runs: 60, timeouts: 30 } } }));
check("cloud judge → cloud timeout", c.length === 1 && c[0].key === "judge.cloud_timeout_ms" && c[0].new === 8000);

c = tune(d, stats({ judge: { device: { runs: 40, timeouts: 30 } } }));
check("judge timeouts under the minimum runs → no change", c.length === 0);

c = tune({ ...d, "judge.timeout_ms": 10_000 }, stats({ judge: { device: { runs: 100, timeouts: 50 } } }));
check("judge timeout at its ceiling → no change", c.length === 0);

c = tune(d, stats({ route: { total: 200, didYouMean: 60 } }));
check("did you mean >25% over ≥50 → bias +0.05", c.length === 1 && c[0].key === "router.did_you_mean_bias" && c[0].new === 0.55);

c = tune(d, stats({ route: { total: 40, didYouMean: 30 } }));
check("did you mean under the minimum sample → no change", c.length === 0);

c = tune(d, stats({ route: { total: 200, didYouMean: 40 } }));
check("did you mean at 20% → no change", c.length === 0);

const all = stats({
  kinds: { help_here: { offered: 60, accepted: 6 }, price_check: { offered: 120, accepted: 1 } },
  judge: { device: { runs: 100, timeouts: 40 } },
  route: { total: 100, didYouMean: 40 },
});
c = tune(d, all, new Set(["kind.help_here.min_confidence", "router.did_you_mean_bias"]));
check(
  "manual / pinned keys are never tuned (a pinned confidence leaves only the cooldown to tune)",
  keys(c) === "judge.timeout_ms,kind.help_here.cooldown_min,kind.price_check.enabled",
);
check("rule thresholds as documented", RULES.lowRate === 0.15 && RULES.offRate === 0.05 && RULES.timeoutRate === 0.2 && RULES.didYouMeanRate === 0.25);

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
