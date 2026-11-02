import type { Metadata } from "next";
import Link from "next/link";
import { AdminHeader, BrandMark, adminField } from "@/components/admin/chrome";
import { STATUS_FILTERS, STATUS_LABEL, STATUS_TONE, getCustomers, matchesStatus, type StatusFilter } from "@/lib/admin/customers";
import { requireAdmin } from "@/lib/admin/guard";
import { fmtInt, money } from "@/lib/admin/summary";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Customers", robots: { index: false, follow: false, nocache: true } };

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const demo = sp.demo === "1";
  const status: StatusFilter = STATUS_FILTERS.some((f) => f.id === sp.status) ? (sp.status as StatusFilter) : "all";
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 100);
  const list = await getCustomers(demo);
  const now = new Date().getTime();

  const href = (o: { status?: string; q?: string }) => {
    const p = new URLSearchParams();
    const st = o.status ?? status;
    if (st !== "all") p.set("status", st);
    if (o.q ?? q) p.set("q", o.q ?? q);
    if (demo) p.set("demo", "1");
    const s = p.toString();
    return `/admin/customers${s ? `?${s}` : ""}`;
  };

  const all = list.ok ? list.customers : [];
  const counts = Object.fromEntries(STATUS_FILTERS.map((f) => [f.id, all.filter((c) => matchesStatus(c, f.id)).length]));
  const rows = all
    .filter((c) => matchesStatus(c, status))
    .filter((c) => !q || [c.name, c.email, c.customerId].some((v) => v?.toLowerCase().includes(q)));
  const mrr = rows.reduce((a, c) => a + c.mrrCents, 0) / 100;

  return (
    <div data-admin-root className="admin px-3 py-3 sm:px-4 sm:py-4">
      <div className="admin-window glass mx-auto max-w-[1360px] px-5 pb-10 pt-4 sm:px-8">
        <AdminHeader email={admin} demo={demo} title="Customers" meta="Polar, Ambient products only">
          <Link className="admin-btn" href={`/admin/customers/send${demo ? "?demo=1" : ""}`}>
            Email a segment
          </Link>
        </AdminHeader>

        {demo ? (
          <p className="mt-3 rounded-[var(--radius-control)] bg-[var(--a-warning-wash)] px-3 py-2 text-[12px] text-[var(--a-warning)]">
            Sample data: made-up customers for review and screenshots. Sends are disabled.{" "}
            <Link href="/admin/customers" className="underline underline-offset-2">
              Show real data
            </Link>
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <nav className="admin-seg admin-seg-scroll" aria-label="Status">
            {STATUS_FILTERS.map((f) => (
              <Link key={f.id} href={href({ status: f.id })} aria-current={status === f.id ? "page" : undefined}>
                {f.label}
                <span className="ml-1.5 text-[var(--a-ink-3)]">{counts[f.id] ?? 0}</span>
              </Link>
            ))}
          </nav>
          <form className="flex items-center gap-2" action="/admin/customers">
            {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
            {demo ? <input type="hidden" name="demo" value="1" /> : null}
            <input name="q" defaultValue={q} placeholder="Search name or email" aria-label="Search customers" className={`${adminField} w-[240px]`} />
            <button className="admin-btn" type="submit">
              Search
            </button>
          </form>
        </div>

        <section className="mt-4">
          {!list.ok ? (
            <Empty>
              {list.missingEnv?.length ? `Polar isn't connected. Set ${list.missingEnv.join(", ")} in Vercel.` : `Polar couldn't be read: ${list.error}.`}{" "}
              <Link href="/admin/customers?demo=1" className="underline underline-offset-2">
                See sample data
              </Link>
            </Empty>
          ) : rows.length === 0 ? (
            <Empty>{all.length === 0 ? "No Ambient customers yet. They appear here after the first checkout." : "No customers match."}</Empty>
          ) : (
            <div className="admin-panel">
              <div className="admin-table-wrap" data-scroll>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Plan</th>
                      <th>Status</th>
                      <th>Since</th>
                      <th className="num">MRR</th>
                      <th>Renews or ends</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.customerId} className="relative">
                        <td>
                          <Link
                            href={`/admin/customers/${encodeURIComponent(c.customerId)}${demo ? "?demo=1" : ""}`}
                            className="after:absolute after:inset-0 after:content-['']"
                          >
                            {c.name ?? c.email ?? c.customerId}
                          </Link>
                          {c.name && c.email ? <div className="admin-meta">{c.email}</div> : null}
                        </td>
                        <td>
                          {c.plan === "team" ? "Team" : "Pro"}
                          <span className="admin-meta ml-1.5">{c.interval === "year" ? "yearly" : "monthly"}</span>
                        </td>
                        <td>
                          <span className="admin-pill" data-tone={STATUS_TONE[c.status]}>
                            {STATUS_LABEL[c.status] ?? c.status}
                          </span>
                        </td>
                        <td className="ink-2">{date(c.since)}</td>
                        <td className="num">{c.mrrCents ? money(c.mrrCents / 100, 0) : <span className="ink-3">—</span>}</td>
                        <td className="ink-2">
                          {c.renewsAt ? `Renews ${date(c.renewsAt)}` : c.endsAt ? `${Date.parse(c.endsAt) > now ? "Ends" : "Ended"} ${date(c.endsAt)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {list.ok && rows.length ? (
            <p className="admin-meta mt-2">
              {fmtInt(rows.length)} {rows.length === 1 ? "customer" : "customers"} · {money(mrr, 0)} MRR · cached up to 15 minutes, Refresh to refetch
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-[var(--radius-control)] border border-dashed border-[var(--a-line-strong)] px-4 py-6 text-center">
      <BrandMark size={20} className="opacity-50" id="am-empty" />
      <p className="ink-3 max-w-sm text-[12px]">{children}</p>
    </div>
  );
}
