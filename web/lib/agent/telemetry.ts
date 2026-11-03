/**
 * Anonymous product analytics: the allowlist check and bucket maths, shared by
 * /api/telemetry, the admin's Agent health tab and scripts/telemetry-test.ts.
 * Pure: no server-only imports.
 *
 * The allowlist is `telemetry-schema.json`, the same file the desktop app's
 * unit test checks its own table against. A batch is accepted only when every
 * event, every prop and every value is on it; anything else rejects the whole
 * batch, so a client bug can never smuggle free text in.
 */
import schema from "./telemetry-schema.json";

export const TELEMETRY_VERSION = schema.version;
export const MAX_EVENTS = 200;
export const MAX_COUNT = 1_000;
export const MAX_VERSION_CHARS = 20;

type Spec = string[] | string;
type EventSpec = Record<string, Spec>;

const EVENTS = schema.events as Record<string, EventSpec>;
const ENUMS = schema.enums as Record<string, string[]>;
const BUCKETS = schema.buckets as Record<string, string[]>;

export const EVENT_NAMES = Object.keys(EVENTS);
export const MS_BUCKETS = BUCKETS.ms;
export const DURATION_BUCKETS = BUCKETS.duration;
export const PLATFORMS = ENUMS.platform;
export const PLANS = ENUMS.plan;
export const SUGGESTION_KINDS = ENUMS.suggestion_kind;

/** Upper bound in ms of each ms bucket (the last is open: a nominal 60 s). */
export const MS_BUCKET_UPPER: Record<string, number> = {
  lt250: 250,
  lt500: 500,
  lt1s: 1_000,
  lt2s: 2_000,
  lt5s: 5_000,
  lt10s: 10_000,
  lt30s: 30_000,
  ge30s: 60_000,
};

/** The values a prop spec allows, or "bool". */
export function allowedValues(spec: Spec): string[] | "bool" {
  if (Array.isArray(spec)) return spec;
  if (spec === "bool") return "bool";
  if (spec.startsWith("@")) return ENUMS[spec.slice(1)] ?? [];
  if (spec.startsWith("#")) return BUCKETS[spec.slice(1)] ?? [];
  return [];
}

export type PropValue = string | boolean;
export type TelemetryEvent = { name: string; props: Record<string, PropValue>; n: number };
export type TelemetryBatch = {
  v: 1;
  install: string;
  version: string;
  os: string;
  plan: string;
  events: TelemetryEvent[];
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function validProps(spec: EventSpec, props: unknown): props is Record<string, PropValue> {
  if (!isObject(props)) return false;
  const keys = Object.keys(props);
  if (keys.length !== Object.keys(spec).length) return false;
  for (const k of keys) {
    if (!Object.hasOwn(spec, k)) return false;
    const allowed = allowedValues(spec[k]);
    const value = props[k];
    if (allowed === "bool") {
      if (typeof value !== "boolean") return false;
    } else if (typeof value !== "string" || !allowed.includes(value)) {
      return false;
    }
  }
  return true;
}

/** One event on the allowlist, or false. */
export function validEvent(e: unknown): e is TelemetryEvent {
  if (!isObject(e)) return false;
  if (Object.keys(e).some((k) => k !== "name" && k !== "props" && k !== "n")) return false;
  if (typeof e.name !== "string" || !Object.hasOwn(EVENTS, e.name)) return false;
  if (!Number.isInteger(e.n) || (e.n as number) < 1 || (e.n as number) > MAX_COUNT) return false;
  return validProps(EVENTS[e.name], e.props);
}

/**
 * The whole batch, strictly; null when anything in it is off the allowlist.
 * Unknown top-level fields reject too.
 */
export function parseBatch(body: unknown): TelemetryBatch | null {
  if (!isObject(body)) return null;
  const allowedTop = new Set(["v", "install", "version", "os", "plan", "events"]);
  if (Object.keys(body).some((k) => !allowedTop.has(k))) return null;
  if (body.v !== 1) return null;
  if (typeof body.install !== "string" || !/^[0-9a-f]{32}$/.test(body.install)) return null;
  if (typeof body.version !== "string" || !/^\d{1,4}\.\d{1,4}\.\d{1,6}([-+][0-9A-Za-z.-]{1,10})?$/.test(body.version)) return null;
  if (body.version.length > MAX_VERSION_CHARS) return null;
  if (typeof body.os !== "string" || !PLATFORMS.includes(body.os)) return null;
  if (typeof body.plan !== "string" || !PLANS.includes(body.plan)) return null;
  if (!Array.isArray(body.events) || body.events.length === 0 || body.events.length > MAX_EVENTS) return null;
  if (!body.events.every(validEvent)) return null;
  return body as TelemetryBatch;
}

/** Canonical `k=v&…` key, sorted, with os and plan included. */
export function propsKey(props: Record<string, PropValue>, common: { os: string; plan: string }): string {
  const all: Record<string, PropValue> = { ...props, os: common.os, plan: common.plan };
  return Object.keys(all)
    .sort()
    .map((k) => `${k}=${String(all[k])}`)
    .join("&");
}

/** Parses a props_key back into its fields. */
export function parsePropsKey(key: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of key.split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

/** The ms bucket a duration falls into (mirrors the app's `ms_bucket`). */
export function msBucket(ms: number): string {
  if (ms < 250) return "lt250";
  if (ms < 500) return "lt500";
  if (ms < 1_000) return "lt1s";
  if (ms < 2_000) return "lt2s";
  if (ms < 5_000) return "lt5s";
  if (ms < 10_000) return "lt10s";
  if (ms < 30_000) return "lt30s";
  return "ge30s";
}

/**
 * A percentile from bucket counts, reported as the upper bound of the bucket
 * it lands in (so "p95 < 2 s"). Null without any counts.
 */
export function bucketPercentile(counts: Record<string, number>, p: number): number | null {
  const total = MS_BUCKETS.reduce((n, b) => n + (counts[b] ?? 0), 0);
  if (total <= 0) return null;
  const target = Math.max(1, Math.ceil(total * p));
  let seen = 0;
  for (const b of MS_BUCKETS) {
    seen += counts[b] ?? 0;
    if (seen >= target) return MS_BUCKET_UPPER[b];
  }
  return MS_BUCKET_UPPER.ge30s;
}

/** "< 2 s", "≥ 30 s": how a bucket bound reads. */
export function fmtBucketMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms >= 60_000) return "≥ 30 s";
  return ms < 1_000 ? `< ${ms} ms` : `< ${ms / 1_000} s`;
}
