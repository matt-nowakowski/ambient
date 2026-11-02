import "server-only";
import { after } from "next/server";
import { isDatabaseConfigured, usageDb } from "./db";

/**
 * Cheap usage aggregates for the admin dashboard: how many hosted AI calls and
 * searches we pay for, per day, plan and (for paid accounts) customer.
 *
 * Nothing here writes per request. Each server instance adds to in-memory
 * counters; after a response is sent (`after()`), the counters are written to
 * Neon in one batched upsert, but only once the oldest unflushed count is
 * FLUSH_INTERVAL_MS old (or FLUSH_AT_REQUESTS have piled up). There are no
 * timers: a flush only ever piggybacks on a real request, and never runs with
 * nothing to write. Ten minutes is twice Neon's five-minute autosuspend, so a
 * light trickle of paid requests (which otherwise never touch the database)
 * lets Neon sleep between flushes. The trade-off: counts an instance holds when
 * it shuts down are lost, so treat the numbers as a slight undercount.
 *
 * Recording never throws and never changes a route's response.
 */
export type UsageKind =
  /** /api/ai chat completions other than routing: polish, summaries, actions. */
  | "ai_polish"
  /** /api/ai chat completions from the agent's router. */
  | "ai_route"
  /** /api/agent/answer, answer mode. */
  | "ai_answer"
  /** /api/agent/answer, write mode. */
  | "ai_write"
  /** A web search an answer asked for (served from cache or Tavily). */
  | "search"
  /** A search that reached Tavily (cache miss): the billed ones. */
  | "search_upstream";

export type UsagePlan = "free" | "trial" | "pro" | "team" | "all";

export const FLUSH_INTERVAL_MS = 10 * 60_000;
const FLUSH_AT_REQUESTS = 500;
export const USAGE_SUBJECT_RETENTION_DAYS = 90;
/** Bound memory: per-key unique-subject sets stop growing past this. */
const MAX_SUBJECTS_PER_KEY = 5_000;

type DailyEntry = { requests: number; input: number; output: number; subjects: Set<string> };
type SubjectEntry = { plan: UsagePlan; ai: number; searches: number; input: number; output: number };

let daily = new Map<string, DailyEntry>();
let perSubject = new Map<string, SubjectEntry>();
let pending = 0;
/** When the oldest unflushed count was recorded (0 = nothing pending). */
let oldestPending = 0;
let flushing: Promise<void> | null = null;
let lastPruneDay = "";

const today = () => new Date().toISOString().slice(0, 10);

/** Tokens from an OpenAI-compatible `usage` object, or an estimate (~4 chars per token). */
export function tokensFrom(
  usage: unknown,
  fallback: { inputChars: number; outputChars: number },
): { input: number; output: number } {
  const u = usage as { prompt_tokens?: unknown; completion_tokens?: unknown } | null | undefined;
  const input = Number(u?.prompt_tokens);
  const output = Number(u?.completion_tokens);
  if (Number.isFinite(input) && Number.isFinite(output) && input >= 0 && output >= 0) {
    return { input, output };
  }
  return { input: Math.ceil(fallback.inputChars / 4), output: Math.ceil(fallback.outputChars / 4) };
}

export function recordUsage(event: {
  kind: UsageKind;
  plan: UsagePlan;
  subject?: string;
  inputTokens?: number;
  outputTokens?: number;
}) {
  try {
    if (!isDatabaseConfigured()) return;
    const day = today();
    const input = Math.max(0, Math.round(event.inputTokens ?? 0));
    const output = Math.max(0, Math.round(event.outputTokens ?? 0));

    const key = `${day}|${event.kind}|${event.plan}`;
    const d = daily.get(key) ?? { requests: 0, input: 0, output: 0, subjects: new Set<string>() };
    d.requests += 1;
    d.input += input;
    d.output += output;
    if (event.subject && d.subjects.size < MAX_SUBJECTS_PER_KEY) d.subjects.add(event.subject);
    daily.set(key, d);

    // Per-account rows only for paid plans and trials, never Free machines.
    const paid = event.plan === "pro" || event.plan === "team" || event.plan === "trial";
    if (paid && event.subject && event.kind !== "search_upstream") {
      const sKey = `${day}|${event.subject}`;
      const s = perSubject.get(sKey) ?? { plan: event.plan, ai: 0, searches: 0, input: 0, output: 0 };
      if (event.kind === "search") s.searches += 1;
      else s.ai += 1;
      s.input += input;
      s.output += output;
      s.plan = event.plan;
      perSubject.set(sKey, s);
    }
    if (pending === 0) oldestPending = Date.now();
    pending += 1;
    // Never let a long-lived instance that can't reach the database grow unbounded.
    if (daily.size > 2_000 || perSubject.size > 50_000) {
      daily.clear();
      perSubject.clear();
      pending = 0;
    }
  } catch {
    // Counting must never affect the request.
  }
}

/**
 * Call once per request from a route handler: after the response is sent,
 * flushes if this instance is due. Safe to call when nothing was recorded.
 */
export function scheduleUsageFlush() {
  try {
    after(() => flushUsageIfDue());
  } catch {
    // Outside a request scope (build, tests): nothing to schedule.
  }
}

export async function flushUsageIfDue(now = Date.now()) {
  if (pending === 0 || flushing) return;
  if (now - oldestPending < FLUSH_INTERVAL_MS && pending < FLUSH_AT_REQUESTS) return;
  await flushUsage();
}

/** Writes and clears this instance's counters (one round trip). */
export async function flushUsage() {
  if (flushing) return flushing;
  if (pending === 0 || !isDatabaseConfigured()) return;
  const d = daily;
  const s = perSubject;
  daily = new Map();
  perSubject = new Map();
  pending = 0;
  const restoreOldest = oldestPending;
  oldestPending = 0;

  flushing = (async () => {
    try {
      const sql = await usageDb();
      const dRows = [...d.entries()].map(([k, v]) => {
        const [day, kind, plan] = k.split("|");
        return { day, kind, plan, ...v };
      });
      const sRows = [...s.entries()].map(([k, v]) => {
        const [day, subject] = k.split("|");
        return { day, subject, ...v };
      });
      const queries = [];
      if (dRows.length) {
        queries.push(sql`
          insert into usage_daily (day, kind, plan, requests, input_tokens, output_tokens, subjects)
          select * from unnest(
            ${dRows.map((r) => r.day)}::date[],
            ${dRows.map((r) => r.kind)}::text[],
            ${dRows.map((r) => r.plan)}::text[],
            ${dRows.map((r) => r.requests)}::int[],
            ${dRows.map((r) => r.input)}::bigint[],
            ${dRows.map((r) => r.output)}::bigint[],
            ${dRows.map((r) => r.subjects.size)}::int[]
          )
          on conflict (day, kind, plan) do update set
            requests = usage_daily.requests + excluded.requests,
            input_tokens = usage_daily.input_tokens + excluded.input_tokens,
            output_tokens = usage_daily.output_tokens + excluded.output_tokens,
            subjects = usage_daily.subjects + excluded.subjects`);
      }
      if (sRows.length) {
        queries.push(sql`
          insert into usage_subject_daily (day, subject, plan, ai_requests, searches, input_tokens, output_tokens)
          select * from unnest(
            ${sRows.map((r) => r.day)}::date[],
            ${sRows.map((r) => r.subject)}::text[],
            ${sRows.map((r) => r.plan)}::text[],
            ${sRows.map((r) => r.ai)}::int[],
            ${sRows.map((r) => r.searches)}::int[],
            ${sRows.map((r) => r.input)}::bigint[],
            ${sRows.map((r) => r.output)}::bigint[]
          )
          on conflict (day, subject) do update set
            plan = excluded.plan,
            ai_requests = usage_subject_daily.ai_requests + excluded.ai_requests,
            searches = usage_subject_daily.searches + excluded.searches,
            input_tokens = usage_subject_daily.input_tokens + excluded.input_tokens,
            output_tokens = usage_subject_daily.output_tokens + excluded.output_tokens`);
      }
      const day = today();
      if (lastPruneDay !== day) {
        queries.push(sql`
          delete from usage_subject_daily
          where day < current_date - ${USAGE_SUBJECT_RETENTION_DAYS}::int`);
      }
      if (queries.length) await sql.transaction(queries);
      lastPruneDay = day;
    } catch (err) {
      console.error("[usage] flush failed", err);
      // Put the counts back so a later flush retries them.
      if (!oldestPending || restoreOldest < oldestPending) oldestPending = restoreOldest;
      for (const [k, v] of d) {
        const cur = daily.get(k);
        if (cur) {
          cur.requests += v.requests;
          cur.input += v.input;
          cur.output += v.output;
          for (const x of v.subjects) if (cur.subjects.size < MAX_SUBJECTS_PER_KEY) cur.subjects.add(x);
        } else daily.set(k, v);
        pending += v.requests;
      }
      for (const [k, v] of s) {
        const cur = perSubject.get(k);
        if (cur) {
          cur.ai += v.ai;
          cur.searches += v.searches;
          cur.input += v.input;
          cur.output += v.output;
        } else perSubject.set(k, v);
      }
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
