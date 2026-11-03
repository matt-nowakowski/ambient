import "server-only";
import {
  DEPENDENCIES,
  GROUPS,
  OTHER_DEPENDENCIES,
  RISKS,
  SPEND_HISTORY_START,
  depById,
  monthlyFixed,
  type Dependency,
  type Group,
  type OtherDependency,
} from "./costs";
import { getDbStats, getPolarStats, type Org } from "./metrics";
import { elevenlabs, huggingface, improvmx, monthWindow, neon, r2, resend, tavily, vercel, type Meter, type ProviderLive } from "./providers";

/**
 * Everything /admin shows, in one serialisable object, built from Neon,
 * Polar and the provider APIs (or from lib/admin/demo.ts with ?demo=1).
 */
export type Period = "month" | "30d" | "all";
export const PLANS = ["free", "trial", "pro", "team"] as const;
export type PlanKey = (typeof PLANS)[number];

export type CardStatus = "live" | "manual" | "computed" | "error";
export type Level = "ok" | "approaching" | "over" | "none";

export type Card = {
  dep: Dependency;
  status: CardStatus;
  meters: (Meter & { level: Level })[];
  fixedMonthly: number;
  monthCost: number;
  projectedCost: number;
  perCustomer: number | null;
  details: { label: string; value: string }[];
  plan: string;
  error?: string;
  missingEnv?: string[];
};

export type ConsumerRow = {
  subject: string;
  plan: string;
  email: string | null;
  ai: number;
  searches: number;
  input: number;
  output: number;
  cost: number;
};

export type Summary = {
  demo: boolean;
  period: Period;
  generatedAt: string;
  sources: {
    db: { ok: boolean; error?: string };
    polar: { ok: boolean; error?: string; missingEnv?: string[]; env?: string; truncated?: boolean };
  };
  kpis: {
    installs: { total: number; last7: number; last30: number; inPeriod: number; spark: number[] };
    weeklyActiveFree: number;
    freeUsesThisWeek: number;
    paying: number;
    trialing: number;
    newPaying30: number;
    mrr: number;
    mrrPrev: number | null;
    mrrSpark: number[];
    arr: number;
    revenue: { net: number; fees: number; orders: number; allNet: number; allFees: number };
    conversion: number | null;
    churned: { total: number; last30: number; cancelling: number };
    spend: { month: number; projected: number; perCustomer: number | null; grossMargin: number | null; spark: number[] };
    aiRequests: number;
    aiSpark: number[];
  };
  revenueMonths: { month: string; net: number; fees: number; mrr: number; newPaying: number; installs: number }[];
  products: { name: string; active: number; mrr: number }[];
  usage: { days: string[]; aiByPlan: Record<PlanKey, number[]>; searches: number[]; billed: number[]; installs: number[] };
  usageByPlan: { plan: PlanKey; requests: number; input: number; output: number; cost: number; users: number | null; perUser: number | null }[];
  ai: {
    requests: number;
    input: number;
    output: number;
    cost: number;
    searches: number;
    tavilyCalls: number;
    cacheHitRate: number | null;
    costPerPaying: number | null;
    costPerFreeActive: number | null;
  };
  spendMonths: { month: string; fixed: number; ai: number; infra: number; fees: number; partial: boolean }[];
  cards: Card[];
  groups: Group[];
  consumers: ConsumerRow[];
  orgs: Org[];
  heavyToday: { subject: string; kind: string; count: number }[];
  other: OtherDependency[];
  risks: string[];
  counts: { external: number; metered: number };
  warnings: string[];
  firstUsageDay: string | null;
};

export function levelOf(m: Meter): Level {
  if (m.used === null || !(m.limit > 0)) return "none";
  const r = m.used / m.limit;
  return r >= 1 ? "over" : r >= 0.75 ? "approaching" : "ok";
}

export function tokenCost(input: number, output: number) {
  const p = depById("baseten").unitPrices!;
  return (input / 1e6) * p.inputPer1M.amount + (output / 1e6) * p.outputPer1M.amount;
}

/** The first day of each window, as YYYY-MM-DD. */
function periodStart(period: Period, now = new Date()): string {
  if (period === "month") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  if (period === "30d") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29)).toISOString().slice(0, 10);
  return "0000-00-00";
}

export function last30Days(now = new Date()): string[] {
  return Array.from({ length: 30 }, (_, i) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29 + i)).toISOString().slice(0, 10),
  );
}

/** Builds the cards from provider results; shared with the demo. */
export function buildCards(
  live: Record<string, ProviderLive>,
  ctx: { paying: number; aiCostMonth: number; aiTokens: { input: number; output: number; requests: number }; polarFeesMonth: number | null; polarProjected: number | null; polarDetails: { label: string; value: string }[]; polarStatus: CardStatus; polarError?: string; polarMissing?: string[]; dbOk: boolean; dbError?: string },
): Card[] {
  const win = monthWindow();
  const perCust = (x: number) => (ctx.paying > 0 ? x / ctx.paying : null);
  return DEPENDENCIES.map((dep): Card => {
    const fixedMonthly = monthlyFixed(dep);
    if (dep.id === "baseten") {
      const projected = win.project(ctx.aiCostMonth);
      return {
        dep,
        status: ctx.dbOk ? "computed" : "error",
        error: ctx.dbOk ? undefined : ctx.dbError,
        meters: [],
        fixedMonthly,
        monthCost: ctx.aiCostMonth,
        projectedCost: projected,
        perCustomer: perCust(projected),
        plan: dep.plan,
        details: [
          { label: "Requests this month", value: fmtInt(ctx.aiTokens.requests) },
          { label: "Input tokens", value: compact(ctx.aiTokens.input) },
          { label: "Output tokens", value: compact(ctx.aiTokens.output) },
        ],
      };
    }
    if (dep.id === "polar") {
      const fees = ctx.polarFeesMonth ?? 0;
      // Renewals don't arrive evenly, so project fees from MRR, not by extrapolating the days so far.
      const projected = Math.max(fees, ctx.polarProjected ?? 0);
      return {
        dep,
        status: ctx.polarStatus,
        error: ctx.polarError,
        missingEnv: ctx.polarMissing,
        meters: [],
        fixedMonthly: 0,
        monthCost: fees,
        projectedCost: projected,
        perCustomer: perCust(projected),
        plan: dep.plan,
        details: ctx.polarDetails,
      };
    }
    const l = live[dep.id];
    const meters = (l?.meters ?? (dep.limits ?? []).map((x) => ({ label: x.label, used: x.used, limit: x.limit, unit: x.unit, note: x.note }))).map(
      (m) => ({ ...m, level: levelOf(m) }),
    );
    const usage = l?.usageCost ?? 0;
    const projectedUsage = l?.projectedUsageCost ?? usage;
    const details = [...(l?.details ?? [])];
    if (dep.fixed?.renewsOn) {
      details.push({ label: dep.fixed.renewsOnApprox ? "Renews (approx.)" : "Renews", value: dep.fixed.renewsOn });
    }
    if (dep.fixed?.afterRenewal) {
      const after = dep.fixed.per === "year" ? dep.fixed.afterRenewal.amount / 12 : dep.fixed.afterRenewal.amount;
      details.push({ label: "After renewal", value: `${money(dep.fixed.afterRenewal.amount, 0)}/${dep.fixed.per} · ${money(after)}/mo` });
    }
    return {
      dep,
      status: l ? l.status : "manual",
      error: l?.error,
      missingEnv: l?.missingEnv,
      meters,
      fixedMonthly,
      monthCost: fixedMonthly + usage,
      projectedCost: fixedMonthly + projectedUsage,
      perCustomer: perCust(fixedMonthly + projectedUsage),
      plan: l?.plan ? `${dep.plan} (API: ${l.plan})` : dep.plan,
      details,
    };
  });
}

export function warningsFor(cards: Card[]): string[] {
  const out: string[] = [];
  for (const c of cards) {
    for (const m of c.meters) {
      if (m.level === "over") out.push(`${c.dep.name}: ${m.label.toLowerCase()} is over the limit`);
      else if (m.level === "approaching")
        out.push(`${c.dep.name}: ${m.label.toLowerCase()} at ${Math.round(((m.used ?? 0) / m.limit) * 100)}%`);
    }
    if (c.status === "error") out.push(`${c.dep.name}: ${c.error ?? "request failed"}`);
  }
  return out;
}

const INFRA = new Set(["neon", "r2", "vercel", "tavily", "elevenlabs", "resend", "improvmx", "huggingface"]);

/** Which sources a view needs. A tab that doesn't show provider cards skips the provider APIs. */
export type Need = { db?: boolean; polar?: boolean; providers?: boolean };

const skipped: { ok: false; error: string; missingEnv?: string[] } = { ok: false, error: "not loaded for this view" };
const notLoaded = async (): Promise<ProviderLive | null> => null;

export async function buildSummary(period: Period, need: Need = {}): Promise<Summary> {
  const { db: wantDb = true, polar: wantPolar = true, providers = true } = need;
  const p = (fn: () => Promise<ProviderLive>): Promise<ProviderLive | null> => (providers ? fn() : notLoaded());
  const [db, polar, tav, el, ver, ne, cf, mx, rs, hf] = await Promise.all([
    wantDb ? getDbStats() : skipped,
    wantPolar ? getPolarStats() : skipped,
    p(tavily),
    p(elevenlabs),
    p(vercel),
    p(neon),
    p(r2),
    p(improvmx),
    p(resend),
    p(huggingface),
  ]);
  const now = new Date();
  const win = monthWindow(now);
  const thisMonth = now.toISOString().slice(0, 7);
  const usage = db.ok ? db.usage : [];
  const paying = polar.ok ? polar.payingCustomers : 0;
  const perCust = (x: number) => (paying > 0 ? x / paying : null);

  // AI totals this month (cards) and in the selected period (usage section).
  const sumAi = (rows: typeof usage) => ({
    requests: rows.reduce((a, r) => a + r.requests, 0),
    input: rows.reduce((a, r) => a + r.input, 0),
    output: rows.reduce((a, r) => a + r.output, 0),
  });
  const monthAi = sumAi(usage.filter((r) => r.day.startsWith(thisMonth) && r.kind.startsWith("ai_")));
  const aiCostMonth = tokenCost(monthAi.input, monthAi.output);
  const from = periodStart(period, now);
  const inPeriod = usage.filter((r) => r.day >= from);
  const periodAi = sumAi(inPeriod.filter((r) => r.kind.startsWith("ai_")));
  const searches = inPeriod.filter((r) => r.kind === "search").reduce((a, r) => a + r.requests, 0);
  const tavilyCalls = inPeriod.filter((r) => r.kind === "search_upstream").reduce((a, r) => a + r.requests, 0);
  const tavilyMonth = usage.filter((r) => r.day.startsWith(thisMonth) && r.kind === "search_upstream").reduce((a, r) => a + r.requests, 0);

  // Tavily without a key: our own count of billed searches against the free credits.
  if (tav && tav.status !== "live") {
    tav.meters = [{ label: "Credits this month (our count)", used: db.ok ? tavilyMonth : null, limit: 1_000, unit: "credits" }];
  }

  const live = Object.fromEntries(
    Object.entries({ tavily: tav, elevenlabs: el, vercel: ver, neon: ne, r2: cf, improvmx: mx, resend: rs, huggingface: hf }).filter(
      (e): e is [string, ProviderLive] => e[1] !== null,
    ),
  );
  const polarFeesMonth = polar.ok ? polar.revenue.monthFees / 100 : null;
  const cards = buildCards(live, {
    paying,
    aiCostMonth,
    aiTokens: monthAi,
    polarFeesMonth,
    polarProjected: polar.ok
      ? (polar.mrrCents / 100) * (polar.revenue.allNet > 0 ? polar.revenue.allFees / polar.revenue.allNet : 0.08)
      : null,
    polarStatus: polar.ok ? "live" : polar.missingEnv ? "manual" : "error",
    polarError: polar.ok ? undefined : polar.error,
    polarMissing: polar.ok ? undefined : polar.missingEnv,
    polarDetails: polar.ok
      ? [
          { label: "Fees all time", value: money(polar.revenue.allFees / 100) },
          {
            label: "Effective rate",
            value: polar.revenue.allNet > 0 ? `${((polar.revenue.allFees / polar.revenue.allNet) * 100).toFixed(1)}% of net` : "—",
          },
          { label: "Environment", value: polar.env },
        ]
      : [],
    dbOk: db.ok,
    dbError: db.ok ? undefined : db.error,
  });

  const monthCost = cards.reduce((a, c) => a + c.monthCost, 0);
  const projectedCost = cards.reduce((a, c) => a + c.projectedCost, 0);
  const mrr = polar.ok ? polar.mrrCents / 100 : 0;

  // Daily series, last 30 days.
  const days = last30Days(now);
  const idx = new Map(days.map((d, i) => [d, i]));
  const zero = () => days.map(() => 0);
  const aiByPlan = Object.fromEntries(PLANS.map((p) => [p, zero()])) as Record<PlanKey, number[]>;
  const searchSeries = zero();
  const billed = zero();
  for (const r of usage) {
    const i = idx.get(r.day);
    if (i === undefined) continue;
    if (r.kind.startsWith("ai_") && (PLANS as readonly string[]).includes(r.plan)) aiByPlan[r.plan as PlanKey][i] += r.requests;
    if (r.kind === "search") searchSeries[i] += r.requests;
    if (r.kind === "search_upstream") billed[i] += r.requests;
  }
  const installs = zero();
  if (db.ok) for (const t of db.trials.perDay) if (idx.has(t.day)) installs[idx.get(t.day)!] = t.count;

  // Usage and cost per plan, in the period.
  const users: Record<PlanKey, number | null> = {
    free: db.ok ? db.weeklyActiveFree : null,
    trial: null,
    pro: polar.ok ? polar.byProduct.filter((p) => !/team/i.test(p.name)).reduce((a, p) => a + p.active, 0) : null,
    team: polar.ok ? polar.orgs.filter((o) => o.status === "active").reduce((a, o) => a + o.seats, 0) : null,
  };
  const usageByPlan = PLANS.map((plan) => {
    const t = sumAi(inPeriod.filter((r) => r.plan === plan && r.kind.startsWith("ai_")));
    const cost = tokenCost(t.input, t.output);
    const u = users[plan];
    return { plan, ...t, cost, users: u, perUser: u ? cost / u : null };
  });

  // Spend by month: fixed + AI + fees (+ metered infra, current month only).
  const revenueMonths = polar.ok ? polar.months : [];
  const spendMonths: Summary["spendMonths"] = [];
  for (let i = 11; i >= 0; i--) {
    const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = m.toISOString().slice(0, 7);
    if (key < SPEND_HISTORY_START) continue;
    const t = sumAi(usage.filter((r) => r.day.startsWith(key) && r.kind.startsWith("ai_")));
    const current = key === thisMonth;
    const fixed = DEPENDENCIES.reduce((a, dep) => a + monthlyFixed(dep, m), 0);
    const infra = current
      ? cards.filter((c) => INFRA.has(c.dep.id)).reduce((a, c) => a + (c.projectedCost - c.fixedMonthly), 0)
      : 0;
    const fees = (revenueMonths.find((r) => r.month === key)?.fees ?? 0) / 100;
    spendMonths.push({
      month: key,
      fixed,
      ai: current ? win.project(tokenCost(t.input, t.output)) : tokenCost(t.input, t.output),
      infra,
      fees: current ? (cards.find((c) => c.dep.id === "polar")?.projectedCost ?? fees) : fees,
      partial: current,
    });
  }

  const trialsPerMonth = db.ok ? db.trials.perMonth : [];
  const revenue = polar.ok
    ? period === "month"
      ? { net: polar.revenue.monthNet, fees: polar.revenue.monthFees, orders: polar.revenue.monthOrders }
      : period === "30d"
        ? polar.revenue30
        : { net: polar.revenue.allNet, fees: polar.revenue.allFees, orders: polar.revenue.allOrders }
    : { net: 0, fees: 0, orders: 0 };

  const consumers: ConsumerRow[] = (db.ok ? db.consumers : [])
    .map((c) => {
      const w = period === "month" ? c.month : period === "30d" ? c.d30 : c.d90;
      return {
        subject: c.subject,
        plan: c.plan,
        email: polar.ok ? (polar.emails[c.subject] ?? null) : null,
        ...w,
        cost: tokenCost(w.input, w.output) + w.searches * depById("tavily").unitPrices!.paygoPerCredit.amount,
      };
    })
    .filter((c) => c.ai + c.searches > 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 15);

  // Meter warnings only mean something when the providers were read.
  const warnings = providers ? warningsFor(cards) : [];
  if (polar.ok && polar.truncated) warnings.push("Polar: more than 4,000 orders or subscriptions; totals are partial");

  const mrrSpark = revenueMonths.map((r) => r.mrr / 100);
  const freeActive = db.ok ? db.weeklyActiveFree : 0;
  const paidAiCost = usageByPlan.filter((r) => r.plan === "pro" || r.plan === "team").reduce((a, r) => a + r.cost, 0);
  const freeAiCost = usageByPlan.find((r) => r.plan === "free")?.cost ?? 0;
  const periodDays = period === "month" ? win.elapsed : period === "30d" ? 30 : null;
  const toMonthly = (x: number) => (periodDays ? (x / periodDays) * 30.4 : null);

  return {
    demo: false,
    period,
    generatedAt: now.toISOString(),
    sources: {
      db: db.ok ? { ok: true } : { ok: false, error: db.error },
      polar: polar.ok
        ? { ok: true, env: polar.env, truncated: polar.truncated }
        : { ok: false, error: polar.error, missingEnv: polar.missingEnv },
    },
    kpis: {
      installs: {
        total: db.ok ? db.trials.total : 0,
        last7: db.ok ? db.trials.last7 : 0,
        last30: db.ok ? db.trials.last30 : 0,
        inPeriod: db.ok ? (period === "month" ? db.trials.month : period === "30d" ? db.trials.last30 : db.trials.total) : 0,
        spark: installs,
      },
      weeklyActiveFree: freeActive,
      freeUsesThisWeek: db.ok ? db.freeUsesThisWeek : 0,
      paying,
      trialing: polar.ok ? polar.trialingSubscriptions : 0,
      newPaying30: polar.ok ? polar.newPaying30 : 0,
      mrr,
      mrrPrev: revenueMonths.length >= 2 ? revenueMonths[revenueMonths.length - 2].mrr / 100 : null,
      mrrSpark,
      arr: mrr * 12,
      revenue: {
        net: revenue.net / 100,
        fees: revenue.fees / 100,
        orders: revenue.orders,
        allNet: polar.ok ? polar.revenue.allNet / 100 : 0,
        allFees: polar.ok ? polar.revenue.allFees / 100 : 0,
      },
      // Not a cohort: trials are anonymous machines and can't be linked to customers.
      conversion: db.ok && polar.ok && db.trials.last30 > 0 ? polar.newPaying30 / db.trials.last30 : null,
      churned: polar.ok
        ? { total: polar.churned, last30: polar.churned30, cancelling: polar.cancellingAtPeriodEnd }
        : { total: 0, last30: 0, cancelling: 0 },
      spend: {
        month: monthCost,
        projected: projectedCost,
        perCustomer: perCust(projectedCost),
        grossMargin: mrr > 0 ? (mrr - projectedCost) / mrr : null,
        spark: spendMonths.map((m) => m.fixed + m.ai + m.infra + m.fees),
      },
      aiRequests: periodAi.requests,
      aiSpark: days.map((_, i) => PLANS.reduce((a, p) => a + aiByPlan[p][i], 0)),
    },
    revenueMonths: revenueMonths.map((r) => ({
      month: r.month,
      net: r.net / 100,
      fees: r.fees / 100,
      mrr: r.mrr / 100,
      newPaying: r.newPaying,
      installs: trialsPerMonth.find((t) => t.month === r.month)?.count ?? 0,
    })),
    products: polar.ok ? polar.byProduct.map((p) => ({ name: p.name, active: p.active, mrr: p.mrrCents / 100 })) : [],
    usage: { days, aiByPlan, searches: searchSeries, billed, installs },
    usageByPlan,
    ai: {
      ...periodAi,
      cost: tokenCost(periodAi.input, periodAi.output),
      searches,
      tavilyCalls,
      cacheHitRate: searches > 0 ? Math.max(0, 1 - tavilyCalls / searches) : null,
      costPerPaying: paying > 0 && toMonthly(paidAiCost) !== null ? toMonthly(paidAiCost)! / paying : null,
      costPerFreeActive: freeActive > 0 && toMonthly(freeAiCost) !== null ? toMonthly(freeAiCost)! / freeActive : null,
    },
    spendMonths,
    cards,
    groups: GROUPS,
    consumers,
    orgs: polar.ok ? polar.orgs : [],
    heavyToday: db.ok ? db.heavyToday : [],
    other: OTHER_DEPENDENCIES,
    risks: RISKS,
    counts: countDeps(),
    warnings,
    firstUsageDay: db.ok ? db.firstUsageDay : null,
  };
}

export function countDeps() {
  return {
    external: DEPENDENCIES.length + OTHER_DEPENDENCIES.length,
    metered: DEPENDENCIES.filter((d) => (d.fixed && d.fixed.price.amount > 0) || d.unitPrices).length,
  };
}

export function money(v: number, digits = 2) {
  // Sub-cent costs (a few thousand tokens) would round to $0.00 and read as
  // "free": show two significant digits instead, e.g. $0.0034.
  if (digits > 0 && v !== 0 && Math.abs(v) < 10 ** -digits) {
    return `$${v.toLocaleString("en-US", { maximumSignificantDigits: 2 })}`;
  }
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
export function fmtInt(v: number) {
  return Math.round(v).toLocaleString("en-US");
}
export function compact(v: number) {
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
}
