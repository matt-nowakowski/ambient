import "server-only";
import { unstable_cache } from "next/cache";
import { currentWeek, isDatabaseConfigured, usageDb } from "../db";
import type { Order } from "@polar-sh/sdk/models/components/order.js";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription.js";
import { getPolar } from "../polar";
import { ambientProductIds as sharedProductIds } from "../subscriptions";

/**
 * Business metrics for /admin, from our own database and Polar (read-only).
 * Cached briefly so reloading the page doesn't wake Neon or hit Polar each time.
 */

// ── Database ─────────────────────────────────────────────────────────────
export type UsageRow = { day: string; kind: string; plan: string; requests: number; input: number; output: number; subjects: number };
/** A paid account's usage in three windows: this month, 30 days, 90 days (retention). */
export type Consumer = {
  subject: string;
  plan: string;
  month: { ai: number; searches: number; input: number; output: number };
  d30: { ai: number; searches: number; input: number; output: number };
  d90: { ai: number; searches: number; input: number; output: number };
};

export type DbStats = {
  ok: true;
  trials: { total: number; last7: number; last30: number; month: number; perDay: { day: string; count: number }[]; perMonth: { month: string; count: number }[] };
  weeklyActiveFree: number;
  freeUsesThisWeek: number;
  /** usage_daily, last ~13 months. */
  usage: UsageRow[];
  consumers: Consumer[];
  heavyToday: { subject: string; kind: string; count: number }[];
  firstUsageDay: string | null;
};
export type DbResult = DbStats | { ok: false; error: string };

const n = (v: unknown) => Number(v ?? 0);
const d = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const win = (r: Record<string, unknown>, p: string) => ({
  ai: n(r[`${p}_ai`]),
  searches: n(r[`${p}_searches`]),
  input: n(r[`${p}_input`]),
  output: n(r[`${p}_output`]),
});

const loadDb = unstable_cache(
  async (): Promise<DbStats> => {
    const sql = await usageDb();
    const { week } = currentWeek();
    const [trials, perDay, perMonth, wam, usage, consumers, heavy, first] = await sql.transaction([
      sql`select count(*) as total,
            count(*) filter (where started_at >= now() - interval '7 days') as last7,
            count(*) filter (where started_at >= now() - interval '30 days') as last30,
            count(*) filter (where started_at >= date_trunc('month', now())) as month
          from trials`,
      sql`select date_trunc('day', started_at)::date as day, count(*) as count
          from trials where started_at >= current_date - 29 group by 1 order by 1`,
      sql`select date_trunc('month', started_at)::date as month, count(*) as count
          from trials where started_at >= date_trunc('month', now()) - interval '11 months' group by 1 order by 1`,
      sql`select count(*) as machines, coalesce(sum(count), 0) as uses from polish_usage where week = ${week}`,
      sql`select day, kind, plan, requests, input_tokens, output_tokens, subjects
          from usage_daily where day >= date_trunc('month', current_date) - interval '12 months' order by day`,
      sql`select subject, max(plan) as plan,
            sum(ai_requests) filter (where day >= date_trunc('month', current_date)) as month_ai,
            sum(searches) filter (where day >= date_trunc('month', current_date)) as month_searches,
            sum(input_tokens) filter (where day >= date_trunc('month', current_date)) as month_input,
            sum(output_tokens) filter (where day >= date_trunc('month', current_date)) as month_output,
            sum(ai_requests) filter (where day >= current_date - 29) as d30_ai,
            sum(searches) filter (where day >= current_date - 29) as d30_searches,
            sum(input_tokens) filter (where day >= current_date - 29) as d30_input,
            sum(output_tokens) filter (where day >= current_date - 29) as d30_output,
            sum(ai_requests) as d90_ai, sum(searches) as d90_searches,
            sum(input_tokens) as d90_input, sum(output_tokens) as d90_output
          from usage_subject_daily
          group by subject order by sum(input_tokens) + 2 * sum(output_tokens) desc limit 100`,
      sql`select subject, kind, count from fair_use where day = current_date order by count desc limit 10`,
      sql`select min(day) as first from usage_daily`,
    ]);
    return {
      ok: true,
      trials: {
        total: n(trials[0]?.total),
        last7: n(trials[0]?.last7),
        last30: n(trials[0]?.last30),
        month: n(trials[0]?.month),
        perDay: perDay.map((r) => ({ day: d(r.day), count: n(r.count) })),
        perMonth: perMonth.map((r) => ({ month: d(r.month).slice(0, 7), count: n(r.count) })),
      },
      weeklyActiveFree: n(wam[0]?.machines),
      freeUsesThisWeek: n(wam[0]?.uses),
      usage: usage.map((r) => ({
        day: d(r.day),
        kind: String(r.kind),
        plan: String(r.plan),
        requests: n(r.requests),
        input: n(r.input_tokens),
        output: n(r.output_tokens),
        subjects: n(r.subjects),
      })),
      consumers: consumers.map((r) => ({
        subject: String(r.subject),
        plan: String(r.plan),
        month: win(r, "month"),
        d30: win(r, "d30"),
        d90: win(r, "d90"),
      })),
      heavyToday: heavy.map((r) => ({ subject: String(r.subject), kind: String(r.kind), count: n(r.count) })),
      firstUsageDay: first[0]?.first ? d(first[0].first) : null,
    };
  },
  ["admin-db-stats-v2"],
  { revalidate: 900, tags: ["admin"] },
);

export async function getDbStats(): Promise<DbResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: "DATABASE_URL is not set" };
  try {
    return await loadDb();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 200) : "database error" };
  }
}

// ── Polar ────────────────────────────────────────────────────────────────
export type Org = {
  customerId: string;
  name: string;
  email: string | null;
  seats: number;
  status: string;
  amount: number;
  interval: string;
  since: string;
};

export type PolarStats = {
  ok: true;
  env: string;
  productIds: string[];
  activeSubscriptions: number;
  trialingSubscriptions: number;
  payingCustomers: number;
  /** Active $0 subscriptions (100% discount codes, e.g. friends and family). */
  complimentary: number;
  mrrCents: number;
  cancellingAtPeriodEnd: number;
  churned: number;
  churned30: number;
  newPaying30: number;
  byProduct: { name: string; active: number; mrrCents: number }[];
  /** Last 12 months (oldest first), cents. MRR is at each month's end (or now). */
  months: { month: string; net: number; fees: number; orders: number; mrr: number; newPaying: number }[];
  revenue30: { net: number; fees: number; orders: number };
  revenue: {
    monthNet: number;
    monthFees: number;
    monthTax: number;
    allNet: number;
    allFees: number;
    allRefunded: number;
    monthOrders: number;
    allOrders: number;
  };
  orgs: Org[];
  customers: CustomerRow[];
  /** Polar customer id → email, for top consumers (shown on expand only). */
  emails: Record<string, string>;
  currency: string;
  truncated: boolean;
};
/** One row per Ambient customer for /admin/customers (their most relevant subscription). */
export type CustomerRow = {
  customerId: string;
  name: string | null;
  email: string | null;
  plan: "pro" | "team";
  product: string;
  interval: string;
  /** active | cancelling | trialing | past_due | canceled | incomplete | unpaid | paused */
  status: string;
  since: string;
  /** Monthly-normalised, cents; 0 unless active or past_due. */
  mrrCents: number;
  /** Next renewal (live, not cancelling). */
  renewsAt: string | null;
  /** When access ends or ended. */
  endsAt: string | null;
  subscriptionId: string;
};

export type PolarResult = PolarStats | { ok: false; error: string; missingEnv?: string[] };

const MAX_PAGES = 40;

export function ambientProductIds(): string[] {
  return [...sharedProductIds()];
}

const loadPolar = unstable_cache(
  async (): Promise<PolarStats> => {
    const polar = getPolar();
    if (!polar) throw new Error("POLAR_ACCESS_TOKEN is not set");
    const productIds = ambientProductIds();
    let truncated = false;

    // The org is shared with another product: always filter by Ambient's product ids.
    const subs: Subscription[] = [];
    let pages = 0;
    for await (const page of await polar.subscriptions.list({ productId: productIds, limit: 100 }, { timeoutMs: 8_000 })) {
      subs.push(...page.result.items);
      if (++pages >= MAX_PAGES) {
        truncated = true;
        break;
      }
    }
    const orders: Order[] = [];
    pages = 0;
    for await (const page of await polar.orders.list({ productId: productIds, limit: 100 }, { timeoutMs: 8_000 })) {
      orders.push(...page.result.items);
      if (++pages >= MAX_PAGES) {
        truncated = true;
        break;
      }
    }

    const now = Date.now();
    const days30 = now - 30 * 86_400_000;
    const monthStart = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1);
    const monthly = (amount: number, interval: string, count: number) => {
      const c = count || 1;
      if (interval === "year") return amount / (12 * c);
      if (interval === "week") return (amount * 52) / (12 * c);
      if (interval === "day") return (amount * 365) / (12 * c);
      return amount / c;
    };

    // A $0 subscription (a 100% discount such as the friends-and-family code)
    // is complimentary: counted on its own, never as a paying customer or MRR.
    const isComp = (s: Subscription) => s.amount === 0;
    const active = subs.filter((s) => s.status === "active" && !isComp(s));
    const complimentary = subs.filter((s) => s.status === "active" && isComp(s));
    const trialing = subs.filter((s) => s.status === "trialing");
    const payingCustomers = new Set(active.map((s) => s.customerId));
    const mrrCents = active.reduce((sum, s) => sum + monthly(s.amount, s.recurringInterval, s.recurringIntervalCount), 0);
    const ended = subs.filter((s) => s.status === "canceled" || s.endedAt);
    const firstPaid = new Map<string, number>();
    for (const o of orders) {
      if (!o.paid || o.totalAmount === 0) continue; // $0 (complimentary) orders aren't paying
      const t = o.createdAt.getTime();
      if (!firstPaid.has(o.customerId) || t < firstPaid.get(o.customerId)!) firstPaid.set(o.customerId, t);
    }

    const byProduct = new Map<string, { name: string; active: number; mrrCents: number }>();
    for (const s of active) {
      const p = byProduct.get(s.productId) ?? { name: s.product?.name ?? s.productId, active: 0, mrrCents: 0 };
      p.active += 1;
      p.mrrCents += monthly(s.amount, s.recurringInterval, s.recurringIntervalCount);
      byProduct.set(s.productId, p);
    }

    const revenue = { monthNet: 0, monthFees: 0, monthTax: 0, allNet: 0, allFees: 0, allRefunded: 0, monthOrders: 0, allOrders: 0 };
    for (const o of orders) {
      if (!o.paid) continue;
      const net = o.netAmount - o.refundedAmount;
      revenue.allNet += net;
      revenue.allFees += o.platformFeeAmount;
      revenue.allRefunded += o.refundedAmount;
      revenue.allOrders += 1;
      if (o.createdAt.getTime() >= monthStart) {
        revenue.monthNet += net;
        revenue.monthFees += o.platformFeeAmount;
        revenue.monthTax += o.taxAmount;
        revenue.monthOrders += 1;
      }
    }

    // Orgs: team subscriptions (metadata.plan = "team", a team product, or more than one seat).
    const teamProducts = new Set((process.env.POLAR_PRODUCT_TEAM ?? "").split(",").map((x) => x.trim()).filter(Boolean));
    const orgs: Org[] = subs
      .filter((s) => s.metadata?.plan === "team" || teamProducts.has(s.productId) || (s.seats ?? 0) > 1)
      .map((s) => ({
        customerId: s.customerId,
        name: s.customer.billingName ?? s.customer.name ?? s.customer.email?.split("@")[1] ?? s.customerId,
        email: s.customer.email ?? null,
        seats: s.seats ?? 1,
        status: s.cancelAtPeriodEnd && s.status === "active" ? "cancelling" : s.status,
        amount: monthly(s.amount, s.recurringInterval, s.recurringIntervalCount),
        interval: s.recurringInterval,
        since: (s.startedAt ?? s.createdAt).toISOString().slice(0, 10),
      }));

    // Month-by-month revenue, fees and MRR (from subscription start/end dates).
    const months: PolarStats["months"] = [];
    const nowD = new Date();
    for (let i = 11; i >= 0; i--) {
      const startM = Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() - i, 1);
      const endM = Math.min(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() - i + 1, 1), now);
      const inMonth = orders.filter((o) => o.paid && o.createdAt.getTime() >= startM && o.createdAt.getTime() < endM);
      const mrrAt = subs
        .filter((s) => {
          const st = (s.startedAt ?? s.createdAt).getTime();
          const en = s.endedAt?.getTime() ?? (s.status === "canceled" ? (s.canceledAt ?? s.modifiedAt ?? s.createdAt).getTime() : Infinity);
          return s.status !== "trialing" && s.status !== "incomplete" && st < endM && en >= endM;
        })
        .reduce((sum, s) => sum + monthly(s.amount, s.recurringInterval, s.recurringIntervalCount), 0);
      months.push({
        month: new Date(startM).toISOString().slice(0, 7),
        net: inMonth.reduce((a, o) => a + o.netAmount - o.refundedAmount, 0),
        fees: inMonth.reduce((a, o) => a + o.platformFeeAmount, 0),
        orders: inMonth.length,
        mrr: mrrAt,
        newPaying: [...firstPaid.values()].filter((t) => t >= startM && t < endM).length,
      });
    }
    const last30 = orders.filter((o) => o.paid && o.createdAt.getTime() >= days30);
    const revenue30 = {
      net: last30.reduce((a, o) => a + o.netAmount - o.refundedAmount, 0),
      fees: last30.reduce((a, o) => a + o.platformFeeAmount, 0),
      orders: last30.length,
    };

    // One row per customer: a live subscription beats an ended one, then the newest.
    const rank = (s: Subscription) => (["active", "trialing", "past_due"].includes(s.status) ? 2 : 0) + (s.endedAt ? 0 : 1);
    const best = new Map<string, Subscription>();
    for (const s of subs) {
      const cur = best.get(s.customerId);
      if (!cur || rank(s) > rank(cur) || (rank(s) === rank(cur) && s.createdAt > cur.createdAt)) best.set(s.customerId, s);
    }
    const customers: CustomerRow[] = [...best.values()]
      .map((s) => {
        const live = s.status === "active" || s.status === "past_due";
        const cancelling = s.status === "active" && s.cancelAtPeriodEnd;
        return {
          customerId: s.customerId,
          name: s.customer.name ?? s.customer.billingName ?? null,
          email: s.customer.email ?? null,
          plan: s.metadata?.plan === "team" || teamProducts.has(s.productId) ? ("team" as const) : ("pro" as const),
          product: s.product?.name ?? s.productId,
          interval: s.recurringInterval,
          status: s.status === "active" && isComp(s) ? "complimentary" : cancelling ? "cancelling" : s.status,
          since: (s.startedAt ?? s.createdAt).toISOString(),
          mrrCents: live ? monthly(s.amount, s.recurringInterval, s.recurringIntervalCount) : 0,
          renewsAt: live && !cancelling ? s.currentPeriodEnd.toISOString() : null,
          endsAt: (s.endedAt ?? s.endsAt ?? (cancelling ? s.currentPeriodEnd : null))?.toISOString() ?? null,
          subscriptionId: s.id,
        };
      })
      .sort((a, b) => b.since.localeCompare(a.since));

    const emails: Record<string, string> = {};
    for (const s of subs) if (s.customer.email) emails[s.customerId] = s.customer.email;

    return {
      ok: true,
      env: process.env.POLAR_ENV === "production" ? "production" : "sandbox",
      productIds,
      activeSubscriptions: active.length,
      trialingSubscriptions: trialing.length,
      payingCustomers: payingCustomers.size,
      complimentary: new Set(complimentary.map((s) => s.customerId)).size,
      mrrCents,
      cancellingAtPeriodEnd: active.filter((s) => s.cancelAtPeriodEnd).length,
      churned: ended.length,
      churned30: ended.filter((s) => (s.endedAt ?? s.canceledAt ?? s.modifiedAt ?? s.createdAt).getTime() >= days30).length,
      newPaying30: [...firstPaid.values()].filter((t) => t >= days30).length,
      byProduct: [...byProduct.values()],
      months,
      revenue30,
      revenue,
      orgs,
      customers,
      emails,
      currency: subs[0]?.currency ?? orders[0]?.currency ?? "usd",
      truncated,
    };
  },
  ["admin-polar-stats-v3"],
  { revalidate: 900, tags: ["admin"] },
);

export async function getPolarStats(): Promise<PolarResult> {
  const missingEnv = ["POLAR_ACCESS_TOKEN", "POLAR_PRODUCT_PRO_MONTHLY", "POLAR_PRODUCT_PRO_YEARLY"].filter((e) => !process.env[e]);
  if (missingEnv.length) return { ok: false, error: "Polar is not configured", missingEnv };
  try {
    return await loadPolar();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 200) : "Polar request failed" };
  }
}
