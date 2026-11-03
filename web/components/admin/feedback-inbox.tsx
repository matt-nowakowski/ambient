import Link from "next/link";
import type { ReactNode } from "react";
import { updateFeedbackNote, updateFeedbackStatus } from "@/app/admin/feedback-actions";
import { adminField } from "@/components/admin/chrome";
import { cleanFilters, feedbackInbox, type FeedbackFilters, type FeedbackItem } from "@/lib/admin/feedback";
import { brand } from "@/lib/brand";
import { FEEDBACK_KINDS, FEEDBACK_OS, FEEDBACK_SOURCES, FEEDBACK_STATUSES } from "@/lib/feedback-core";

/**
 * /admin?tab=feedback: what users sent from the app (the dialog, a 👎 on a
 * card, or by voice). Filters are query params; each report opens in place
 * with its diagnostics and example. Status and notes are server actions.
 */
const KIND_LABEL: Record<string, string> = { bug: "Bug", idea: "Idea", other: "Other" };
const SOURCE_LABEL: Record<string, string> = { dialog: "Dialog", voice: "Voice", thumbs: "👎 on a card" };
const OS_LABEL: Record<string, string> = { macos: "macOS", windows: "Windows", linux: "Linux" };
const STATUS_LABEL: Record<string, string> = { open: "Open", triaged: "Triaged", done: "Done" };
const STATUS_TONE: Record<string, string> = { open: "warning", triaged: "plain", done: "moss" };

type Key = keyof FeedbackFilters;

function hrefWith(filters: FeedbackFilters, demo: boolean, key: Key, value: string | undefined) {
  const q = new URLSearchParams({ tab: "feedback" });
  const next = { ...filters, [key]: value };
  for (const k of ["kind", "status", "source", "os", "version"] as Key[]) {
    if (next[k]) q.set(k, next[k]!);
  }
  if (demo) q.set("demo", "1");
  return `/admin?${q.toString()}`;
}

function Filter({
  label,
  k,
  values,
  names,
  filters,
  demo,
}: {
  label: string;
  k: Key;
  values: readonly string[];
  names?: Record<string, string>;
  filters: FeedbackFilters;
  demo: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="admin-label w-16 shrink-0">{label}</span>
      <nav className="admin-seg max-w-full overflow-x-auto" aria-label={label}>
        <Link href={hrefWith(filters, demo, k, undefined)} prefetch={false} aria-current={!filters[k] ? "page" : undefined}>
          All
        </Link>
        {values.map((v) => (
          <Link key={v} href={hrefWith(filters, demo, k, v)} prefetch={false} aria-current={filters[k] === v ? "page" : undefined}>
            {names?.[v] ?? v}
          </Link>
        ))}
      </nav>
    </div>
  );
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="admin-label mb-1.5">{title}</p>
      {children}
    </div>
  );
}

function Diagnostics({ d }: { d: Record<string, unknown> }) {
  const { log, ...rest } = d as { log?: unknown } & Record<string, unknown>;
  const lines = Array.isArray(log) ? log.map(String) : typeof log === "string" ? log.split("\n") : [];
  return (
    <div className="grid gap-2">
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-[var(--radius-control)] bg-[var(--a-wash)] p-3 text-[11.5px] leading-[1.55] text-[var(--a-ink-2)]">
        {JSON.stringify(rest, null, 2)}
      </pre>
      {lines.length ? (
        <pre className="max-h-72 overflow-auto rounded-[var(--radius-control)] bg-[var(--a-wash)] p-3 text-[11px] leading-[1.6] text-[var(--a-ink-2)]">
          {lines.join("\n")}
        </pre>
      ) : null}
    </div>
  );
}

function Item({ item, demo }: { item: FeedbackItem; demo: boolean }) {
  const mail = item.email
    ? `mailto:${item.email}?subject=${encodeURIComponent(`Re: your ${brand.name} ${item.kind === "idea" ? "idea" : "feedback"}`)}&body=${encodeURIComponent(
        `\n\n> ${item.message.split("\n").join("\n> ")}`,
      )}`
    : null;
  return (
    <details className="group border-b border-[var(--a-line)] last:border-0">
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 hover:bg-[var(--a-wash)] [&::-webkit-details-marker]:hidden">
        <span className="admin-pill shrink-0" data-tone={STATUS_TONE[item.status] ?? "plain"}>
          {STATUS_LABEL[item.status] ?? item.status}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 [overflow-wrap:anywhere] group-open:line-clamp-none">{item.message}</span>
          <span className="admin-meta mt-0.5 block">
            {KIND_LABEL[item.kind] ?? item.kind} · {SOURCE_LABEL[item.source] ?? item.source} · {item.version} · {OS_LABEL[item.os] ?? item.os} ·{" "}
            {item.plan}
            {item.diagnostics ? " · diagnostics" : ""}
            {item.example ? " · example" : ""}
            {item.note ? " · noted" : ""}
          </span>
        </span>
        <span className="admin-meta shrink-0 whitespace-nowrap">{when(item.created)}</span>
      </summary>
      <div className="grid gap-4 px-4 pb-4 pt-1">
        <Block title="Message">
          <p className="ink-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{item.message}</p>
          <p className="admin-meta mt-1">{item.email ? `Reply to ${item.email}` : "No email given"}</p>
        </Block>
        {item.example ? (
          <Block title={`Example: ${item.example.card === "answer" ? "answer card" : "suggestion"} (${item.example.kind})`}>
            <div className="grid gap-1.5 rounded-[var(--radius-control)] bg-[var(--a-wash)] p-3 text-[12.5px]">
              <p className="[overflow-wrap:anywhere]">
                <span className="admin-meta">Asked </span>
                {item.example.question || "—"}
              </p>
              {item.example.answer ? (
                <p className="ink-2 whitespace-pre-wrap [overflow-wrap:anywhere]">
                  <span className="admin-meta">Answered </span>
                  {item.example.answer}
                </p>
              ) : null}
            </div>
          </Block>
        ) : null}
        {item.diagnostics ? (
          <Block title="Diagnostics">
            <Diagnostics d={item.diagnostics} />
          </Block>
        ) : null}
        <div className="flex flex-wrap items-end gap-3">
          <form action={updateFeedbackStatus} className="flex items-center gap-1.5">
            <input type="hidden" name="id" value={item.id} />
            {demo ? <input type="hidden" name="demo" value="1" /> : null}
            {FEEDBACK_STATUSES.filter((s) => s !== item.status).map((s) => (
              <button key={s} type="submit" name="status" value={s} className="admin-btn">
                Mark {STATUS_LABEL[s].toLowerCase()}
              </button>
            ))}
          </form>
          {mail ? (
            <a href={mail} className="admin-btn">
              Reply by email
            </a>
          ) : null}
        </div>
        <form action={updateFeedbackNote} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={item.id} />
          {demo ? <input type="hidden" name="demo" value="1" /> : null}
          <input name="note" defaultValue={item.note} maxLength={2000} placeholder="Add a note (only admins see it)" className={`${adminField} min-w-0 flex-1`} />
          <button type="submit" className="admin-btn">
            Save note
          </button>
        </form>
      </div>
    </details>
  );
}

export default async function FeedbackTab({ demo, searchParams }: { demo: boolean; searchParams: Record<string, string | string[] | undefined> }) {
  const filters = cleanFilters(searchParams);
  const inbox = await feedbackInbox(filters, demo);
  if (!inbox.ok) {
    return (
      <div className="admin-panel px-4 py-6 text-center">
        <p className="ink-3 text-[12px]">Feedback couldn&apos;t be read: {inbox.error}.</p>
      </div>
    );
  }
  const filtered = Object.values(filters).some(Boolean);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div className="admin-panel grid gap-2.5 px-4 py-3.5">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {FEEDBACK_STATUSES.map((s) => (
            <span key={s} className="admin-meta">
              {STATUS_LABEL[s]} <span className="text-[var(--a-ink)]">{inbox.counts[s] ?? 0}</span>
            </span>
          ))}
        </div>
        <Filter label="Status" k="status" values={FEEDBACK_STATUSES} names={STATUS_LABEL} filters={filters} demo={demo} />
        <Filter label="Type" k="kind" values={FEEDBACK_KINDS} names={KIND_LABEL} filters={filters} demo={demo} />
        <Filter label="From" k="source" values={FEEDBACK_SOURCES} names={SOURCE_LABEL} filters={filters} demo={demo} />
        <Filter label="Platform" k="os" values={FEEDBACK_OS} names={OS_LABEL} filters={filters} demo={demo} />
        {inbox.versions.length ? <Filter label="Version" k="version" values={inbox.versions} filters={filters} demo={demo} /> : null}
      </div>
      <div className="admin-panel overflow-hidden">
        {inbox.items.length ? (
          inbox.items.map((i) => <Item key={i.id} item={i} demo={demo} />)
        ) : (
          <p className="ink-3 px-4 py-8 text-center text-[12px]">
            {filtered ? "Nothing matches these filters." : "No feedback yet. Reports from the app’s Send feedback dialog, 👎 on cards and voice land here."}
          </p>
        )}
      </div>
      <p className="admin-meta">
        Kept 180 days, or 30 days after it’s marked done. Showing the newest 200{filtered ? " that match" : ""}.
      </p>
    </div>
  );
}
