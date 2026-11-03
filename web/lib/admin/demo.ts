import "server-only";
import { GROUPS, OTHER_DEPENDENCIES, RISKS } from "./costs";
import { monthWindow, type ProviderLive } from "./providers";
import {
  PLANS,
  buildCards,
  countDeps,
  last30Days,
  tokenCost,
  warningsFor,
  type ConsumerRow,
  type Period,
  type PlanKey,
  type Summary,
} from "./summary";

/**
 * Sample data for /admin?demo=1: a plausible six-month-old Ambient, so the
 * page can be reviewed and screenshotted before real traffic exists. Never
 * mixed with real data; the page labels it "Sample data".
 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const live = (p: Partial<ProviderLive>): ProviderLive => ({
  status: "live",
  meters: [],
  usageCost: 0,
  projectedUsageCost: 0,
  details: [],
  fetchedAt: new Date().toISOString(),
  ...p,
});

export function demoSummary(period: Period): Summary {
  const r = rng(7);
  const now = new Date();
  const win = monthWindow(now);
  const days = last30Days(now);
  const trend = (i: number, n: number) => 0.78 + 0.22 * (i / (n - 1));
  const wave = (i: number) => (new Date(days[i]).getUTCDay() % 6 === 0 ? 0.72 : 1);

  const base: Record<PlanKey, number> = { free: 2_450, trial: 860, pro: 4_150, team: 720 };
  const aiByPlan = Object.fromEntries(
    PLANS.map((p) => [p, days.map((_, i) => Math.round(base[p] * trend(i, 30) * wave(i) * (0.9 + r() * 0.2)))]),
  ) as Record<PlanKey, number[]>;
  const searches = days.map((_, i) => Math.round(68 * trend(i, 30) * wave(i) * (0.85 + r() * 0.3)));
  const billed = searches.map((s) => Math.round(s * (0.4 + r() * 0.08)));
  const installs = days.map((_, i) => Math.round(41 * trend(i, 30) * wave(i) * (0.8 + r() * 0.4)));

  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const elapsed = Math.max(1, Math.floor(win.elapsed));
  const inPeriodDays = period === "month" ? elapsed : 30;
  const scaleAll = period === "all" ? 4.1 : 1;
  const slice = (a: number[]) => a.slice(30 - inPeriodDays);

  const perReq = { input: 640, output: 150 };
  const usageByPlan = PLANS.map((plan) => {
    const requests = Math.round(sum(slice(aiByPlan[plan])) * scaleAll);
    const input = requests * perReq.input * (plan === "team" ? 1.3 : 1);
    const output = requests * perReq.output;
    const cost = tokenCost(input, output);
    const users = { free: 1_964, trial: 412, pro: 172, team: 43 }[plan];
    return { plan, requests, input, output, cost, users, perUser: cost / users };
  });
  const aiReq = sum(usageByPlan.map((u) => u.requests));
  const aiIn = sum(usageByPlan.map((u) => u.input));
  const aiOut = sum(usageByPlan.map((u) => u.output));
  const periodSearches = Math.round(sum(slice(searches)) * scaleAll);
  const periodBilled = Math.round(sum(slice(billed)) * scaleAll);

  const monthReq = PLANS.reduce((a, p) => a + sum(aiByPlan[p].slice(30 - elapsed)), 0);
  const monthAi = { requests: monthReq, input: monthReq * perReq.input, output: monthReq * perReq.output };
  const aiCostMonth = tokenCost(monthAi.input, monthAi.output);
  const tavilyMonth = sum(billed.slice(30 - elapsed));

  // Six months of growth.
  const mrrPath = [310, 640, 1_020, 1_390, 1_810, 2_168];
  const monthsBack = (i: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7);
  const revenueMonths = mrrPath.map((mrr, k) => {
    const i = mrrPath.length - 1 - k;
    const net = i === 0 ? (mrr * win.elapsed) / win.total + 290 : mrr * 0.94 + 420 * (k / 5);
    return {
      month: monthsBack(i),
      net,
      fees: net * 0.04 + (net / 11) * 0.4,
      mrr,
      newPaying: [29, 33, 41, 38, 45, 31][k],
      installs: [380, 610, 790, 960, 1_140, sum(installs.slice(30 - elapsed))][k],
    };
  });
  const cur = revenueMonths[revenueMonths.length - 1];
  const paying = 186;
  const mrr = 2_168;

  const providers: Record<string, ProviderLive> = {
    tavily: live({ plan: "researcher", meters: [{ label: "Plan credits this cycle", used: tavilyMonth, limit: 1_000, unit: "credits" }] }),
    elevenlabs: live({
      plan: "free",
      meters: [{ label: "Characters this period", used: 8_420, limit: 10_000, unit: "chars" }],
      details: [{ label: "Resets", value: monthsBack(-1) + "-01" }],
    }),
    vercel: live({
      meters: [
        { label: "Usage vs $20 credit", used: 14.2, limit: 20, unit: "USD" },
        { label: "Fast data transfer", used: 182, limit: 1_000, unit: "GB" },
        { label: "Edge requests", used: 2_310_000, limit: 10_000_000, unit: "requests" },
      ],
      usageCost: 0,
      projectedUsageCost: 4.6,
      details: [
        { label: "Fluid active CPU", value: "$6.10" },
        { label: "Fast data transfer", value: "$4.40" },
        { label: "Function invocations", value: "$2.30" },
      ],
    }),
    neon: live({
      usageCost: 2.04,
      projectedUsageCost: 3.12,
      details: [
        { label: "Compute this period", value: "17.80 CU-h" },
        { label: "Active time", value: "71.2 h" },
        { label: "Storage now", value: "0.214 GB" },
      ],
    }),
    r2: live({
      meters: [
        { label: "Storage (whole account)", used: 7.9, limit: 10, unit: "GB", note: "ambient-builds: 5.10 GB" },
        { label: "Class A ops (account)", used: 41_200, limit: 1_000_000, unit: "ops" },
        { label: "Class B ops (account)", used: 2_870_000, limit: 10_000_000, unit: "ops" },
      ],
      details: [{ label: "ambient-builds storage", value: "5.10 GB" }],
    }),
    improvmx: live({
      plan: "free",
      meters: [
        { label: "Aliases", used: 3, limit: 25, unit: "aliases", note: "hello@, sales@, legal@" },
        { label: "Forwarded emails / day (limit)", used: null, limit: 500, unit: "emails" },
      ],
    }),
    resend: live({
      meters: [
        { label: "Emails this month", used: 0, limit: 3_000, unit: "emails" },
        { label: "Emails today", used: 0, limit: 100, unit: "emails" },
      ],
    }),
    huggingface: live({
      meters: [
        { label: "Model repos", used: 74, limit: 0, unit: "repos", note: "No cap for public repos" },
        { label: "Storage", used: 2.6, limit: 0, unit: "GB", note: "Best-effort, no hard cap" },
      ],
    }),
  };

  const cards = buildCards(providers, {
    paying,
    aiCostMonth,
    aiTokens: monthAi,
    polarFeesMonth: cur.fees,
    polarProjected: mrr * 0.075,
    polarStatus: "live",
    polarDetails: [
      { label: "Fees all time", value: `$${sum(revenueMonths.map((m) => m.fees)).toFixed(2)}` },
      { label: "Effective rate", value: "5.1% of net" },
      { label: "Environment", value: "production" },
    ],
    dbOk: true,
  });
  const monthCost = cards.reduce((a, c) => a + c.monthCost, 0);
  const projectedCost = cards.reduce((a, c) => a + c.projectedCost, 0);

  const spendMonths = revenueMonths.map((m, k) => {
    const partial = k === revenueMonths.length - 1;
    const scale = m.mrr / mrr;
    return {
      month: m.month,
      fixed: 20 + 99 / 12 + 249 / 24,
      ai: partial ? win.project(aiCostMonth) : 31 * scale + 2,
      infra: partial ? 7.7 : 1.5 + 6 * scale,
      fees: partial ? mrr * 0.075 : m.fees,
      partial,
    };
  });

  const companies = ["northwind", "fieldnote", "halcyon", "tidepool", "lumen", "brightwork", "parcel", "quarry", "meridian", "oakhouse", "kestrel", "sable", "copperline", "wren", "alder"];
  const names = ["alex", "sam", "jo", "ria", "theo", "mina", "luca", "ines", "omar", "kai", "nora", "eli", "zoe", "ravi", "ada"];
  const consumers: ConsumerRow[] = companies.map((c, i) => {
    const ai = Math.round((2_900 - i * 165) * (0.9 + r() * 0.2) * (period === "all" ? 2.6 : 1));
    const s = Math.round((140 - i * 7) * (0.8 + r() * 0.4) * (period === "all" ? 2.6 : 1));
    const input = ai * 690;
    const output = ai * 160;
    return {
      subject: `cus_${(0x5f3a91 * (i + 3)).toString(36)}${Math.floor(r() * 1e6).toString(36)}`,
      plan: i % 4 === 1 ? "team" : i === 6 ? "trial" : "pro",
      email: `${names[i]}@${c}.example`,
      ai,
      searches: s,
      input,
      output,
      cost: tokenCost(input, output) + s * 0.008,
    };
  }).sort((a, b) => b.cost - a.cost);

  const ago = (months: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 9)).toISOString().slice(0, 10);
  const orgs = [
    { customerId: "cus_demo_northwind", name: "Northwind Labs", email: "ops@northwind.example", seats: 25, status: "active", amount: 200, interval: "year", since: ago(4) },
    { customerId: "cus_demo_fieldnote", name: "Fieldnote", email: "it@fieldnote.example", seats: 12, status: "active", amount: 96, interval: "year", since: ago(2) },
    { customerId: "cus_demo_halcyon", name: "Halcyon Studio", email: "hello@halcyon.example", seats: 6, status: "cancelling", amount: 48, interval: "year", since: ago(1) },
  ];

  const totalInstalls = 4_812;
  return {
    demo: true,
    period,
    generatedAt: now.toISOString(),
    sources: { db: { ok: true }, polar: { ok: true, env: "production" } },
    kpis: {
      installs: {
        total: totalInstalls,
        last7: sum(installs.slice(23)),
        last30: sum(installs),
        inPeriod: period === "month" ? sum(installs.slice(30 - elapsed)) : period === "30d" ? sum(installs) : totalInstalls,
        spark: installs,
      },
      weeklyActiveFree: 1_964,
      freeUsesThisWeek: 21_380,
      paying,
      complimentary: 6,
      trialing: 0,
      newPaying30: 31,
      mrr,
      mrrPrev: 1_810,
      mrrSpark: mrrPath,
      arr: mrr * 12,
      revenue: {
        net: period === "month" ? cur.net : period === "30d" ? 2_040 : sum(revenueMonths.map((m) => m.net)),
        fees: period === "month" ? cur.fees : period === "30d" ? 101 : sum(revenueMonths.map((m) => m.fees)),
        orders: period === "month" ? 64 : period === "30d" ? 187 : 1_046,
        allNet: sum(revenueMonths.map((m) => m.net)),
        allFees: sum(revenueMonths.map((m) => m.fees)),
      },
      conversion: 31 / sum(installs),
      churned: { total: 23, last30: 6, cancelling: 4 },
      spend: {
        month: monthCost,
        projected: projectedCost,
        perCustomer: projectedCost / paying,
        grossMargin: (mrr - projectedCost) / mrr,
        spark: spendMonths.map((m) => m.fixed + m.ai + m.infra + m.fees),
      },
      aiRequests: aiReq,
      aiSpark: days.map((_, i) => PLANS.reduce((a, p) => a + aiByPlan[p][i], 0)),
    },
    revenueMonths,
    products: [
      { name: "Pro (monthly)", active: 118, mrr: 1_416 },
      { name: "Pro (yearly)", active: 54, mrr: 486 },
      { name: "Team (yearly)", active: 3, mrr: 344 - 78 },
    ],
    usage: { days, aiByPlan, searches, billed, installs },
    usageByPlan,
    ai: {
      requests: aiReq,
      input: aiIn,
      output: aiOut,
      cost: tokenCost(aiIn, aiOut),
      searches: periodSearches,
      tavilyCalls: periodBilled,
      cacheHitRate: 1 - periodBilled / Math.max(1, periodSearches),
      costPerPaying: ((usageByPlan[2].cost + usageByPlan[3].cost) / inPeriodDays) * 30.4 / paying,
      costPerFreeActive: (usageByPlan[0].cost / inPeriodDays) * 30.4 / 1_964,
    },
    spendMonths,
    cards,
    groups: GROUPS,
    consumers,
    orgs,
    heavyToday: [{ subject: consumers[0].subject, kind: "ai", count: 412 }],
    other: OTHER_DEPENDENCIES,
    risks: RISKS,
    counts: countDeps(),
    warnings: warningsFor(cards),
    firstUsageDay: days[0],
  };
}
