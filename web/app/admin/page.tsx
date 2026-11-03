import Link from "next/link";
import type { ReactNode } from "react";
import { AdminHeader, BrandMark } from "@/components/admin/chrome";
import { AgentHealth } from "@/components/admin/agent-health";
import FeedbackTab from "@/components/admin/feedback-inbox";
import { openFeedbackCount } from "@/lib/admin/feedback";
import { CountUp, LineChart, Meter, Sparkline, StackedBars } from "@/components/admin/viz";
import { format, type Fmt } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/admin/guard";
import { demoSummary } from "@/lib/admin/demo";
import { buildSummary, compact, fmtInt, money, type Card, type Need, type Period, type PlanKey, type Summary } from "@/lib/admin/summary";
import { adminTabHref, parseTab, type DashboardTab } from "@/lib/admin/tabs";

export const dynamic = "force-dynamic";

const PERIODS: { id: Period; label: string }[] = [
  { id: "month", label: "This month" },
  { id: "30d", label: "Last 30 days" },
  { id: "all", label: "All time" },
];
const PERIOD_NOUN: Record<Period, string> = { month: "this month", "30d": "in the last 30 days", all: "all time" };

/**
 * What each tab reads. Every source is cached for 15 minutes (unstable_cache),
 * so this only decides what a cold tab is allowed to wake up: Orgs reads Polar
 * alone, Revenue and Usage skip the eight provider APIs, and only the tabs
 * that show spend or provider cards call them.
 */
const NEEDS: Record<DashboardTab, Need> = {
  overview: { db: true, polar: true, providers: true },
  revenue: { db: true, polar: true, providers: false },
  usage: { db: true, polar: true, providers: false },
  costs: { db: true, polar: true, providers: true },
  dependencies: { db: true, polar: true, providers: true },
  orgs: { db: false, polar: true, providers: false },
  // Read their own data (lib/admin/agent-health.ts, lib/admin/feedback.ts).
  agent: { db: false, polar: false, providers: false },
  feedback: { db: false, polar: false, providers: false },
};

/** Tabs whose numbers change with the period; the others hide the switch. */
const PERIODIC = new Set<DashboardTab>(["overview", "revenue", "usage"]);

const TITLES: Record<DashboardTab, string> = {
  overview: "Ambient Admin",
  revenue: "Revenue",
  usage: "Users and usage",
  costs: "Costs and margins",
  dependencies: "Dependencies",
  orgs: "Organizations",
  agent: "Agent health",
  feedback: "Feedback",
};

const PLAN_STYLE: Record<PlanKey, { name: string; color: string }> = {
  team: { name: "Team", color: "var(--a-s1)" },
  pro: { name: "Pro", color: "var(--a-s2)" },
  trial: { name: "Trial", color: "var(--a-s3)" },
  free: { name: "Free", color: "var(--a-s4)" },
};

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
const monthLong = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tab = parseTab((await searchParams).tab);
  return { title: tab === "overview" ? "Admin" : `${TITLES[tab]} · Admin` };
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const email = await requireAdmin();
  const sp = await searchParams;
  const tab = parseTab(sp.tab);
  const period: Period = sp.period === "30d" || sp.period === "all" ? sp.period : "month";
  const demo = sp.demo === "1";
  const [s, openFeedback] = await Promise.all([
    demo ? demoSummary(period) : buildSummary(period, NEEDS[tab]),
    tab === "overview" ? openFeedbackCount(demo) : null,
  ]);
  const href = (t: DashboardTab, p: Period = period) => adminTabHref(t, { period: p, demo });
  const updated = new Date(s.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

  return (
    <div data-admin-root className="admin px-3 py-3 sm:px-4 sm:py-4">
      <div className="admin-window glass mx-auto max-w-[1360px] px-5 pb-10 pt-4 sm:px-8">
        <AdminHeader
          email={email}
          demo={s.demo}
          title="Ambient Admin"
          meta={`Updated ${updated} UTC`}
          tab={tab}
          period={period}
          refreshTitle="Refetch Polar, Neon and provider data"
        >
          {PERIODIC.has(tab) ? (
            <nav className="admin-seg" aria-label="Period">
              {PERIODS.map((p) => (
                <Link key={p.id} href={href(tab, p.id)} prefetch={false} aria-current={s.period === p.id ? "page" : undefined}>
                  {p.label}
                </Link>
              ))}
            </nav>
          ) : null}
        </AdminHeader>
        {s.demo ? (
          <p className="mt-3 rounded-[var(--radius-control)] bg-[var(--a-warning-wash)] px-3 py-2 text-[12px] text-[var(--a-warning)]">
            Sample data. Every number on this page is made up for review and screenshots.{" "}
            <Link href={adminTabHref(tab, { period })} className="underline underline-offset-2">
              Show real data
            </Link>
          </p>
        ) : null}
        {s.warnings.length ? <Warnings items={s.warnings} /> : null}

        {tab === "overview" ? <Overview s={s} href={href} /> : null}
        {tab === "overview" && openFeedback !== null ? (
          <p className="mt-3">
            <Link href={href("feedback")} prefetch={false} className="admin-pill" data-tone={openFeedback > 0 ? "warning" : "moss"}>
              {openFeedback === 1 ? "1 open feedback item" : `${fmtInt(openFeedback)} open feedback items`} →
            </Link>
          </p>
        ) : null}

        {tab === "agent" ? <AgentHealth demo={demo} /> : null}
        {tab === "feedback" ? <FeedbackTab demo={demo} searchParams={sp} /> : null}

        {tab === "revenue" ? (
          <Section id="revenue" title="Revenue" sub={s.sources.polar.ok ? `Polar ${s.sources.polar.env}, Ambient products only` : undefined}>
            <Revenue s={s} />
          </Section>
        ) : null}

        {tab === "usage" ? (
          <>
            <Section id="usage" title="Users and usage" sub="Hosted AI and search, counted by our servers">
              <Usage s={s} />
            </Section>
            <Section id="consumers" title="Top consumers" sub={`Paid accounts by what they cost us, ${PERIOD_NOUN[period]}`}>
              <Consumers s={s} />
            </Section>
          </>
        ) : null}

        {tab === "costs" ? (
          <Section id="costs" title="Costs and margins" sub={`Spend for ${monthLong(new Date().toISOString().slice(0, 7))}, projected to month end`}>
            <Costs s={s} depHref={(id) => `${href("dependencies")}#dep-${id}`} />
          </Section>
        ) : null}

        {tab === "dependencies" ? (
          <>
            <Section id="dependencies" title="Dependencies" sub={`${s.counts.external} external dependencies, ${s.counts.metered} paid or metered`}>
              <Dependencies s={s} />
            </Section>
            <Section id="other" title="Other dependencies" sub="Free libraries, frameworks and tools">
              <OtherDeps s={s} />
            </Section>
            <Section id="risks" title="Risks">
              <Risks risks={s.risks} />
            </Section>
          </>
        ) : null}

        {tab === "orgs" ? (
          <Section id="orgs" title="Organizations" sub="Team subscriptions and multi-seat customers">
            <Orgs s={s} />
          </Section>
        ) : null}

        <Footnotes s={s} tab={tab} />
      </div>
    </div>
  );
}

// ── Overview: the headline numbers and one chart per area ────────────────
function Overview({ s, href }: { s: Summary; href: (t: DashboardTab) => string }) {
  const plans: PlanKey[] = ["free", "trial", "pro", "team"];
  const months = activeMonths(s);
  return (
    <>
      <Kpis s={s} />
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-3">
        <Panel title="Monthly recurring revenue" meta={<More href={href("revenue")}>Revenue</More>}>
          {!s.sources.polar.ok ? (
            <SourceError what="Polar" error={s.sources.polar.error} missing={s.sources.polar.missingEnv} />
          ) : months.some((m) => m.mrr > 0) ? (
            <LineChart labels={months.map((m) => monthLabel(m.month))} values={months.map((m) => m.mrr)} name="MRR" fmt="money0" height={170} />
          ) : (
            <Empty>No active Ambient subscriptions yet.</Empty>
          )}
        </Panel>
        <Panel title="AI requests per day" meta={<More href={href("usage")}>Usage</More>}>
          {!s.sources.db.ok ? (
            <SourceError what="The database" error={s.sources.db.error} />
          ) : plans.some((p) => s.usage.aiByPlan[p].some((v) => v > 0)) ? (
            <StackedBars
              labels={s.usage.days.map(dayLabel)}
              series={plans.map((p) => ({ name: PLAN_STYLE[p].name, values: s.usage.aiByPlan[p], color: PLAN_STYLE[p].color }))}
              height={170}
            />
          ) : (
            <Empty>No hosted AI requests recorded yet.</Empty>
          )}
        </Panel>
        <Panel title="Spend by month" meta={<More href={href("costs")}>Costs</More>}>
          <SpendChart s={s} height={170} />
        </Panel>
      </div>
    </>
  );
}

function More({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} prefetch={false} className="hover:text-[var(--a-ink)]">
      {children} →
    </Link>
  );
}

function Risks({ risks }: { risks: string[] }) {
  return (
    <ul className="admin-panel divide-y divide-[var(--a-line)] px-4">
      {risks.map((r) => (
        <li key={r} className="flex gap-3 py-2.5">
          <span className="admin-pill" data-tone="warning">
            Risk
          </span>
          <span className="ink-2">{r}</span>
        </li>
      ))}
    </ul>
  );
}

function Warnings({ items }: { items: string[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.slice(0, 8).map((w) => (
        <span key={w} className="admin-pill" data-tone={/over the limit|error|failed|\d{3}/i.test(w) ? "error" : "warning"}>
          {w}
        </span>
      ))}
    </div>
  );
}

// ── KPI strip ────────────────────────────────────────────────────────────
function Kpis({ s }: { s: Summary }) {
  const k = s.kpis;
  const mrrDelta = k.mrrPrev && k.mrrPrev > 0 ? (k.mrr - k.mrrPrev) / k.mrrPrev : null;
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Kpi label="Installs" value={k.installs.inPeriod} fmt="int" spark={k.installs.spark} foot={`${fmtInt(k.installs.total)} all time · ${fmtInt(k.installs.last7)} in 7 days`} />
      <Kpi label="Weekly active (Free)" value={k.weeklyActiveFree} fmt="int" foot={`${fmtInt(k.freeUsesThisWeek)} AI uses this week`} spark={s.usage.aiByPlan.free} />
      <Kpi
        label="Paying customers"
        value={k.paying}
        fmt="int"
        foot={`${k.newPaying30} new in 30 days · ${k.churned.cancelling} cancelling`}
        spark={s.revenueMonths.map((m) => m.newPaying)}
      />
      <Kpi
        label="MRR"
        value={k.mrr}
        fmt="money0"
        delta={mrrDelta}
        foot={`ARR ${format(k.arr, "money0")}`}
        spark={k.mrrSpark}
      />
      <Kpi
        label={`Net revenue, ${PERIOD_NOUN[s.period]}`}
        value={k.revenue.net - k.revenue.fees}
        fmt="money0"
        foot={`${format(k.revenue.net, "money0")} before ${format(k.revenue.fees, "money0")} Polar fees`}
        spark={s.revenueMonths.map((m) => m.net - m.fees)}
      />
      <Kpi
        label="Spend, projected month"
        value={k.spend.projected}
        fmt="money0"
        foot={
          k.spend.grossMargin !== null
            ? `${format(k.spend.grossMargin, "pct")} gross margin · ${k.spend.perCustomer !== null ? format(k.spend.perCustomer, "money") : "—"}/customer`
            : `${format(k.spend.month, "money")} so far`
        }
        spark={k.spend.spark}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  fmt,
  foot,
  spark,
  delta,
}: {
  label: string;
  value: number;
  fmt: Fmt;
  foot: string;
  spark?: number[];
  delta?: number | null;
}) {
  return (
    <div className="admin-panel flex min-w-0 flex-col justify-between gap-2 overflow-hidden px-4 pb-3 pt-3.5">
      <div className="flex items-start justify-between gap-2">
        <span className="admin-label min-w-0 [overflow-wrap:anywhere]">{label}</span>
        {delta !== undefined && delta !== null ? (
          <span className="shrink-0 whitespace-nowrap text-[11px]" style={{ color: delta >= 0 ? "var(--a-moss)" : "var(--a-error)" }}>
            {delta >= 0 ? "↑" : "↓"} {format(Math.abs(delta), "pct")}
          </span>
        ) : null}
      </div>
      {/* A narrow card (phones, the 3- and 6-column grids at their tightest) puts the sparkline on its own
          full-width row under the number; a card with room sets it beside the number. */}
      <div className="@container min-w-0">
        <div className="flex min-w-0 flex-col gap-1.5 @[232px]:flex-row @[232px]:items-end @[232px]:justify-between @[232px]:gap-2">
          <CountUp value={value} fmt={fmt} className="admin-figure min-w-0" />
          {spark ? (
            <div className="min-w-0 overflow-hidden text-[var(--a-ink-2)] @[232px]:mb-1 @[232px]:w-[84px] @[232px]:shrink-0">
              <Sparkline values={spark} width={84} height={30} fluid />
            </div>
          ) : null}
        </div>
      </div>
      <span className="admin-meta">{foot}</span>
    </div>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────
function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mt-10 first-of-type:mt-7">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${id}-h`} className="admin-section-title">
          {title}
        </h2>
        {sub ? <span className="admin-meta">{sub}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Panel({ title, meta, children, className = "" }: { title?: string; meta?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`admin-panel px-4 py-3.5 ${className}`}>
      {title ? (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="admin-label">{title}</span>
          {meta ? <span className="admin-meta">{meta}</span> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-[var(--radius-control)] border border-dashed border-[var(--a-line-strong)] px-4 py-6 text-center">
      <BrandMark size={20} className="opacity-50" id="am-empty" />
      <p className="ink-3 max-w-sm text-[12px]">{children}</p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--a-line)] py-2 last:border-0">
      <span className="ink-2">{label}</span>
      <span className="text-right">
        {value}
        {hint ? <span className="admin-meta ml-1.5">{hint}</span> : null}
      </span>
    </div>
  );
}

function SourceError({ what, error, missing }: { what: string; error?: string; missing?: string[] }) {
  return (
    <Empty>
      {missing?.length
        ? `${what} isn't connected. Set ${missing.join(", ")} in Vercel.`
        : `${what} couldn't be read${error ? `: ${error}` : ""}.`}
    </Empty>
  );
}

// ── Revenue ──────────────────────────────────────────────────────────────
/** Months from the first with revenue (at least the last three). */
const activeMonths = (s: Summary) =>
  s.revenueMonths.filter((m, i) => i >= s.revenueMonths.findIndex((x) => x.mrr > 0 || x.net > 0) || i >= s.revenueMonths.length - 3);

function Revenue({ s }: { s: Summary }) {
  if (!s.sources.polar.ok) {
    return <SourceError what="Polar" error={s.sources.polar.error} missing={s.sources.polar.missingEnv} />;
  }
  const months = activeMonths(s);
  const k = s.kpis;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      {/* Two columns that end together: MRR over products on the left, monthly net over the stats on the right. */}
      <div className="flex flex-col gap-3">
        <Panel title="Monthly recurring revenue" meta="At each month's end">
          {months.some((m) => m.mrr > 0) ? (
            <LineChart labels={months.map((m) => monthLabel(m.month))} values={months.map((m) => m.mrr)} name="MRR" fmt="money0" height={190} />
          ) : (
            <Empty>No active Ambient subscriptions yet. MRR appears here after the first checkout.</Empty>
          )}
        </Panel>
        {s.products.length ? (
          <div className="admin-panel flex-1">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">Active</th>
                    <th className="num">MRR</th>
                    <th className="num">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {s.products.map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td className="num">{fmtInt(p.active)}</td>
                      <td className="num">{money(p.mrr, 0)}</td>
                      <td className="num">{k.mrr > 0 ? format(p.mrr / k.mrr, "pct") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-3">
        <Panel title="Net revenue by month" meta="After discounts and refunds, before fees">
          {months.some((m) => m.net > 0) ? (
            <StackedBars
              labels={months.map((m) => monthLabel(m.month))}
              tipLabels={months.map((m) => monthLong(m.month))}
              series={[
                { name: "Polar fees", values: months.map((m) => m.fees), color: "var(--a-s3)" },
                { name: "Kept", values: months.map((m) => Math.max(0, m.net - m.fees)), color: "var(--a-s1)" },
              ]}
              fmt="money"
              height={140}
              hatchLast
            />
          ) : (
            <Empty>No paid orders yet.</Empty>
          )}
        </Panel>
        <Panel className="flex-1">
          <Stat label="ARR" value={money(k.arr, 0)} />
          <Stat label="Revenue all time" value={money(k.revenue.allNet, 0)} hint={`${money(k.revenue.allFees, 0)} fees`} />
          <Stat label={`Orders, ${PERIOD_NOUN[s.period]}`} value={fmtInt(k.revenue.orders)} />
          <Stat
            label="Trial → paid (30 days)"
            value={k.conversion !== null ? format(k.conversion, "pct1") : "—"}
            hint="new customers ÷ trials started"
          />
          <Stat label="Churned subscriptions" value={fmtInt(k.churned.total)} hint={`${k.churned.last30} in 30 days`} />
        </Panel>
      </div>
    </div>
  );
}

// ── Usage ────────────────────────────────────────────────────────────────
function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {items.map((i) => (
        <span key={i.name} className="admin-meta flex items-center gap-1.5">
          <span className="admin-swatch" style={{ background: i.color }} />
          {i.name}
        </span>
      ))}
    </div>
  );
}

function Usage({ s }: { s: Summary }) {
  if (!s.sources.db.ok) return <SourceError what="The database" error={s.sources.db.error} />;
  const plans: PlanKey[] = ["free", "trial", "pro", "team"];
  const hasAi = plans.some((p) => s.usage.aiByPlan[p].some((v) => v > 0));
  const hasSearch = s.usage.searches.some((v) => v > 0);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="AI requests per day, by plan" meta={<Legend items={[...plans].reverse().map((p) => PLAN_STYLE[p])} />}>
          {hasAi ? (
            <StackedBars
              labels={s.usage.days.map(dayLabel)}
              series={plans.map((p) => ({ name: PLAN_STYLE[p].name, values: s.usage.aiByPlan[p], color: PLAN_STYLE[p].color }))}
              height={200}
            />
          ) : (
            <Empty>
              No hosted AI requests recorded yet. Counts flush to Neon at most every 10 minutes per server
              {s.firstUsageDay ? "" : ", starting with this release"}.
            </Empty>
          )}
        </Panel>
        <Panel
          title="Web searches per day"
          meta={
            <Legend
              items={[
                { name: "Billed (Tavily)", color: "var(--a-s1)" },
                { name: "From cache", color: "var(--a-s4)" },
              ]}
            />
          }
        >
          {hasSearch ? (
            <StackedBars
              labels={s.usage.days.map(dayLabel)}
              series={[
                { name: "Billed (Tavily)", values: s.usage.billed, color: "var(--a-s1)" },
                { name: "From cache", values: s.usage.searches.map((v, i) => Math.max(0, v - s.usage.billed[i])), color: "var(--a-s4)" },
              ]}
              height={200}
            />
          ) : (
            <Empty>No searches recorded yet.</Empty>
          )}
        </Panel>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="admin-panel">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th className="num">Requests</th>
                  <th className="num">Input tokens</th>
                  <th className="num">Output tokens</th>
                  <th className="num">Model cost</th>
                  <th className="num">Users</th>
                  <th className="num">Cost per user</th>
                </tr>
              </thead>
              <tbody>
                {[...s.usageByPlan].reverse().map((u) => (
                  <tr key={u.plan}>
                    <td>
                      <span className="flex items-center gap-2">
                        <span className="admin-swatch" style={{ background: PLAN_STYLE[u.plan].color }} />
                        {PLAN_STYLE[u.plan].name}
                      </span>
                    </td>
                    <td className="num">{fmtInt(u.requests)}</td>
                    <td className="num">{compact(u.input)}</td>
                    <td className="num">{compact(u.output)}</td>
                    <td className="num">{money(u.cost)}</td>
                    <td className="num">{u.users !== null ? fmtInt(u.users) : "—"}</td>
                    <td className="num">{u.perUser !== null ? money(u.perUser, 3) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <Panel>
          <Stat label={`AI requests, ${PERIOD_NOUN[s.period]}`} value={fmtInt(s.ai.requests)} />
          <Stat label="Model cost" value={money(s.ai.cost)} hint="Baseten, from token counts" />
          <Stat label="Searches" value={fmtInt(s.ai.searches)} hint={`${fmtInt(s.ai.tavilyCalls)} billed`} />
          <Stat label="Search cache hit rate" value={s.ai.cacheHitRate !== null ? format(s.ai.cacheHitRate, "pct") : "—"} />
          <Stat label="AI cost per paying customer" value={s.ai.costPerPaying !== null ? money(s.ai.costPerPaying) : "—"} hint="per month" />
          <Stat label="AI cost per active Free user" value={s.ai.costPerFreeActive !== null ? money(s.ai.costPerFreeActive, 3) : "—"} hint="per month" />
        </Panel>
      </div>
    </div>
  );
}

// ── Costs ────────────────────────────────────────────────────────────────
const SPEND_SERIES = [
  { key: "fixed", name: "Subscriptions", color: "var(--a-s4)" },
  { key: "infra", name: "Hosting and data", color: "var(--a-s3)" },
  { key: "fees", name: "Payment fees", color: "var(--a-s2)" },
  { key: "ai", name: "AI and search", color: "var(--a-s1)" },
] as const;

function SpendChart({ s, height }: { s: Summary; height: number }) {
  return (
    <StackedBars
      labels={s.spendMonths.map((m) => monthLabel(m.month))}
      tipLabels={s.spendMonths.map((m) => `${monthLong(m.month)}${m.partial ? " (projected)" : ""}`)}
      series={SPEND_SERIES.map((x) => ({ name: x.name, color: x.color, values: s.spendMonths.map((m) => m[x.key]) }))}
      fmt="money"
      height={height}
      hatchLast
    />
  );
}

function Costs({ s, depHref }: { s: Summary; depHref: (id: string) => string }) {
  const rows = [...s.cards].sort((a, b) => b.projectedCost - a.projectedCost);
  const k = s.kpis.spend;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <Panel title="Spend by month" meta={<Legend items={[...SPEND_SERIES].reverse()} />}>
          <SpendChart s={s} height={190} />
        </Panel>
        <Panel>
          <Stat label="Spent so far this month" value={money(k.month)} />
          <Stat label="Projected month" value={money(k.projected)} />
          <Stat label="Per paying customer" value={k.perCustomer !== null ? money(k.perCustomer) : "—"} hint="projected" />
          <Stat label="Gross margin" value={k.grossMargin !== null ? format(k.grossMargin, "pct1") : "—"} hint="(MRR − projected spend) ÷ MRR" />
        </Panel>
      </div>
      <div className="admin-panel">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th className="num">So far</th>
                <th className="num">Projected</th>
                <th className="num">Per customer</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.dep.id}>
                  <td>
                    <Link href={depHref(c.dep.id)} prefetch={false} className="hover:underline">
                      {c.dep.name}
                    </Link>
                  </td>
                  <td className="num">{money(c.monthCost)}</td>
                  <td className="num">{money(c.projectedCost)}</td>
                  <td className="num">{c.perCustomer !== null ? money(c.perCustomer, 3) : "—"}</td>
                  <td>
                    <StatusPill c={c} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ c }: { c: Card }) {
  const unconfirmed = isUnconfirmed(c);
  if (c.status === "error") return <span className="admin-pill" data-tone="error">Error</span>;
  if (c.status === "live") return <span className="admin-pill" data-tone="moss">Live</span>;
  if (c.status === "computed") return <span className="admin-pill">Computed</span>;
  return <span className="admin-pill">{unconfirmed ? "Estimate" : "Manual"}</span>;
}

function isUnconfirmed(c: Card) {
  return (
    !c.dep.planConfirmed ||
    (c.dep.fixed ? !c.dep.fixed.price.confirmed : false) ||
    Object.values(c.dep.unitPrices ?? {}).some((p) => !p.confirmed)
  );
}

// ── Dependencies ─────────────────────────────────────────────────────────
function Dependencies({ s }: { s: Summary }) {
  return (
    <div className="grid gap-8">
      {s.groups.map((g) => {
        const cards = s.cards.filter((c) => c.dep.group === g);
        if (!cards.length) return null;
        return (
          <div key={g}>
            <h3 className="admin-label mb-2.5">{g}</h3>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-3">
              {cards.map((c) => (
                <DepCard key={c.dep.id} c={c} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DepCard({ c }: { c: Card }) {
  const worst = c.meters.some((m) => m.level === "over") ? "over" : c.meters.some((m) => m.level === "approaching") ? "approaching" : null;
  const prices = Object.entries(c.dep.unitPrices ?? {});
  return (
    <article id={`dep-${c.dep.id}`} className="admin-panel flex flex-col gap-3 px-4 py-3.5">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-[14px] font-[450]">{c.dep.name}</h4>
          <p className="admin-meta mt-0.5">{c.plan}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {worst ? (
            <span className="admin-pill" data-tone={worst === "over" ? "error" : "warning"}>
              {worst === "over" ? "Over" : "Approaching"}
            </span>
          ) : null}
          <StatusPill c={c} />
        </div>
      </header>
      <p className="ink-2 text-[12.5px] leading-[18px]">{c.dep.purpose}</p>

      {c.meters.length ? (
        <div className="grid gap-2.5">
          {c.meters.map((m) => (
            <div key={m.label}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-[12px]">
                <span className="ink-2">{m.label}</span>
                <span>
                  {m.used === null ? "—" : fmtUnit(m.used, m.unit)}
                  {m.limit > 0 ? <span className="ink-3"> / {fmtUnit(m.limit, m.unit)}</span> : null}
                </span>
              </div>
              {m.limit > 0 ? <Meter used={m.used} limit={m.limit} level={m.level} /> : null}
              {m.note ? <p className="admin-meta mt-1">{m.note}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2 border-t border-[var(--a-line)] pt-3">
        <Mini label="This month" value={money(c.monthCost)} />
        <Mini label="Projected" value={money(c.projectedCost)} />
        <Mini label="Per customer" value={c.perCustomer !== null ? money(c.perCustomer, 3) : "—"} />
      </div>

      {c.details.length ? (
        <dl className="grid gap-1 text-[12px]">
          {c.details.map((d) => (
            <div key={d.label} className="flex justify-between gap-3">
              <dt className="ink-3">{d.label}</dt>
              <dd className="text-right">{d.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {c.status === "error" && c.error ? <p className="text-[12px] text-[var(--a-error)]">{c.error}</p> : null}
      {c.missingEnv?.length ? (
        <p className="admin-meta">
          Manual values. Set {c.missingEnv.join(" + ")} to make it live.
          {c.dep.keyHowTo ? ` ${c.dep.keyHowTo}` : ""}
        </p>
      ) : null}
      {c.dep.shared ? <p className="admin-meta">Shared: {c.dep.shared}</p> : null}

      {prices.length || c.dep.fixed || c.dep.notes?.length ? (
        <details className="text-[12px]">
          <summary className="admin-meta hover:text-[var(--a-ink-2)]">Prices and sources</summary>
          <div className="mt-2 grid gap-1">
            {c.dep.fixed ? (
              <PriceRow
                label={`Fixed, per ${c.dep.fixed.per}`}
                amount={money(c.dep.fixed.price.amount)}
                confirmed={c.dep.fixed.price.confirmed}
                source={c.dep.fixed.price.source}
              />
            ) : null}
            {prices.map(([k, p]) => (
              <PriceRow key={k} label={k} amount={p.amount < 1 && !k.toLowerCase().includes("percent") ? `$${p.amount}` : k.toLowerCase().includes("percent") ? `${(p.amount * 100).toFixed(1)}%` : money(p.amount)} confirmed={p.confirmed} source={p.source} note={p.note} />
            ))}
            {c.dep.notes?.map((n) => (
              <p key={n} className="ink-3">
                {n}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}

function PriceRow({ label, amount, confirmed, source, note }: { label: string; amount: string; confirmed: boolean; source: string; note?: string }) {
  const href = source.startsWith("http") ? source : null;
  return (
    <div>
      <div className="flex justify-between gap-2">
        <span className="ink-2">{label}</span>
        <span>
          {amount} {confirmed ? null : <span className="admin-pill ml-1" data-tone="warning">unconfirmed</span>}
        </span>
      </div>
      <div className="admin-meta">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="underline decoration-[var(--a-line-strong)] underline-offset-2">
            {new URL(href).host}
          </a>
        ) : (
          source
        )}
        {note ? ` · ${note}` : ""}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="admin-meta">{label}</div>
      <div className="text-[13px]">{value}</div>
    </div>
  );
}

function fmtUnit(v: number, unit: string) {
  if (unit === "USD") return money(v);
  if (unit === "GB") return `${v.toFixed(v < 10 ? 2 : 1)} GB`;
  return `${v >= 100_000 ? compact(v) : fmtInt(v)} ${unit}`;
}

// ── Orgs and consumers ───────────────────────────────────────────────────
function Orgs({ s }: { s: Summary }) {
  if (!s.sources.polar.ok) return <SourceError what="Polar" error={s.sources.polar.error} missing={s.sources.polar.missingEnv} />;
  if (!s.orgs.length) {
    return (
      <Empty>
        No team customers yet. Team deals are created by hand in Polar: set metadata plan = team on the subscription, or
        put the team product id in POLAR_PRODUCT_TEAM, and they show up here.
      </Empty>
    );
  }
  return (
    <div className="admin-panel">
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Organization</th>
              <th className="num">Seats</th>
              <th className="num">MRR</th>
              <th>Billing</th>
              <th>Since</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {s.orgs.map((o) => (
              <tr key={o.customerId + o.since}>
                <td>
                  <details>
                    <summary>{o.name}</summary>
                    <span className="admin-meta">{o.email ?? "no email"}</span>
                  </details>
                </td>
                <td className="num">{fmtInt(o.seats)}</td>
                <td className="num">{money(o.amount, 0)}</td>
                <td className="ink-2">{o.interval === "year" ? "Yearly" : "Monthly"}</td>
                <td className="ink-2">{o.since}</td>
                <td>
                  <span className="admin-pill" data-tone={o.status === "active" ? "moss" : o.status === "cancelling" ? "warning" : undefined}>
                    {o.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Consumers({ s }: { s: Summary }) {
  if (!s.sources.db.ok) return <SourceError what="The database" error={s.sources.db.error} />;
  if (!s.consumers.length) {
    return <Empty>No paid usage recorded yet. Pro, Team and trial accounts appear here once they use hosted AI or search.</Empty>;
  }
  return (
    <div className="admin-panel">
      <div className="admin-table-wrap" data-scroll>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Plan</th>
              <th className="num">AI requests</th>
              <th className="num">Searches</th>
              <th className="num">Tokens in / out</th>
              <th className="num">Cost to us</th>
            </tr>
          </thead>
          <tbody>
            {s.consumers.map((c) => (
              <tr key={c.subject}>
                <td>
                  {c.email ? (
                    <details>
                      <summary title="Show email">{truncate(c.subject)}</summary>
                      <span className="admin-meta">{c.email}</span>
                    </details>
                  ) : (
                    truncate(c.subject)
                  )}
                </td>
                <td className="ink-2 capitalize">{c.plan}</td>
                <td className="num">{fmtInt(c.ai)}</td>
                <td className="num">{fmtInt(c.searches)}</td>
                <td className="num">
                  {compact(c.input)} / {compact(c.output)}
                </td>
                <td className="num">{money(c.cost, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {s.heavyToday.length ? (
        <p className="admin-meta border-t border-[var(--a-line)] px-3 py-2">
          Past the fair-use soft threshold today: {s.heavyToday.map((h) => `${truncate(h.subject)} (${h.kind} ${h.count})`).join(", ")}
        </p>
      ) : null}
    </div>
  );
}

const truncate = (id: string) => (id.length > 16 ? `${id.slice(0, 10)}…${id.slice(-4)}` : id);

function OtherDeps({ s }: { s: Summary }) {
  return (
    <div className="admin-panel">
      <div className="admin-table-wrap" data-scroll>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Dependency</th>
              <th>What for</th>
              <th className="num">Cost</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {s.other.map((o) => (
              <tr key={o.name}>
                <td className="whitespace-nowrap">{o.name}</td>
                <td className="ink-2">{o.purpose}</td>
                <td className="num">{o.cost}</td>
                <td>
                  {o.risk ? (
                    <span className="admin-pill" data-tone="warning">
                      {o.note ?? "Risk"}
                    </span>
                  ) : (
                    <span className="ink-3">{o.note ?? ""}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Footnotes({ s, tab }: { s: Summary; tab: DashboardTab }) {
  const notes: ReactNode[] = [];
  if (tab === "overview" || tab === "revenue" || tab === "usage") {
    notes.push(
      <p key="users">
        Installs are trials started (one per machine). Free weekly actives are machines with a hosted AI use this week. Users are
        machines and Polar customers; there are no accounts.
      </p>,
    );
  }
  if (tab === "overview" || tab === "usage") {
    notes.push(
      <p key="flush">
        AI and search counts are aggregated in memory and flushed to Neon at most every 10 minutes per server, only while there is traffic, so they can trail
        slightly and may undercount if a server stops between flushes.
        {s.firstUsageDay ? ` Counting since ${s.firstUsageDay}.` : ""} Per-account usage is kept for 90 days.
      </p>,
    );
  }
  if (tab === "overview" || tab === "costs" || tab === "dependencies") {
    notes.push(
      <p key="spend">
        Spend history before this month shows fixed fees, model cost and Polar fees only. Prices and plans live in
        lib/admin/costs.ts; anything marked unconfirmed is an estimate.
      </p>,
    );
  }
  if (!notes.length) return null;
  return <footer className="admin-meta mt-12 grid gap-1 border-t border-[var(--a-line)] pt-4">{notes}</footer>;
}
