import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminHeader, adminField } from "@/components/admin/chrome";
import { planSegment, renderPreview } from "@/lib/admin/customer-email";
import { ADMIN_TEMPLATES, DAILY_LIMIT, SEGMENTS, getCustomers, segmentById, templateById } from "@/lib/admin/customers";
import { requireAdmin } from "@/lib/admin/guard";
import { fmtInt } from "@/lib/admin/summary";
import { sendSegmentEmail } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Email a segment", robots: { index: false, follow: false, nocache: true } };

/**
 * Pick a segment and a template → preview with the exact recipient count
 * (after opt-outs) and today's remaining quota → confirm. The count is checked
 * again on send; if it moved, nothing is sent.
 */
export default async function SendPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const demo = sp.demo === "1";
  const segment = segmentById(sp.segment ?? "");
  const template = templateById(sp.template);
  const note = { subject: sp.subject ?? "", body: sp.body ?? "" };
  const reviewing = sp.review === "1" && segment && template && !template.single;

  const list = await getCustomers(demo);
  const all = list.ok ? list.customers : [];
  const counts = Object.fromEntries(SEGMENTS.map((s) => [s.id, all.filter(s.test).length]));

  let plan: Awaited<ReturnType<typeof planSegment>> | null = null;
  if (reviewing) {
    const rows = all.filter(segment.test);
    plan = demo
      ? {
          recipients: rows.filter((r) => r.email && r.customerId !== "demo_3"),
          skippedUnsubscribed: rows.some((r) => r.customerId === "demo_3") ? 1 : 0,
          skippedNoEmail: 0,
          quota: { used: 37, limit: DAILY_LIMIT, remaining: DAILY_LIMIT - 37 },
        }
      : await planSegment(template.id, rows);
  }
  const preview = reviewing ? renderPreview(template.id, null, note, true) : null;
  const fits = plan?.quota ? plan.recipients.length <= plan.quota.remaining : false;
  const back = `/admin/customers${demo ? "?demo=1" : ""}`;

  return (
    <div data-admin-root className="admin px-3 py-3 sm:px-4 sm:py-4">
      <div className="admin-window glass mx-auto max-w-[1360px] px-5 pb-10 pt-4 sm:px-8">
        <AdminHeader email={admin} demo={demo} title="Email a segment" meta="Resend Free: 100 emails a day">
          <Link className="admin-btn" href={back}>
            All customers
          </Link>
        </AdminHeader>

        {sp.sent ? <Flash tone="moss">{sp.sent}</Flash> : null}
        {sp.error ? <Flash tone="error">{sp.error}</Flash> : null}

        <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <form method="get" action="/admin/customers/send" className="admin-panel space-y-4 self-start px-4 py-3.5">
            {demo ? <input type="hidden" name="demo" value="1" /> : null}
            <input type="hidden" name="review" value="1" />
            <fieldset className="grid gap-1.5">
              <legend className="admin-label mb-1.5">Who</legend>
              {SEGMENTS.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center justify-between gap-2.5 rounded-[var(--radius-control)] px-2 py-1.5 hover:bg-[var(--a-wash)]">
                  <span className="flex items-center gap-2.5">
                    <input type="radio" name="segment" value={s.id} defaultChecked={(segment?.id ?? "active") === s.id} className="accent-[var(--a-ink)]" />
                    {s.label}
                  </span>
                  <span className="admin-meta">{fmtInt(counts[s.id] ?? 0)}</span>
                </label>
              ))}
            </fieldset>
            <fieldset className="grid gap-1.5">
              <legend className="admin-label mb-1.5">What</legend>
              {ADMIN_TEMPLATES.filter((t) => !t.single).map((t) => (
                <label key={t.id} className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-control)] px-2 py-1.5 hover:bg-[var(--a-wash)]">
                  <input type="radio" name="template" value={t.id} defaultChecked={(template?.id ?? "highlight-ask") === t.id} className="mt-[3px] accent-[var(--a-ink)]" />
                  <span>
                    {t.label}
                    <span className="admin-meta block">{t.id === "personal-note" ? "To a segment it counts as marketing: unsubscribe link, opt-outs skipped." : t.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="admin-label block">
              Subject <span className="admin-meta">(personal note only)</span>
              <input name="subject" defaultValue={note.subject} maxLength={140} className={`${adminField} mt-1.5`} />
            </label>
            <label className="admin-label block">
              Note <span className="admin-meta">(personal note only)</span>
              <textarea name="body" defaultValue={note.body} rows={5} maxLength={5000} className={`${adminField} mt-1.5 h-auto resize-y py-2 leading-[19px]`} />
            </label>
            <button className="admin-btn" type="submit">
              Review
            </button>
          </form>

          <div className="admin-panel px-4 py-3.5">
            {!reviewing || !plan || !preview ? (
              <p className="ink-3 py-10 text-center text-[12px]">Pick who and what, then Review to see the email and the exact count.</p>
            ) : (
              <>
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <span className="admin-label">Confirm</span>
                  <span className="admin-meta">{preview.kind}</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Figure label="Will receive" value={fmtInt(plan.recipients.length)} />
                  <Figure label="Skipped" value={fmtInt(plan.skippedUnsubscribed + plan.skippedNoEmail)} hint={`${plan.skippedUnsubscribed} unsubscribed · ${plan.skippedNoEmail} no email`} />
                  <Figure
                    label="Left today"
                    value={plan.quota ? `${fmtInt(plan.quota.remaining)} / ${plan.quota.limit}` : "—"}
                    hint="Resend, last 24 hours"
                    tone={fits ? undefined : "error"}
                  />
                </div>
                {plan.error ? <Flash tone="error">{plan.error}</Flash> : null}
                {plan.quota && !fits ? (
                  <Flash tone="error">
                    {fmtInt(plan.recipients.length)} emails won&apos;t fit in today&apos;s {fmtInt(plan.quota.remaining)} remaining. Narrow the segment or send tomorrow.
                  </Flash>
                ) : null}
                <p className="mb-2 mt-4">{preview.subject}</p>
                <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[620px] w-full rounded-[var(--radius-control)] border border-[var(--a-line)] bg-white" />
                {fits && !plan.error && plan.recipients.length > 0 ? (
                  <form action={sendSegmentEmail} className="mt-3 flex flex-wrap items-center gap-3">
                    <input type="hidden" name="segment" value={segment.id} />
                    <input type="hidden" name="template" value={template.id} />
                    <input type="hidden" name="subject" value={note.subject} />
                    <input type="hidden" name="body" value={note.body} />
                    <input type="hidden" name="expected" value={plan.recipients.length} />
                    {demo ? <input type="hidden" name="demo" value="1" /> : null}
                    <button type="submit" className="admin-btn !border-transparent !bg-[var(--a-ink)] !text-[var(--a-surface)]">
                      Send to {fmtInt(plan.recipients.length)} {plan.recipients.length === 1 ? "customer" : "customers"}
                    </button>
                    <span className="admin-meta">Once per segment, template and day. Opt-outs are checked again on send.</span>
                  </form>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "error" }) {
  return (
    <div className="rounded-[var(--radius-control)] bg-[var(--a-wash)] px-3 py-2.5">
      <div className="admin-label">{label}</div>
      <div className="mt-1 text-[22px] font-light tracking-[-0.03em]" style={tone ? { color: "var(--a-error)" } : undefined}>
        {value}
      </div>
      {hint ? <div className="admin-meta mt-0.5">{hint}</div> : null}
    </div>
  );
}

function Flash({ tone, children }: { tone: "moss" | "error"; children: ReactNode }) {
  return (
    <p role="status" className="mt-3 rounded-[var(--radius-control)] px-3 py-2 text-[12px]" style={{ background: `var(--a-${tone}-wash)`, color: `var(--a-${tone})` }}>
      {children}
    </p>
  );
}
