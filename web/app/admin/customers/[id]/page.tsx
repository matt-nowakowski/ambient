import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AdminHeader, adminField } from "@/components/admin/chrome";
import { renderPreview } from "@/lib/admin/customer-email";
import { ADMIN_TEMPLATES, STATUS_LABEL, STATUS_TONE, getCustomerDetail, templateById, type MarketingStatus } from "@/lib/admin/customers";
import { requireAdmin } from "@/lib/admin/guard";
import { money } from "@/lib/admin/summary";
import { sendCustomerEmail } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Customer", robots: { index: false, follow: false, nocache: true } };

const date = (iso: string | null, time = false) =>
  iso
    ? new Date(iso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        ...(time ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
        timeZone: "UTC",
      })
    : "—";

const MARKETING: Record<MarketingStatus, { label: string; tone?: "moss" | "warning" }> = {
  subscribed: { label: "Subscribed", tone: "moss" },
  unsubscribed: { label: "Unsubscribed", tone: "warning" },
  not_a_contact: { label: "Not a contact (soft opt-in applies)" },
  unknown: { label: "Unknown (Resend not connected)" },
};

const EVENT_TONE: Record<string, "moss" | "warning" | "error" | undefined> = {
  delivered: "moss",
  opened: "moss",
  clicked: "moss",
  bounced: "error",
  complained: "error",
  delivery_delayed: "warning",
  failed: "error",
};

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const demo = sp.demo === "1";
  const d = await getCustomerDetail(decodeURIComponent(id), demo);
  if (!d) notFound();
  const c = d.row;

  const template = templateById(sp.template);
  const note = { subject: sp.subject ?? "", body: sp.body ?? "" };
  const previewing = sp.preview === "1" && template;
  const preview = previewing ? renderPreview(template.id, c, note, false) : null;
  const marketingBlocked = Boolean(template?.marketing) && d.marketing === "unsubscribed";
  const back = `/admin/customers${demo ? "?demo=1" : ""}`;

  return (
    <div data-admin-root className="admin px-3 py-3 sm:px-4 sm:py-4">
      <div className="admin-window glass mx-auto max-w-[1360px] px-5 pb-10 pt-4 sm:px-8">
        <AdminHeader email={admin} demo={demo} title={c.name ?? c.email ?? "Customer"} meta={c.name ? (c.email ?? undefined) : undefined}>
          <Link className="admin-btn" href={back}>
            All customers
          </Link>
        </AdminHeader>

        <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <div className="flex flex-col gap-3">
            <Panel title="Subscription">
              <Stat label="Status">
                <span className="admin-pill" data-tone={STATUS_TONE[c.status]}>
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
              </Stat>
              <Stat label="Plan">
                {c.product}
                <span className="admin-meta ml-1.5">{c.plan === "team" ? "Team" : "Pro"}</span>
              </Stat>
              <Stat label="MRR">{c.mrrCents ? money(c.mrrCents / 100, 0) : "—"}</Stat>
              <Stat label="Customer since">{date(c.since)}</Stat>
              <Stat label={c.renewsAt ? "Renews" : "Ends"}>{date(c.renewsAt ?? c.endsAt)}</Stat>
              <Stat label="Marketing email">
                <span className="admin-pill" data-tone={MARKETING[d.marketing].tone}>
                  {MARKETING[d.marketing].label}
                </span>
              </Stat>
              <Stat label="Polar customer">
                <span className="admin-meta">{c.customerId}</span>
              </Stat>
            </Panel>

            <Panel title="Timeline" meta="From Polar, newest first">
              <ol className="relative ml-1.5 border-l border-[var(--a-line-strong)]">
                {d.timeline.map((t, i) => (
                  <li key={`${t.at}-${i}`} className="relative pb-3.5 pl-4 last:pb-0">
                    <span
                      className="absolute -left-[4.5px] top-[6px] size-2 rounded-full border border-[var(--a-surface)]"
                      style={{ background: t.tone ? `var(--a-${t.tone})` : "var(--a-s2)" }}
                    />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span>{t.title}</span>
                      <span className="admin-meta">{date(t.at)}</span>
                    </div>
                    {t.detail ? <div className="admin-meta mt-0.5">{t.detail}</div> : null}
                  </li>
                ))}
              </ol>
            </Panel>
          </div>

          <div className="flex flex-col gap-3">
            <Panel title="Emails" meta="From Resend, last 30 days">
              {!d.emails.ok ? (
                <p className="ink-3 text-[12px]">{d.emails.error}.</p>
              ) : d.emails.items.length === 0 ? (
                <p className="ink-3 text-[12px]">No emails to this address in the last 30 days.</p>
              ) : (
                <div className="admin-table-wrap -mx-4 -mb-3.5">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th>Status</th>
                        <th className="num">Sent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.emails.items.map((e) => (
                        <tr key={e.id}>
                          <td>{e.subject}</td>
                          <td>
                            <span className="admin-pill" data-tone={EVENT_TONE[e.lastEvent ?? ""]}>
                              {(e.lastEvent ?? "sent").replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="num ink-2">{date(e.createdAt, true)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {d.emails.ok && !d.emails.complete ? <p className="admin-meta mt-2">Only the newest 1,000 emails were searched.</p> : null}
            </Panel>

            <Panel title="Send an email" meta="Preview first. One send per template per day." id="send">
              {sp.sent ? <Flash tone="moss">{sp.sent}</Flash> : null}
              {sp.error ? <Flash tone="error">{sp.error}</Flash> : null}
              <form method="get" action={`/admin/customers/${encodeURIComponent(c.customerId)}#send`} className="space-y-3">
                {demo ? <input type="hidden" name="demo" value="1" /> : null}
                <input type="hidden" name="preview" value="1" />
                <fieldset className="grid gap-1.5">
                  <legend className="admin-label mb-1.5">Template</legend>
                  {ADMIN_TEMPLATES.map((t) => (
                    <label key={t.id} className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-control)] px-2 py-1.5 hover:bg-[var(--a-wash)]">
                      <input type="radio" name="template" value={t.id} defaultChecked={(template?.id ?? "personal-note") === t.id} className="mt-[3px] accent-[var(--a-ink)]" />
                      <span>
                        {t.label}
                        <span className="admin-meta block">{t.hint}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <label className="admin-label block">
                  Subject <span className="admin-meta">(personal note only)</span>
                  <input name="subject" defaultValue={note.subject} maxLength={140} className={`${adminField} mt-1.5`} />
                </label>
                <label className="admin-label block">
                  Note <span className="admin-meta">(personal note only; blank lines make paragraphs, signed “Matt”)</span>
                  <textarea name="body" defaultValue={note.body} rows={5} maxLength={5000} className={`${adminField} mt-1.5 h-auto resize-y py-2 leading-[19px]`} />
                </label>
                <button className="admin-btn" type="submit">
                  Preview
                </button>
              </form>

              {preview && template ? (
                <div className="mt-4 border-t border-[var(--a-line)] pt-4">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <span className="admin-label">Preview</span>
                    <span className="admin-meta">
                      To {c.email ?? "—"} · {preview.kind}
                    </span>
                  </div>
                  <p className="mb-2">{preview.subject}</p>
                  <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[560px] w-full rounded-[var(--radius-control)] border border-[var(--a-line)] bg-white" />
                  {marketingBlocked ? (
                    <Flash tone="warning">This customer unsubscribed from marketing emails, so this template can&apos;t be sent to them.</Flash>
                  ) : !c.email ? (
                    <Flash tone="warning">No email address on this customer.</Flash>
                  ) : (
                    <form action={sendCustomerEmail} className="mt-3 flex flex-wrap items-center gap-3">
                      <input type="hidden" name="customerId" value={c.customerId} />
                      <input type="hidden" name="template" value={template.id} />
                      <input type="hidden" name="subject" value={note.subject} />
                      <input type="hidden" name="body" value={note.body} />
                      {demo ? <input type="hidden" name="demo" value="1" /> : null}
                      <button type="submit" className="admin-btn !border-transparent !bg-[var(--a-ink)] !text-[var(--a-surface)]">
                        Send to {c.email}
                      </button>
                      <span className="admin-meta">Checks today&apos;s Resend quota (100/day) before sending.</span>
                    </form>
                  )}
                </div>
              ) : null}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, meta, children, className = "", id }: { title: string; meta?: string; children: ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={`admin-panel scroll-mt-4 px-4 py-3.5 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="admin-label">{title}</span>
        {meta ? <span className="admin-meta">{meta}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--a-line)] py-2 last:border-0">
      <span className="ink-2">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function Flash({ tone, children }: { tone: "moss" | "warning" | "error"; children: ReactNode }) {
  return (
    <p role="status" className="my-3 rounded-[var(--radius-control)] px-3 py-2 text-[12px]" style={{ background: `var(--a-${tone}-wash)`, color: `var(--a-${tone})` }}>
      {children}
    </p>
  );
}
