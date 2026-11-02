import "server-only";
import { unstable_cache } from "next/cache";
import { HF_USER, R2_BUCKET, VERCEL_TEAM_ID, depById } from "./costs";

/**
 * Read-only calls to each provider's usage/billing API. Every call has a short
 * timeout and is cached for 10 minutes across instances, and a failure only
 * marks its own card as errored. Missing keys mean "manual": the card renders
 * from lib/admin/costs.ts and names the env var that would make it live.
 */
export type Meter = { label: string; used: number | null; limit: number; unit: string; note?: string };

export type ProviderLive = {
  status: "live" | "manual" | "error";
  meters: Meter[];
  /** Usage-based spend this calendar month so far (USD), excluding fixed fees. */
  usageCost: number | null;
  /** Projected usage-based spend for the full month (USD). */
  projectedUsageCost: number | null;
  plan?: string;
  details: { label: string; value: string }[];
  error?: string;
  missingEnv?: string[];
  fetchedAt: string;
};

const TTL = 900;
const TIMEOUT = 6_000;

export function monthWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const total = (next.getTime() - start.getTime()) / 86_400_000;
  const elapsed = Math.max((now.getTime() - start.getTime()) / 86_400_000, 1 / 24);
  return { start, next, total, elapsed, project: (mtd: number) => (mtd / elapsed) * total };
}

function base(status: ProviderLive["status"], extra: Partial<ProviderLive> = {}): ProviderLive {
  return {
    status,
    meters: [],
    usageCost: null,
    projectedUsageCost: null,
    details: [],
    fetchedAt: new Date().toISOString(),
    ...extra,
  };
}

function manual(id: string, missingEnv: string[]): ProviderLive {
  const dep = depById(id);
  return base("manual", {
    missingEnv,
    meters: (dep.limits ?? []).map((l) => ({ label: l.label, used: l.used, limit: l.limit, unit: l.unit, note: l.note })),
  });
}

async function getJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/** Wraps a fetcher: missing env → manual, errors → error card, success cached. */
async function guarded(id: string, env: string[], key: string, fn: () => Promise<ProviderLive>): Promise<ProviderLive> {
  const missing = env.filter((e) => !process.env[e]);
  if (missing.length) return manual(id, missing);
  try {
    return await unstable_cache(fn, ["admin-provider", key], { revalidate: TTL, tags: ["admin"] })();
  } catch (err) {
    const m = manual(id, []);
    return { ...m, status: "error", error: err instanceof Error ? err.message : "request failed" };
  }
}

// ── Tavily ───────────────────────────────────────────────────────────────
export function tavily(): Promise<ProviderLive> {
  return guarded("tavily", ["TAVILY_API_KEY"], "tavily", async () => {
    const data = (await getJson("https://api.tavily.com/usage", {
      headers: { Authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
    })) as { key?: Record<string, unknown>; account?: Record<string, unknown> };
    const acct = data.account ?? {};
    const used = num(acct.plan_usage) ?? num(data.key?.usage);
    const limit = num(acct.plan_limit) ?? num(data.key?.limit) ?? 1_000;
    const paygo = num(acct.paygo_usage) ?? 0;
    const price = depById("tavily").unitPrices!.paygoPerCredit.amount;
    return base("live", {
      plan: typeof acct.current_plan === "string" ? acct.current_plan : undefined,
      meters: [{ label: "Plan credits this cycle", used, limit, unit: "credits" }],
      usageCost: paygo * price,
      projectedUsageCost: paygo * price,
      details: [
        { label: "Pay-as-you-go credits", value: String(paygo) },
        { label: "Search credits (key)", value: String(num(data.key?.search_usage) ?? "—") },
      ],
    });
  });
}

// ── ElevenLabs ───────────────────────────────────────────────────────────
export function elevenlabs(): Promise<ProviderLive> {
  return guarded("elevenlabs", ["ELEVENLABS_API_KEY"], "elevenlabs", async () => {
    const d = (await getJson("https://api.elevenlabs.io/v1/user/subscription", {
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY as string },
    })) as Record<string, unknown>;
    const reset = num(d.next_character_count_reset_unix);
    return base("live", {
      plan: typeof d.tier === "string" ? d.tier : undefined,
      meters: [{ label: "Characters this period", used: num(d.character_count), limit: num(d.character_limit) ?? 0, unit: "chars" }],
      usageCost: 0,
      projectedUsageCost: 0,
      details: [
        ...(reset ? [{ label: "Resets", value: new Date(reset * 1000).toISOString().slice(0, 10) }] : []),
        ...(typeof d.status === "string" ? [{ label: "Status", value: d.status }] : []),
      ],
    });
  });
}

// ── Vercel ───────────────────────────────────────────────────────────────
type FocusRow = {
  BilledCost?: number;
  ChargeCategory?: string;
  ServiceName?: string;
  ConsumedQuantity?: number;
  ConsumedUnit?: string;
};

export function vercel(): Promise<ProviderLive> {
  return guarded("vercel", ["VERCEL_API_TOKEN"], "vercel", async () => {
    const { start, project } = monthWindow();
    const to = new Date(Date.now() + 86_400_000);
    const url = `https://api.vercel.com/v1/billing/charges?teamId=${VERCEL_TEAM_ID}&from=${start.toISOString()}&to=${to.toISOString().slice(0, 10)}T00:00:00.000Z`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) throw new Error(`api.vercel.com ${res.status}`);
    const text = await res.text();
    const services = new Map<string, { cost: number; qty: number; unit: string }>();
    let usage = 0;
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let row: FocusRow;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      if (row.ChargeCategory && row.ChargeCategory !== "Usage") continue;
      const name = row.ServiceName ?? "Other";
      const s = services.get(name) ?? { cost: 0, qty: 0, unit: row.ConsumedUnit ?? "" };
      s.cost += row.BilledCost ?? 0;
      s.qty += row.ConsumedQuantity ?? 0;
      services.set(name, s);
      usage += row.BilledCost ?? 0;
    }
    const find = (re: RegExp) => [...services.entries()].find(([n]) => re.test(n))?.[1];
    const transfer = find(/data transfer/i);
    const edge = find(/edge request|cdn request/i);
    // Pro includes a $20 usage credit: only usage beyond it is billed on top of the seat.
    const billed = Math.max(0, usage - 20);
    return base("live", {
      meters: [
        { label: "Usage vs $20 credit", used: usage, limit: 20, unit: "USD" },
        ...(transfer ? [{ label: "Fast data transfer", used: transfer.qty, limit: 1_000, unit: transfer.unit || "GB" }] : []),
        ...(edge ? [{ label: "Edge requests", used: edge.qty, limit: 10_000_000, unit: "requests" }] : []),
      ],
      usageCost: billed,
      projectedUsageCost: Math.max(0, project(usage) - 20),
      details: [...services.entries()]
        .sort((a, b) => b[1].cost - a[1].cost)
        .slice(0, 6)
        .map(([n, s]) => ({ label: n, value: `$${s.cost.toFixed(2)}` })),
    });
  });
}

// ── Neon ─────────────────────────────────────────────────────────────────
export function neon(): Promise<ProviderLive> {
  return guarded("neon", ["NEON_API_KEY", "NEON_PROJECT_ID"], "neon", async () => {
    const d = (await getJson(`https://console.neon.tech/api/v2/projects/${process.env.NEON_PROJECT_ID}`, {
      headers: { Authorization: `Bearer ${process.env.NEON_API_KEY}`, Accept: "application/json" },
    })) as { project?: Record<string, unknown> };
    const p = d.project ?? {};
    const prices = depById("neon").unitPrices!;
    const cuHours = (num(p.compute_time_seconds) ?? 0) / 3600;
    const activeHours = (num(p.active_time_seconds) ?? 0) / 3600;
    const gbMonthsSoFar = (num(p.data_storage_bytes_hour) ?? 0) / 1e9 / 730;
    const storageGb = (num(p.synthetic_storage_size) ?? 0) / 1e9;
    const periodStart = typeof p.consumption_period_start === "string" ? new Date(p.consumption_period_start) : monthWindow().start;
    const periodEnd = typeof p.consumption_period_end === "string" ? new Date(p.consumption_period_end) : monthWindow().next;
    const total = Math.max((periodEnd.getTime() - periodStart.getTime()) / 86_400_000, 1);
    const elapsed = Math.min(Math.max((Date.now() - periodStart.getTime()) / 86_400_000, 1 / 24), total);
    const mtd = cuHours * prices.cuHour.amount + gbMonthsSoFar * prices.storageGbMonth.amount;
    const projected =
      (cuHours / elapsed) * total * prices.cuHour.amount + storageGb * (total / 30.4) * prices.storageGbMonth.amount;
    return base("live", {
      meters: [],
      usageCost: mtd,
      projectedUsageCost: projected,
      details: [
        { label: "Compute this period", value: `${cuHours.toFixed(2)} CU-h` },
        { label: "Active time", value: `${activeHours.toFixed(1)} h` },
        { label: "Storage now", value: `${storageGb.toFixed(3)} GB` },
        { label: "Period", value: `${periodStart.toISOString().slice(0, 10)} → ${periodEnd.toISOString().slice(0, 10)}` },
      ],
    });
  });
}

// ── Cloudflare R2 ────────────────────────────────────────────────────────
/** Free operations; everything else not in CLASS_B is Class A. */
const R2_FREE = new Set(["DeleteObject", "DeleteObjects", "DeleteBucket", "AbortMultipartUpload"]);
const R2_CLASS_B = new Set([
  "HeadBucket",
  "HeadObject",
  "GetObject",
  "UsageSummary",
  "GetBucketEncryption",
  "GetBucketLocation",
  "GetBucketCors",
  "GetBucketLifecycleConfiguration",
]);

export function r2(): Promise<ProviderLive> {
  return guarded("r2", ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"], "r2", async () => {
    const { start, project } = monthWindow();
    const now = new Date();
    const query = `query R2($account: string!, $start: Time!, $end: Time!, $recent: Time!) {
      viewer { accounts(filter: { accountTag: $account }) {
        storage: r2StorageAdaptiveGroups(limit: 1000, filter: { datetime_geq: $recent, datetime_leq: $end }, orderBy: [datetime_DESC]) {
          max { payloadSize metadataSize objectCount }
          dimensions { bucketName datetime }
        }
        ops: r2OperationsAdaptiveGroups(limit: 5000, filter: { datetime_geq: $start, datetime_leq: $end }) {
          sum { requests }
          dimensions { actionType bucketName }
        }
      } }
    }`;
    const res = (await getJson("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: {
          account: process.env.CLOUDFLARE_ACCOUNT_ID,
          start: start.toISOString(),
          end: now.toISOString(),
          recent: new Date(now.getTime() - 2 * 86_400_000).toISOString(),
        },
      }),
    })) as {
      data?: { viewer?: { accounts?: { storage?: StorageRow[]; ops?: OpsRow[] }[] } };
      errors?: { message: string }[];
    };
    if (res.errors?.length) throw new Error(res.errors[0].message.slice(0, 120));
    const acct = res.data?.viewer?.accounts?.[0] ?? {};
    // Latest storage sample per bucket.
    const latest = new Map<string, number>();
    for (const row of acct.storage ?? []) {
      const b = row.dimensions.bucketName;
      if (!latest.has(b)) latest.set(b, (row.max.payloadSize ?? 0) + (row.max.metadataSize ?? 0));
    }
    const totalGb = [...latest.values()].reduce((a, b) => a + b, 0) / 1e9;
    const ourGb = (latest.get(R2_BUCKET) ?? 0) / 1e9;
    let classA = 0;
    let classB = 0;
    let ourOps = 0;
    for (const row of acct.ops ?? []) {
      const n = row.sum.requests ?? 0;
      const action = row.dimensions.actionType;
      if (row.dimensions.bucketName === R2_BUCKET) ourOps += n;
      if (R2_FREE.has(action)) continue;
      if (R2_CLASS_B.has(action)) classB += n;
      else classA += n;
    }
    const p = depById("r2").unitPrices!;
    const cost = (gb: number, a: number, b: number) =>
      Math.max(0, gb - 10) * p.storageGbMonth.amount +
      (Math.max(0, a - 1_000_000) / 1e6) * p.classAPer1M.amount +
      (Math.max(0, b - 10_000_000) / 1e6) * p.classBPer1M.amount;
    return base("live", {
      meters: [
        { label: "Storage (whole account)", used: totalGb, limit: 10, unit: "GB", note: `${R2_BUCKET}: ${ourGb.toFixed(2)} GB` },
        { label: "Class A ops (account)", used: classA, limit: 1_000_000, unit: "ops" },
        { label: "Class B ops (account)", used: classB, limit: 10_000_000, unit: "ops" },
      ],
      usageCost: cost(totalGb, classA, classB),
      projectedUsageCost: cost(totalGb, project(classA), project(classB)),
      details: [
        { label: `${R2_BUCKET} storage`, value: `${ourGb.toFixed(2)} GB` },
        { label: `${R2_BUCKET} ops this month`, value: ourOps.toLocaleString("en-US") },
      ],
    });
  });
}
type StorageRow = {
  max: { payloadSize?: number; metadataSize?: number; objectCount?: number };
  dimensions: { bucketName: string; datetime: string };
};
type OpsRow = { sum: { requests?: number }; dimensions: { actionType: string; bucketName: string } };

// ── ImprovMX ─────────────────────────────────────────────────────────────
export function improvmx(): Promise<ProviderLive> {
  return guarded("improvmx", ["IMPROVMX_API_KEY"], "improvmx", async () => {
    const auth = { Authorization: `Basic ${Buffer.from(`api:${process.env.IMPROVMX_API_KEY}`).toString("base64")}` };
    const [account, aliases] = await Promise.all([
      getJson("https://api.improvmx.com/v3/account", { headers: auth }) as Promise<Record<string, unknown>>,
      getJson("https://api.improvmx.com/v3/domains/tryambient.ai/aliases", { headers: auth }).catch(() => null) as Promise<{
        aliases?: { alias: string }[];
      } | null>,
    ]);
    // The docs show two response shapes; read whichever is present.
    const acct = (account.account ?? account) as Record<string, unknown>;
    const plan = (acct.plan ?? account.plan ?? {}) as Record<string, unknown>;
    const limits = (acct.limits ?? {}) as Record<string, unknown>;
    const aliasLimit = num(plan.aliases_limit) ?? num(limits.aliases) ?? 25;
    const daily = num(plan.daily_quota) ?? num(limits.daily_quota) ?? num(plan.daily_receive_limit) ?? 500;
    const aliasList = aliases?.aliases?.map((a) => `${a.alias}@`) ?? [];
    return base("live", {
      plan: typeof plan.display === "string" ? plan.display : typeof plan.name === "string" ? plan.name : undefined,
      meters: [
        { label: "Aliases", used: aliases ? aliasList.length : 3, limit: aliasLimit, unit: "aliases", note: aliasList.join(", ") || "hello@, sales@, legal@" },
        { label: "Forwarded emails / day (limit)", used: null, limit: daily, unit: "emails" },
      ],
      usageCost: 0,
      projectedUsageCost: 0,
      details: [],
    });
  });
}

// ── Resend ───────────────────────────────────────────────────────────────
export function resend(): Promise<ProviderLive> {
  return guarded("resend", ["RESEND_API_KEY"], "resend", async () => {
    const d = (await getJson("https://api.resend.com/usage", {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    })) as Record<string, unknown>;
    // Private-beta endpoint: read defensively.
    const emails = (d.emails ?? d) as Record<string, Record<string, unknown> | undefined>;
    const monthly = emails.monthly ?? {};
    const daily = emails.daily ?? {};
    return base("live", {
      meters: [
        { label: "Emails this month", used: num(monthly.used) ?? num(monthly.sent), limit: num(monthly.limit) ?? 3_000, unit: "emails" },
        { label: "Emails today", used: num(daily.used) ?? num(daily.sent), limit: num(daily.limit) ?? 100, unit: "emails" },
      ],
      usageCost: 0,
      projectedUsageCost: 0,
      details: [],
    });
  });
}

// ── Hugging Face (public API, no token) ──────────────────────────────────
export async function huggingface(): Promise<ProviderLive> {
  try {
    return await unstable_cache(
      async () => {
        const models = (await getJson(`https://huggingface.co/api/models?author=${HF_USER}&limit=1000`)) as { id: string }[];
        let bytes = 0;
        let measured = 0;
        // Storage per repo; small fan-out, cached for 6 hours.
        for (let i = 0; i < models.length; i += 10) {
          const batch = await Promise.all(
            models.slice(i, i + 10).map((m) =>
              getJson(`https://huggingface.co/api/models/${m.id}?expand[]=usedStorage`).catch(() => null),
            ),
          );
          for (const r of batch) {
            const used = num((r as { usedStorage?: unknown } | null)?.usedStorage);
            if (used !== null) {
              bytes += used;
              measured += 1;
            }
          }
        }
        return base("live", {
          meters: [
            { label: "Model repos", used: models.length, limit: 0, unit: "repos", note: "No cap for public repos" },
            { label: "Storage", used: bytes / 1e9, limit: 0, unit: "GB", note: `${measured}/${models.length} repos measured; best-effort, no hard cap` },
          ],
          usageCost: 0,
          projectedUsageCost: 0,
          details: [],
        });
      },
      ["admin-provider", "huggingface"],
      { revalidate: 6 * 3600, tags: ["admin"] },
    )();
  } catch (err) {
    return { ...manual("huggingface", []), status: "error", error: err instanceof Error ? err.message : "request failed" };
  }
}
