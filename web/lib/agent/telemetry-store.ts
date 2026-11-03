import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { PRODUCT_RETENTION_DAYS, isDatabaseConfigured, productDb } from "../db";
import { propsKey, type TelemetryBatch } from "./telemetry";

/**
 * Aggregates accepted telemetry batches in memory and writes them to Neon in
 * one batched upsert, the same way lib/usage.ts does: no timers, a flush only
 * piggybacks on a real request (`after()`), once the oldest unflushed count is
 * FLUSH_INTERVAL_MS old or FLUSH_AT_EVENTS have piled up. Counts an instance
 * holds when it stops are lost (a slight undercount, never a wrong number).
 *
 * Nothing raw is kept: per (day, event, canonical props, version) counters,
 * plus a per-day hash of each install id for "opted-in installs per day".
 * Recording never throws.
 */
export const FLUSH_INTERVAL_MS = 10 * 60_000;
const FLUSH_AT_EVENTS = 5_000;
const MAX_KEYS = 20_000;
const MAX_INSTALLS = 50_000;

let counts = new Map<string, number>();
let installs = new Set<string>();
let pending = 0;
let oldestPending = 0;
let flushing: Promise<void> | null = null;
let lastPruneDay = "";

const today = () => new Date().toISOString().slice(0, 10);

/** sha256(install:day), truncated: counts installs per day, unlinkable across days. */
export function installHash(install: string, day: string) {
  return createHash("sha256").update(`${install}:${day}`).digest("hex").slice(0, 24);
}

export function recordBatch(batch: TelemetryBatch) {
  try {
    if (!isDatabaseConfigured()) return;
    const day = today();
    const common = { os: batch.os, plan: batch.plan };
    for (const e of batch.events) {
      // Tab-separated: none of the fields can contain a tab (allowlisted values).
      const key = `${day}\t${e.name}\t${propsKey(e.props, common)}\t${batch.version}`;
      counts.set(key, (counts.get(key) ?? 0) + e.n);
      if (pending === 0) oldestPending = Date.now();
      pending += e.n;
    }
    if (installs.size < MAX_INSTALLS) installs.add(`${day}\t${installHash(batch.install, day)}`);
    if (counts.size > MAX_KEYS) {
      // A long-lived instance that can't reach the database must not grow forever.
      counts.clear();
      installs.clear();
      pending = 0;
    }
  } catch {
    // Counting never affects the response.
  }
}

export function scheduleTelemetryFlush() {
  try {
    after(() => flushTelemetryIfDue());
  } catch {
    // Outside a request scope: nothing to schedule.
  }
}

export async function flushTelemetryIfDue(now = Date.now()) {
  if (pending === 0 || flushing) return;
  if (now - oldestPending < FLUSH_INTERVAL_MS && pending < FLUSH_AT_EVENTS) return;
  await flushTelemetry();
}

export async function flushTelemetry() {
  if (flushing) return flushing;
  if (pending === 0 || !isDatabaseConfigured()) return;
  const c = counts;
  const i = installs;
  const restorePending = pending;
  const restoreOldest = oldestPending;
  counts = new Map();
  installs = new Set();
  pending = 0;
  oldestPending = 0;

  flushing = (async () => {
    try {
      const sql = await productDb();
      const rows = [...c.entries()].map(([k, n]) => {
        const [day, name, props, version] = k.split("\t");
        return { day, name, props, version, n };
      });
      const inst = [...i].map((k) => k.split("\t"));
      const queries = [];
      if (rows.length) {
        queries.push(sql`
          insert into product_events_daily (day, name, props_key, version, count)
          select * from unnest(
            ${rows.map((r) => r.day)}::date[],
            ${rows.map((r) => r.name)}::text[],
            ${rows.map((r) => r.props)}::text[],
            ${rows.map((r) => r.version)}::text[],
            ${rows.map((r) => r.n)}::int[]
          )
          on conflict (day, name, props_key, version) do update set
            count = product_events_daily.count + excluded.count`);
      }
      if (inst.length) {
        queries.push(sql`
          insert into product_installs_daily (day, install_hash)
          select * from unnest(${inst.map((x) => x[0])}::date[], ${inst.map((x) => x[1])}::text[])
          on conflict do nothing`);
      }
      const day = today();
      if (lastPruneDay !== day) {
        queries.push(sql`delete from product_events_daily where day < current_date - ${PRODUCT_RETENTION_DAYS}::int`);
        queries.push(sql`delete from product_installs_daily where day < current_date - ${PRODUCT_RETENTION_DAYS}::int`);
      }
      if (queries.length) await sql.transaction(queries);
      lastPruneDay = day;
    } catch (err) {
      console.error("[telemetry] flush failed:", err instanceof Error ? err.message.slice(0, 80) : "error");
      // Put the counts back so a later flush retries them.
      for (const [k, n] of c) counts.set(k, (counts.get(k) ?? 0) + n);
      for (const x of i) installs.add(x);
      pending += restorePending;
      if (!oldestPending || restoreOldest < oldestPending) oldestPending = restoreOldest;
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
