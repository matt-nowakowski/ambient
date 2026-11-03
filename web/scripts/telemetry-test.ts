/**
 * Tests the telemetry allowlist (lib/agent/telemetry.ts against
 * telemetry-schema.json), the canonical props key and the bucket maths.
 * No network or database.
 *
 * Run: bun scripts/telemetry-test.ts
 */
import schema from "../lib/agent/telemetry-schema.json";
import {
  EVENT_NAMES,
  MAX_EVENTS,
  allowedValues,
  bucketPercentile,
  fmtBucketMs,
  msBucket,
  parseBatch,
  parsePropsKey,
  propsKey,
  validEvent,
} from "../lib/agent/telemetry";

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}

const install = "0123456789abcdef0123456789abcdef";
const batch = (events: unknown[], over: Record<string, unknown> = {}) => ({ v: 1, install, version: "0.1.6", os: "macos", plan: "pro", events, ...over });
const offered = { name: "suggestion_offered", props: { kind: "draft_reply", judge: "device", app_category: "mail" }, n: 2 };

// A valid example of every event in the schema is accepted.
const sample = (name: string) => {
  const spec = (schema.events as Record<string, Record<string, unknown>>)[name];
  const props: Record<string, string | boolean> = {};
  for (const [k, s] of Object.entries(spec)) {
    const allowed = allowedValues(s as string | string[]);
    props[k] = allowed === "bool" ? true : allowed[0];
  }
  return { name, props, n: 1 };
};
check("every schema event has a valid sample", EVENT_NAMES.every((n) => validEvent(sample(n))));
check("a batch of every event parses", parseBatch(batch(EVENT_NAMES.map(sample))) !== null);
check("valid batch parses", parseBatch(batch([offered]))?.events.length === 1);
check("event with no props (did_you_mean_shown)", validEvent({ name: "did_you_mean_shown", props: {}, n: 3 }));
check(
  "limit_hit takes ai, suggestions or meetings only",
  ["ai", "suggestions", "meetings"].every((kind) => validEvent({ name: "limit_hit", props: { kind }, n: 1 })) &&
    !validEvent({ name: "limit_hit", props: { kind: "words" }, n: 1 }),
);

check("unknown event rejected", parseBatch(batch([{ name: "keystroke", props: {}, n: 1 }])) === null);
check("unknown prop rejected", !validEvent({ ...offered, props: { ...offered.props, title: "Re: invoice" } }));
check("missing prop rejected", !validEvent({ ...offered, props: { kind: "draft_reply", judge: "device" } }));
check("value off the enum rejected", !validEvent({ ...offered, props: { ...offered.props, app_category: "Slack" } }));
check("free text in an enum slot rejected", !validEvent({ ...offered, props: { ...offered.props, kind: "my secret email" } }));
check("number where a bucket goes rejected", !validEvent({ name: "dictation", props: { polish: true, ms_bucket: 812 }, n: 1 }));
check("string where a bool goes rejected", !validEvent({ name: "dictation", props: { polish: "true", ms_bucket: "lt1s" }, n: 1 }));
check("extra event field rejected", !validEvent({ ...offered, text: "hello" }));
check("n must be 1..1000", !validEvent({ ...offered, n: 0 }) && !validEvent({ ...offered, n: 1001 }) && !validEvent({ ...offered, n: 1.5 }));
check("one bad event rejects the whole batch", parseBatch(batch([offered, { ...offered, props: {} }])) === null);

check("bad install id rejected", parseBatch(batch([offered], { install: "machine-1234" })) === null);
check("uppercase install id rejected", parseBatch(batch([offered], { install: install.toUpperCase() })) === null);
check("bad os rejected", parseBatch(batch([offered], { os: "android" })) === null);
check("bad plan rejected (team is reported as pro)", parseBatch(batch([offered], { plan: "team" })) === null);
check("bad version rejected", parseBatch(batch([offered], { version: "<script>" })) === null);
check("wrong schema version rejected", parseBatch(batch([offered], { v: 2 })) === null);
check("extra top-level field rejected", parseBatch(batch([offered], { email: "a@b.c" })) === null);
check("empty batch rejected", parseBatch(batch([])) === null);
check(`more than ${MAX_EVENTS} events rejected`, parseBatch(batch(Array.from({ length: MAX_EVENTS + 1 }, () => offered))) === null);
check(`${MAX_EVENTS} events accepted`, parseBatch(batch(Array.from({ length: MAX_EVENTS }, () => offered))) !== null);
check("non-object body rejected", parseBatch("hello") === null && parseBatch(null) === null && parseBatch([]) === null);

// props_key is canonical: sorted, includes os and plan, round-trips.
const k1 = propsKey({ kind: "draft_reply", judge: "device", app_category: "mail" }, { os: "macos", plan: "pro" });
const k2 = propsKey({ app_category: "mail", judge: "device", kind: "draft_reply" }, { os: "macos", plan: "pro" });
check("props_key independent of prop order", k1 === k2);
check("props_key sorted with os and plan", k1 === "app_category=mail&judge=device&kind=draft_reply&os=macos&plan=pro");
check("props_key booleans", propsKey({ web: true }, { os: "linux", plan: "free" }) === "os=linux&plan=free&web=true");
check("props_key round-trips", parsePropsKey(k1).kind === "draft_reply" && parsePropsKey(k1).os === "macos");

// Buckets.
check("msBucket edges", msBucket(0) === "lt250" && msBucket(249) === "lt250" && msBucket(250) === "lt500" && msBucket(999) === "lt1s" && msBucket(29_999) === "lt30s" && msBucket(30_000) === "ge30s");
check("every msBucket output is in the schema", [0, 300, 700, 1500, 3000, 7000, 20_000, 90_000].every((ms) => schema.buckets.ms.includes(msBucket(ms))));
const counts = { lt500: 50, lt1s: 30, lt2s: 15, lt5s: 5 };
check("p50 from buckets", bucketPercentile(counts, 0.5) === 500);
check("p95 from buckets", bucketPercentile(counts, 0.95) === 2_000);
check("p100 lands in the top bucket", bucketPercentile(counts, 1) === 5_000);
check("no counts → null", bucketPercentile({}, 0.5) === null);
check("open bucket p95", bucketPercentile({ ge30s: 10 }, 0.95) === 60_000 && fmtBucketMs(60_000) === "≥ 30 s");
check("bucket formatting", fmtBucketMs(500) === "< 500 ms" && fmtBucketMs(2_000) === "< 2 s" && fmtBucketMs(null) === "—");

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
