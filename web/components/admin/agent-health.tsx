import type { ReactNode } from "react";
import { BrandMark, adminField } from "@/components/admin/chrome";
import { StackedBars } from "@/components/admin/viz";
import { pinValue, overrideValue, resetValue, setTuningPaused } from "@/app/admin/agent-actions";
import { GLOBAL_KEYS, KINDS, RULES, boundFor, type ConfigValue, type Source } from "@/lib/agent/config";
import { fmtBucketMs } from "@/lib/agent/telemetry";
import { loadAgentHealth, loadConfigView, type AgentHealth, type ConfigView } from "@/lib/admin/agent-health";
import { format } from "@/lib/admin/format";

/**
 * /admin?tab=agent: how the agent does in real use (opt-in anonymous counts)
 * and the remote config the app applies, with its tuning history.
 */
const fmtInt = (n: number) => format(n, "int");
const rate = (part: number, whole: number) => (whole > 0 ? format(part / whole, "pct") : "—");
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const nice = (s: string) => s.replace(/_/g, " ");

const KEY_LABEL: Record<string, string> = {
  hourly_budget: "Suggestions per hour (cap)",
  "judge.timeout_ms": "Judge timeout, on device (ms)",
  "judge.cloud_timeout_ms": "Judge timeout, cloud (ms)",
  "judge.min_confidence": "Judge minimum confidence",
  "router.did_you_mean_bias": "Router bias towards the agent",
  "answer.first_byte_timeout_ms": "Answer first-byte timeout (ms)",
  "answer.idle_timeout_ms": "Answer stream idle timeout (ms)",
  "search.timeout_ms": "Web search timeout (ms)",
  "writing.written_threshold": "Writing: score to write for them",
  "writing.ambiguous_floor": "Writing: score a model decides from",
  "writing.polish_disfluency": "Writing: fillers per word to polish",
  "writing.run_on_words": "Writing: run-on length to polish (words)",
  "free.ai_per_week": "Free: AI uses per week",
  "free.suggestions_per_week": "Free: suggestions per week",
  "free.memory_hours": "Free: screen memory (hours)",
  "free.meetings_per_month": "Free: meetings per month",
};

const WRITE_LABEL: Record<string, string> = { as_said: "As said", polished: "Polished", written: "Written for you" };

export async function AgentHealth({ demo }: { demo: boolean }) {
  const [h, c] = await Promise.all([loadAgentHealth(demo), loadConfigView(demo)]);
  return (
    <>
      <Section id="agent" title="Agent health" sub="Opt-in anonymous counts from the app, last 30 days">
        {!h.ok ? <Empty>Analytics couldn&apos;t be read{h.error ? `: ${h.error}` : ""}.</Empty> : <Health h={h} />}
      </Section>
      <Section id="agent-config" title="Remote config" sub="Served at /api/agent/config; the app clamps every value to its own bounds">
        <Config c={c} demo={demo} />
      </Section>
      <Section id="agent-history" title="Change history" sub="Auto-tuning runs daily at 04:17 UTC">
        <History c={c} />
      </Section>
    </>
  );
}

function Health({ h }: { h: AgentHealth }) {
  if (h.totals.events === 0 && h.installs.every((v) => v === 0)) {
    return <Empty>No analytics yet. Counts arrive from installs that opted in, flushed to Neon at most every 10 minutes per server.</Empty>;
  }
  const offeredTotal = h.acceptance.reduce((a, k) => a + k.offered, 0);
  const acceptedTotal = h.acceptance.reduce((a, k) => a + k.accepted, 0);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Suggestions accepted" value={rate(acceptedTotal, offeredTotal)} foot={`${fmtInt(acceptedTotal)} of ${fmtInt(offeredTotal)} offers`} />
        <Kpi
          label="Did you mean rate"
          value={rate(h.didYouMean.shown, h.routeTotal)}
          foot={`${fmtInt(h.didYouMean.shown)} cards over ${fmtInt(h.routeTotal)} requests`}
        />
        <Kpi
          label="Answer p95, first card"
          value={fmtBucketMs(h.answers.reduce<number | null>((m, a) => (a.firstP95 !== null && (m === null || a.firstP95 > m) ? a.firstP95 : m), null))}
          foot={`${fmtInt(h.answers.reduce((a, x) => a + x.n, 0))} answers`}
        />
        <Kpi label="Opted-in installs" value={fmtInt(h.installs[h.installs.length - 1] ?? 0)} foot={`today · peak ${fmtInt(h.totals.installsLast7)} this week`} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Acceptance by suggestion kind" meta={`Judged on device ${fmtInt(h.offeredBy.device)} · cloud ${fmtInt(h.offeredBy.cloud)} · rules ${fmtInt(h.offeredBy.rules)}`}>
          <Table head={["Kind", "Offered", "Accepted", "Dismissed", "Ignored", "Muted", ""]}>
            {h.acceptance.map((k) => (
              <tr key={k.kind}>
                <td>{nice(k.kind)}</td>
                <td className="num">{fmtInt(k.offered)}</td>
                <td className="num">{rate(k.accepted, k.offered)}</td>
                <td className="num">{rate(k.dismissed, k.offered)}</td>
                <td className="num">{rate(k.ignored, k.offered)}</td>
                <td className="num">{rate(k.muted, k.offered)}</td>
                <td className="w-[90px]">
                  <Bar value={k.offered ? k.accepted / k.offered : 0} warn={k.offered >= RULES.lowMinOffers && k.accepted / k.offered < RULES.lowRate} />
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
        <div className="flex flex-col gap-3">
          <Panel title="Judge" meta="Outcomes and latency (bucket bounds)">
            <Table head={["Engine", "Runs", "OK", "Unparsable", "Timeout", "Error", "p50", "p95"]}>
              {h.judge.map((j) => (
                <tr key={j.engine}>
                  <td>{j.engine}</td>
                  <td className="num">{fmtInt(j.runs)}</td>
                  <td className="num">{rate(j.ok, j.runs)}</td>
                  <td className="num">{rate(j.unparsable, j.runs)}</td>
                  <td className="num">{rate(j.timeout, j.runs)}</td>
                  <td className="num">{rate(j.error, j.runs)}</td>
                  <td className="num">{fmtBucketMs(j.p50)}</td>
                  <td className="num">{fmtBucketMs(j.p95)}</td>
                </tr>
              ))}
            </Table>
          </Panel>
          <Panel title="Answer latency" meta="p50 / p95 from buckets">
            <Table head={["", "Answers", "First card p50", "p95", "Total p50", "p95"]}>
              {h.answers.map((a) => (
                <tr key={String(a.web)}>
                  <td>{a.web ? "With web search" : "Without search"}</td>
                  <td className="num">{fmtInt(a.n)}</td>
                  <td className="num">{fmtBucketMs(a.firstP50)}</td>
                  <td className="num">{fmtBucketMs(a.firstP95)}</td>
                  <td className="num">{fmtBucketMs(a.totalP50)}</td>
                  <td className="num">{fmtBucketMs(a.totalP95)}</td>
                </tr>
              ))}
            </Table>
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-3">
        <Panel title="Route mix" meta={h.routeSources.map((s) => `${nice(s.source)} ${rate(s.n, h.routeTotal)}`).join(" · ")}>
          {h.routes.map((r) => (
            <Stat key={r.route} label={r.route} value={rate(r.n, h.routeTotal)} hint={fmtInt(r.n)} />
          ))}
          <Stat
            label="Did you mean → typed / asked / dismissed"
            value={`${fmtInt(h.didYouMean.typed)} / ${fmtInt(h.didYouMean.asked)} / ${fmtInt(h.didYouMean.dismissed)}`}
          />
        </Panel>
        <Panel title="Act outcomes by platform">
          <Table head={["Platform", "Kind", "OK", "Fallback", "Failed"]} text={[0, 1]}>
            {h.acts.map((a) => {
              const n = a.ok + a.fallback + a.failed;
              return (
                <tr key={`${a.platform}-${a.kind}`}>
                  <td>{a.platform}</td>
                  <td>{nice(a.kind)}</td>
                  <td className="num">{rate(a.ok, n)}</td>
                  <td className="num">{rate(a.fallback, n)}</td>
                  <td className="num">{rate(a.failed, n)}</td>
                </tr>
              );
            })}
          </Table>
        </Panel>
        <Panel title="Errors by area">
          <Table head={["Area", "Kind", "Count"]} text={[0, 1]}>
            {h.errors.slice(0, 12).map((e) => (
              <tr key={`${e.area}-${e.kind}`}>
                <td>{e.area}</td>
                <td>{nice(e.kind)}</td>
                <td className="num">{fmtInt(e.n)}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Opted-in installs per day" meta="Distinct rotating ids; unlinkable across days">
          <StackedBars labels={h.days.map(dayLabel)} series={[{ name: "Installs", values: h.installs, color: "var(--a-s1)" }]} height={170} />
        </Panel>
        <Panel title="👍 / 👎 by card" meta="Suggestion kinds and answer types">
          <Table head={["Card", "Kind", "👍", "👎", "Up rate"]} text={[0, 1]}>
            {h.ratings.slice(0, 14).map((r) => (
              <tr key={`${r.card}-${r.kind}`}>
                <td>{r.card}</td>
                <td>{nice(r.kind)}</td>
                <td className="num">{fmtInt(r.up)}</td>
                <td className="num">{fmtInt(r.down)}</td>
                <td className="num">{rate(r.up, r.up + r.down)}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>

      <Panel title="Free limits hit per week" meta="Installs that reached a limit (each counted once a week; meetings once a month). Tune them in Remote config.">
        {h.limitHits.every((w) => w.ai + w.suggestions + w.meetings === 0) ? (
          <Empty>No Free limits hit in the last 30 days.</Empty>
        ) : (
          <Table head={["Week of", "AI uses", "Suggestions", "Meetings"]} text={[0]}>
            {h.limitHits.map((w) => (
              <tr key={w.week}>
                <td>{dayLabel(w.week)}</td>
                <td className="num">{fmtInt(w.ai)}</td>
                <td className="num">{fmtInt(w.suggestions)}</td>
                <td className="num">{fmtInt(w.meetings)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
        <Panel title="Meetings">
          {h.meetings.map((m) => (
            <Stat key={m.outcome} label={nice(m.outcome)} value={fmtInt(m.n)} />
          ))}
          <Stat label="Notes emailed" value={fmtInt(h.meetingEmails.sent)} hint={`${fmtInt(h.meetingEmails.failed)} failed`} />
        </Panel>
        <Panel title="Writing" meta={`${fmtInt(h.writing.total)} smart dictations · revert = "Use my words"`}>
          <Table head={["Decision", "Share", "By a model", "Reverted", "By voice", ""]}>
            {h.writing.decisions.map((d) => {
              const revertRate = d.n > 0 ? d.reverts / d.n : 0;
              return (
                <tr key={d.decision}>
                  <td>{WRITE_LABEL[d.decision] ?? d.decision}</td>
                  <td className="num">{rate(d.n, h.writing.total)}</td>
                  <td className="num">{rate(d.model, d.n)}</td>
                  <td className="num">{d.decision === "as_said" ? "—" : rate(d.reverts, d.n)}</td>
                  <td className="num">{d.decision === "as_said" ? "—" : rate(d.byVoice, d.reverts)}</td>
                  <td className="w-[90px]">
                    {d.decision === "as_said" ? null : (
                      <Bar
                        value={revertRate}
                        warn={d.decision === "written" && d.n >= RULES.writtenMinCases && revertRate > RULES.writtenRevertRate}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        </Panel>
        <Panel title="Dictation (sampled 1 in 10)">
          <Stat label="Sampled dictations" value={fmtInt(h.dictation.n)} hint={`${rate(h.dictation.polished, h.dictation.n)} polished`} />
          <Stat label="Time to text p50" value={fmtBucketMs(h.dictation.p50)} />
          <Stat label="Time to text p95" value={fmtBucketMs(h.dictation.p95)} />
        </Panel>
      </div>
    </div>
  );
}

// ── Config ───────────────────────────────────────────────────────────────
function SourcePill({ source, pinned }: { source: Source; pinned?: boolean }) {
  const tone = source === "manual" ? "warning" : source === "auto" ? "moss" : "plain";
  return (
    <span className="admin-pill" data-tone={tone}>
      {source === "manual" ? (pinned ? "pinned" : "manual") : source}
    </span>
  );
}

const show = (v: ConfigValue | undefined) => (v === undefined ? "—" : typeof v === "boolean" ? (v ? "on" : "off") : String(v));

function Edit({ k, value, disabled }: { k: string; value: ConfigValue; disabled: boolean }) {
  const raw = boundFor(k);
  const isBool = raw === "bool";
  const b = raw === "bool" ? null : raw;
  return (
    <details className="text-[12px]">
      <summary className="cursor-pointer select-none text-[var(--a-ink-3)] hover:text-[var(--a-ink)]">Edit</summary>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <form action={overrideValue} className="flex items-center gap-2">
          <input type="hidden" name="key" value={k} />
          {isBool ? (
            <select name="value" defaultValue={String(value)} className={`${adminField} !h-8 !w-[84px]`} disabled={disabled}>
              <option value="true">on</option>
              <option value="false">off</option>
            </select>
          ) : (
            <input
              name="value"
              type="number"
              step={b && b.max <= 1 ? 0.01 : 1}
              min={b?.min}
              max={b?.max}
              defaultValue={String(value)}
              className={`${adminField} !h-8 !w-[110px]`}
              disabled={disabled}
            />
          )}
          <button type="submit" className="admin-btn" disabled={disabled}>
            Override
          </button>
        </form>
        <form action={pinValue}>
          <input type="hidden" name="key" value={k} />
          <input type="hidden" name="value" value={String(value)} />
          <button type="submit" className="admin-btn" disabled={disabled} title="Keep the current value; auto-tuning won't change it">
            Pin
          </button>
        </form>
        <form action={resetValue}>
          <input type="hidden" name="key" value={k} />
          <button type="submit" className="admin-btn" disabled={disabled} title="Drop the manual value; auto-tuning owns it again">
            Reset to auto
          </button>
        </form>
        {b ? (
          <span className="admin-meta">
            {b.min}–{b.max}, default {b.default}
          </span>
        ) : null}
      </div>
    </details>
  );
}

function Config({ c, demo }: { c: ConfigView; demo: boolean }) {
  const disabled = demo || !c.ok;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      {!c.ok ? (
        <p className="admin-pill" data-tone="warning">
          Neon unavailable{c.error ? ` (${c.error})` : ""}: serving built-in defaults; editing is off.
        </p>
      ) : null}
      <Panel
        title="Auto-tuning"
        meta={
          <form action={setTuningPaused} className="inline-flex items-center gap-2">
            <input type="hidden" name="paused" value={String(!c.paused)} />
            <span>{c.paused ? "Paused" : "Running daily"}</span>
            <button type="submit" className="admin-btn" disabled={disabled}>
              {c.paused ? "Resume" : "Pause"}
            </button>
          </form>
        }
      >
        <p className="ink-2 text-[12px]">
          Rules over the last 14 days: a kind accepted under {RULES.lowRate * 100}% over {RULES.lowMinOffers}+ offers gets +{RULES.confidenceUp} minimum confidence
          (or ×{RULES.cooldownGrow} cooldown at the ceiling); under {RULES.offRate * 100}% over {RULES.offMinOffers}+ it&apos;s turned off; {RULES.highRate * 100}%+ over{" "}
          {RULES.highMinOffers}+ relaxes by {RULES.confidenceDown}. A judge timing out on over {RULES.timeoutRate * 100}% of {RULES.timeoutMinRuns}+ runs gets +
          {RULES.timeoutStepMs} ms. Over {RULES.didYouMeanRate * 100}% &ldquo;did you mean&rdquo; over {RULES.didYouMeanMinRoutes}+ requests nudges the router bias +
          {RULES.biasStep}. &ldquo;Written for you&rdquo; reverted on over {RULES.writtenRevertRate * 100}% of {RULES.writtenMinCases}+ cases raises the written
          threshold +{RULES.writtenThresholdStep}. Manual and pinned values always win.
        </p>
      </Panel>
      <Panel title="Global">
        <Table head={["Setting", "Value", "Source", ""]} text={[0, 2, 3]}>
          {GLOBAL_KEYS.map((k) => (
            <tr key={k}>
              <td>{KEY_LABEL[k] ?? k}</td>
              <td className="num">{show(c.values[k])}</td>
              <td>
                <SourcePill source={c.sources[k] ?? "default"} pinned={c.pinned[k]} />
              </td>
              <td>
                <Edit k={k} value={c.values[k]} disabled={disabled} />
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
      <Panel title="Suggestion kinds">
        <Table head={["Kind", "Enabled", "Min confidence", "Cooldown (min)"]} text={[0, 1, 2, 3]}>
          {KINDS.map((kind) => (
            <tr key={kind}>
              <td>{nice(kind)}</td>
              {(["enabled", "min_confidence", "cooldown_min"] as const).map((f) => {
                const k = `kind.${kind}.${f}`;
                return (
                  <td key={f}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular-nums">{show(c.values[k])}</span>
                      <SourcePill source={c.sources[k] ?? "default"} pinned={c.pinned[k]} />
                    </div>
                    <Edit k={k} value={c.values[k]} disabled={disabled} />
                  </td>
                );
              })}
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}

function History({ c }: { c: ConfigView }) {
  if (!c.history.length) return <Empty>No changes yet. The first auto-tuning run needs enough opted-in data (50+ offers for a kind).</Empty>;
  return (
    <div className="admin-panel">
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Setting</th>
              <th className="num">From</th>
              <th className="num">To</th>
              <th>Source</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {c.history.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{new Date(r.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })}</td>
                <td>{KEY_LABEL[r.key] ?? r.key}</td>
                <td className="num">{show(r.oldValue ?? undefined)}</td>
                <td className="num">{show(r.newValue ?? undefined)}</td>
                <td>{r.source}</td>
                <td className="ink-2">
                  {r.reason}
                  {r.stats ? (
                    <span className="admin-meta ml-1.5">
                      {Object.entries(r.stats)
                        .map(([k, v]) => `${k} ${v}`)
                        .join(", ")}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Small pieces, matching app/admin/page.tsx ────────────────────────────
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

/** `text` lists the column indexes that hold text; the rest are right-aligned numbers. */
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

function Bar({ value, warn }: { value: number; warn?: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--a-line)]">
      <div className="h-full rounded-full" style={{ width: `${Math.round(Math.min(1, value) * 100)}%`, background: warn ? "var(--a-warning)" : "var(--a-s1)" }} />
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-[var(--radius-control)] border border-dashed border-[var(--a-line-strong)] px-4 py-6 text-center">
      <BrandMark size={20} className="opacity-50" id="am-agent-empty" />
      <p className="ink-3 max-w-sm text-[12px]">{children}</p>
    </div>
  );
}
