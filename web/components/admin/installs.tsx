import type { ReactNode } from "react";
import { BrandMark } from "@/components/admin/chrome";
import { StackedBars } from "@/components/admin/viz";
import { format } from "@/lib/admin/format";
import { ACTIVE_PLANS, loadInstalls, type ActivePlanKey, type InstallsData, type InstallsView } from "@/lib/admin/installs";
import { brand } from "@/lib/brand";
import { releases } from "@/lib/releases";

/**
 * /admin?tab=installs: everyone using the app, Free included, from what the
 * server already sees (lib/admin/installs.ts). Anonymous by design: devices
 * are counts, and only people who signed in have an email here.
 */
const fmtInt = (n: number) => format(n, "int");
const pct = (part: number, whole: number) => (whole > 0 ? format(part / whole, "pct") : "—");
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const sumPlans = (r: Record<ActivePlanKey, number>) => ACTIVE_PLANS.reduce((a, p) => a + r[p], 0);

const PLAN: Record<ActivePlanKey, { name: string; color: string }> = {
  team: { name: "Team", color: "var(--a-s1)" },
  pro: { name: "Pro", color: "var(--a-s2)" },
  trial: { name: "Trial", color: "var(--a-s3)" },
  free: { name: "Free", color: "var(--a-s4)" },
};
const OS_NAME: Record<string, string> = { macos: "macOS", windows: "Windows", linux: "Linux" };
const ARCH_NAME: Record<string, string> = { aarch64: "Arm", x86_64: "x64" };
/** "macos/aarch64" → "macOS · Arm". */
const osLabel = (key: string) => {
  const [os, arch] = key.split("/");
  const name = OS_NAME[os] ?? os;
  return arch && arch !== "other" ? `${name} · ${ARCH_NAME[arch] ?? arch}` : name;
};
const fileLabel = (id: string) => (id in releases ? releases[id as keyof typeof releases].label : id);

let regionNames: Intl.DisplayNames | null = null;
function countryName(code: string) {
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export async function Installs({ demo }: { demo: boolean }) {
  const v = await loadInstalls(demo);
  return (
    <>
      <Section id="installs" title="Installs" sub="Every plan, Free included, from the app's anonymous daily check-in and its other requests">
        {!v.ok ? <Empty>Install data couldn&apos;t be read: {v.error.replace(/\.$/, "")}.</Empty> : <Overview d={v.data} v={v} />}
      </Section>
      {v.ok ? (
        <>
          <Section id="installs-where" title="Downloads and countries" sub="Last 30 days · counts only, no IP addresses kept">
            <Where d={v.data} />
          </Section>
          <Section id="installs-accounts" title="Signed-in people" sub="Emails that signed in, and emails that asked for tips; everyone else is an anonymous device">
            <Accounts d={v.data} />
          </Section>
        </>
      ) : null}
    </>
  );
}

function Overview({ d, v }: { d: InstallsData; v: InstallsView }) {
  const pastTrial = Math.max(0, d.installs.total - d.installs.trialing);
  const labels = d.days.map(dayLabel);
  const anyActive = ACTIVE_PLANS.some((p) => d.activePerDay[p].some((n) => n > 0));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Installs" value={fmtInt(d.installs.total)} foot={`${fmtInt(d.installs.last7)} this week · ${fmtInt(d.installs.last30)} in 30 days`} />
        <Kpi label="Active today" value={fmtInt(sumPlans(d.active.day))} foot={`Free ${fmtInt(d.active.day.free)} · trial ${fmtInt(d.active.day.trial)}`} />
        <Kpi label="Active this week" value={fmtInt(sumPlans(d.active.week))} foot={`Free ${fmtInt(d.active.week.free)} · trial ${fmtInt(d.active.week.trial)}`} />
        <Kpi label="Active this month" value={fmtInt(sumPlans(d.active.month))} foot={`Free ${fmtInt(d.active.month.free)} · trial ${fmtInt(d.active.month.trial)}`} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Active per day, by plan" meta={<Legend />}>
          {anyActive ? (
            <StackedBars labels={labels} series={ACTIVE_PLANS.map((p) => ({ name: PLAN[p].name, values: d.activePerDay[p], color: PLAN[p].color }))} height={170} />
          ) : (
            <Empty>No activity recorded yet. Devices appear here from their daily check-in (0.1.8 and later), trial check, Free usage check, hosted AI request or plan check.</Empty>
          )}
        </Panel>
        <Panel title="Plans">
          <Stat label="Free devices active this month" value={fmtInt(d.active.month.free)} hint="anonymous" />
          <Stat label="On their trial now" value={fmtInt(d.installs.trialing)} hint={`started in the last ${brand.trialDays} days`} />
          <Stat label="Past their trial" value={fmtInt(pastTrial)} hint="Free, or converted" />
          <Stat
            label="Pro and Team, paying"
            value={v.polar ? fmtInt(v.polar.paying) : "—"}
            hint={v.polar ? "customers in Polar" : `Polar: ${v.polarError ?? "unavailable"}`}
          />
          <Stat label="Complimentary" value={v.polar ? fmtInt(v.polar.complimentary) : "—"} hint="$0 subscriptions" />
          <Stat label="Paid accounts active this month" value={fmtInt(d.active.month.pro + d.active.month.team)} />
        </Panel>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
        <Panel title="New installs per day" meta={`First launches · ${fmtInt(d.installs.last30)} in 30 days`}>
          {d.installs.perDay.some((n) => n > 0) ? (
            <StackedBars labels={labels} series={[{ name: "Installs", values: d.installs.perDay, color: "var(--a-s2)" }]} height={140} />
          ) : (
            <Empty>No first launches in the last 30 days.</Empty>
          )}
        </Panel>
        <Panel title="Downloads per day" meta={`From the site's download links · ${fmtInt(d.downloads.last30)} in 30 days`}>
          {d.downloads.perDay.some((n) => n > 0) ? (
            <StackedBars labels={labels} series={[{ name: "Downloads", values: d.downloads.perDay, color: "var(--a-s1)" }]} height={140} />
          ) : (
            <Empty>No downloads counted yet. Counting started with 0.1.8&apos;s website deploy.</Empty>
          )}
        </Panel>
      </div>

      <Panel title="OS, version and plan" meta={`Every device that checked in, last 7 days · ${fmtInt(d.mix.deviceDays)} device-days`}>
        {d.mix.os.length || d.mix.versions.length ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 md:grid-cols-3">
            <Mix rows={d.mix.os.map((r) => ({ label: osLabel(r.key), n: r.n }))} />
            <Mix rows={d.mix.versions.map((r) => ({ label: r.key, n: r.n }))} />
            <Mix rows={d.mix.plans.map((r) => ({ label: PLAN[r.key as ActivePlanKey]?.name ?? r.key, n: r.n }))} />
          </div>
        ) : (
          <Empty>No check-ins yet. Every install from 0.1.8 on checks in once a day with its OS, version and plan.</Empty>
        )}
      </Panel>
      {d.activeSince ? <p className="admin-meta">Activity counted since {dayLabel(d.activeSince)}.</p> : null}
    </div>
  );
}

function Where({ d }: { d: InstallsData }) {
  const totalFiles = d.downloadFiles.reduce((a, r) => a + r.n, 0);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="flex flex-col gap-3">
        <Panel title="Downloads by installer">
          {d.downloadFiles.length ? (
            <Table head={["Installer", "Downloads", "Share"]}>
              {d.downloadFiles.map((r) => (
                <tr key={r.id}>
                  <td>{fileLabel(r.id)}</td>
                  <td className="num">{fmtInt(r.n)}</td>
                  <td className="num">{pct(r.n, totalFiles)}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No downloads counted yet.</Empty>
          )}
        </Panel>
        {d.downloadVersions.length ? (
          <Panel title="Downloads by version">
            {d.downloadVersions.map((r) => (
              <Stat key={r.version} label={r.version} value={fmtInt(r.n)} />
            ))}
          </Panel>
        ) : null}
      </div>
      <Panel title="Countries" meta="From the request's IP (Vercel geolocation); only the country is counted">
        {d.countries.length ? (
          <Table head={["Country", "Downloads", "First launches"]}>
            {d.countries.map((c) => (
              <tr key={c.country}>
                <td>
                  {countryName(c.country)} <span className="admin-meta">{c.country}</span>
                </td>
                <td className="num">{fmtInt(c.downloads)}</td>
                <td className="num">{fmtInt(c.firstLaunches)}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>No countries yet. Downloads and first launches are counted by country from 0.1.8&apos;s website deploy.</Empty>
        )}
      </Panel>
    </div>
  );
}

function Accounts({ d }: { d: InstallsData }) {
  const free = d.accounts.filter((a) => a.plan === "free");
  const signedIn = Object.values(d.accountTotals).reduce((a, b) => a + b, 0);
  const freeSignedIn = d.accountTotals.free ?? 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Panel title="Who we can name">
        <Stat label="Signed in, any plan" value={fmtInt(signedIn)} />
        <Stat label="Signed in on Free" value={fmtInt(freeSignedIn)} />
        <Stat label="Free devices this month" value={fmtInt(d.active.month.free)} hint="anonymous" />
        <p className="admin-meta mt-3">
          Free works without an account, so most Free users are anonymous devices. Emails are kept 12 months after the latest sign-in or tip request.
        </p>
      </Panel>
      <Panel title="Free users and tips emails" meta={free.length ? `Latest first · ${fmtInt(free.length)} shown` : undefined}>
        {free.length ? (
          <Table head={["Email", "How", "First seen", "Latest"]} text={[0, 1, 2, 3]}>
            {free.map((a) => (
              <tr key={a.email}>
                <td>
                  <a href={`mailto:${a.email}`} className="underline-offset-2 hover:underline">
                    {a.email}
                  </a>
                </td>
                <td>{a.source === "tips" ? "Tips" : "Signed in"}</td>
                <td>{dateLabel(a.firstSeen)}</td>
                <td>{dateLabel(a.lastSeen)}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>No Free sign-ins or tips emails recorded yet. Both are recorded from 0.1.8&apos;s website deploy.</Empty>
        )}
      </Panel>
    </div>
  );
}

function Legend() {
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
      {ACTIVE_PLANS.map((p) => (
        <span key={p} className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full" style={{ background: PLAN[p].color }} />
          {PLAN[p].name}
        </span>
      ))}
    </span>
  );
}

function Mix({ rows }: { rows: { label: string; n: number }[] }) {
  const total = rows.reduce((a, r) => a + r.n, 0);
  return (
    <div>
      {rows.map((r) => (
        <Stat key={r.label} label={r.label} value={pct(r.n, total)} hint={fmtInt(r.n)} />
      ))}
    </div>
  );
}

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
function Panel({ title, meta, children }: { title?: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <div className="admin-panel min-w-0 px-4 py-3.5">
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
function Kpi({ label, value, foot }: { label: string; value: string; foot: string }) {
  return (
    <div className="admin-panel flex min-w-0 flex-col gap-2 px-4 pb-3 pt-3.5">
      <span className="admin-label">{label}</span>
      <span className="admin-figure">{value}</span>
      <span className="admin-meta">{foot}</span>
    </div>
  );
}
function Table({ head, text = [0], children }: { head: string[]; text?: number[]; children: ReactNode }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={`${h}-${i}`} className={text.includes(i) ? undefined : "num"}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
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
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-[var(--radius-control)] border border-dashed border-[var(--a-line-strong)] px-4 py-6 text-center">
      <BrandMark size={20} className="opacity-50" id="am-installs-empty" />
      <p className="ink-3 max-w-sm text-[12px]">{children}</p>
    </div>
  );
}
