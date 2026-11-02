import "server-only";
import { getContact, resendApi, resendConfigured } from "../email/resend";
import { getPolar } from "../polar";
import { ambientProductIds, getPolarStats, type CustomerRow } from "./metrics";

/**
 * /admin/customers data. Customers come from Polar (the same cached read the
 * overview uses, `admin` tag, cleared by Refresh); email history and
 * marketing status come from Resend, fetched only when a page is viewed.
 * Nothing here touches the database.
 */

// ── Statuses and segments ────────────────────────────────────────────────
export const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "cancelling", label: "Cancelling" },
  { id: "trialing", label: "Trialing" },
  { id: "past_due", label: "Past due" },
  { id: "canceled", label: "Canceled" },
] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number]["id"];

export const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  cancelling: "Cancelling",
  trialing: "Trialing",
  past_due: "Past due",
  canceled: "Canceled",
  incomplete: "Incomplete",
  incomplete_expired: "Expired",
  unpaid: "Unpaid",
  paused: "Paused",
};
export const STATUS_TONE: Record<string, "moss" | "warning" | "error" | undefined> = {
  active: "moss",
  cancelling: "warning",
  past_due: "error",
  unpaid: "error",
};

export function matchesStatus(c: CustomerRow, f: StatusFilter) {
  if (f === "all") return true;
  if (f === "canceled") return !["active", "cancelling", "trialing", "past_due"].includes(c.status);
  return c.status === f;
}

export const SEGMENTS = [
  { id: "active", label: "All active", test: (c: CustomerRow) => c.status === "active" || c.status === "cancelling" },
  { id: "cancelling", label: "Cancelling", test: (c: CustomerRow) => c.status === "cancelling" },
  { id: "trialing", label: "Trialing", test: (c: CustomerRow) => c.status === "trialing" },
  { id: "past_due", label: "Past due", test: (c: CustomerRow) => c.status === "past_due" },
  {
    id: "canceled_60d",
    label: "Canceled in the last 60 days",
    test: (c: CustomerRow) =>
      matchesStatus(c, "canceled") && c.endsAt !== null && Date.parse(c.endsAt) >= Date.now() - 60 * 86_400_000 && Date.parse(c.endsAt) <= Date.now(),
  },
] as const;
export type SegmentId = (typeof SEGMENTS)[number]["id"];
export const segmentById = (id: string) => SEGMENTS.find((s) => s.id === id) ?? null;

// ── Templates an admin can send ──────────────────────────────────────────
export const ADMIN_TEMPLATES = [
  { id: "personal-note", label: "Personal note", marketing: false, single: false, hint: "Your own words in the branded layout." },
  { id: "welcome", label: "Welcome + sign-in steps (resend)", marketing: false, single: true, hint: "How to sign in with their email. Needs a live subscription." },
  { id: "highlight-ask", label: "Monthly highlight: Ask from any app", marketing: true, single: false, hint: "Marketing. Skips unsubscribed contacts." },
  { id: "highlight-meetings", label: "Monthly highlight: Meeting notes", marketing: true, single: false, hint: "Marketing. Skips unsubscribed contacts." },
  { id: "win-back", label: "Win-back", marketing: true, single: false, hint: "Marketing. For people whose plan ended about a month ago." },
] as const;
export type AdminTemplateId = (typeof ADMIN_TEMPLATES)[number]["id"];
export const templateById = (id: string | undefined) => ADMIN_TEMPLATES.find((t) => t.id === id) ?? null;

// ── List ─────────────────────────────────────────────────────────────────
export type CustomerList =
  | { ok: true; customers: CustomerRow[]; demo: boolean }
  | { ok: false; error: string; missingEnv?: string[] };

export async function getCustomers(demo: boolean): Promise<CustomerList> {
  if (demo) return { ok: true, customers: demoCustomers(), demo: true };
  const polar = await getPolarStats();
  if (!polar.ok) return { ok: false, error: polar.error, missingEnv: polar.missingEnv };
  return { ok: true, customers: polar.customers, demo: false };
}

// ── Resend reads ─────────────────────────────────────────────────────────
export type SentEmail = { id: string; to: string[]; subject: string; createdAt: string; lastEvent: string | null };

type ResendEmail = { id: string; to: string[] | string; subject: string; created_at: string; last_event?: string | null };

/** Newest first, paged until `since` or `maxPages` (100 per page). Resend keeps 30 days on Free. */
export async function listSentEmails(opts: { since: number; maxPages: number }): Promise<{ ok: true; emails: SentEmail[]; complete: boolean } | { ok: false; error: string }> {
  if (!resendConfigured()) return { ok: false, error: "RESEND_API_KEY is not set" };
  const emails: SentEmail[] = [];
  let after: string | undefined;
  for (let page = 0; page < opts.maxPages; page++) {
    const r = await resendApi<{ data?: ResendEmail[]; has_more?: boolean }>("GET", `/emails?limit=100${after ? `&after=${after}` : ""}`);
    if (!r.ok) return { ok: false, error: r.error };
    const items = r.data.data ?? [];
    for (const e of items) {
      const createdAt = new Date(e.created_at.replace(" ", "T")).toISOString();
      if (Date.parse(createdAt) < opts.since) return { ok: true, emails, complete: true };
      emails.push({ id: e.id, to: Array.isArray(e.to) ? e.to : [e.to], subject: e.subject, createdAt, lastEvent: e.last_event ?? null });
    }
    if (!r.data.has_more || items.length === 0) return { ok: true, emails, complete: true };
    after = items[items.length - 1].id;
  }
  return { ok: true, emails, complete: false };
}

export const DAILY_LIMIT = 100;

/** Emails sent in the last 24 hours against Resend Free's 100/day. Counted fresh, never cached. */
export async function dailyQuota(): Promise<{ ok: true; used: number; limit: number; remaining: number } | { ok: false; error: string }> {
  const r = await listSentEmails({ since: Date.now() - 86_400_000, maxPages: 3 });
  if (!r.ok) return r;
  const used = r.emails.reduce((n, e) => n + e.to.length, 0);
  return { ok: true, used, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - used) };
}

export type MarketingStatus = "subscribed" | "unsubscribed" | "not_a_contact" | "unknown";

export async function marketingStatus(email: string): Promise<MarketingStatus> {
  if (!resendConfigured()) return "unknown";
  const c = await getContact(email);
  if (!c) return "not_a_contact";
  return c.unsubscribed ? "unsubscribed" : "subscribed";
}

/** Every contact that has opted out (one list call per 100 contacts). */
export async function unsubscribedEmails(): Promise<{ ok: true; set: Set<string> } | { ok: false; error: string }> {
  if (!resendConfigured()) return { ok: false, error: "RESEND_API_KEY is not set" };
  const set = new Set<string>();
  let after: string | undefined;
  for (let page = 0; page < 30; page++) {
    const r = await resendApi<{ data?: { id: string; email: string; unsubscribed: boolean }[]; has_more?: boolean }>(
      "GET",
      `/contacts?limit=100${after ? `&after=${after}` : ""}`,
    );
    if (!r.ok) return { ok: false, error: r.error };
    const items = r.data.data ?? [];
    for (const c of items) if (c.unsubscribed) set.add(c.email.toLowerCase());
    if (!r.data.has_more || items.length === 0) break;
    after = items[items.length - 1].id;
  }
  return { ok: true, set };
}

// ── Detail (fetched on view) ─────────────────────────────────────────────
export type TimelineItem = { at: string; title: string; detail?: string; tone?: "moss" | "warning" | "error" };

export type CustomerDetail = {
  row: CustomerRow;
  createdAt: string;
  timeline: TimelineItem[];
  emails: { ok: true; items: SentEmail[]; complete: boolean } | { ok: false; error: string };
  marketing: MarketingStatus;
};

const REASON_LABEL: Record<string, string> = {
  purchase: "Purchase",
  subscription_create: "First payment",
  subscription_cycle: "Renewal",
  subscription_update: "Plan change",
  subscription_meter_cycle: "Usage",
};

const money = (cents: number, currency = "usd") =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: cents % 100 ? 2 : 0 });

export async function getCustomerDetail(id: string, demo: boolean): Promise<CustomerDetail | null> {
  if (demo) return demoDetail(id);
  const list = await getCustomers(false);
  // Only customers with an Ambient subscription: the Polar org is shared.
  const row = list.ok ? list.customers.find((c) => c.customerId === id) : undefined;
  const polar = getPolar();
  if (!row || !polar) return null;

  const productId = ambientProductIds();
  const timeline: TimelineItem[] = [];
  let createdAt = row.since;
  try {
    const customer = await polar.customers.get({ id });
    createdAt = customer.createdAt.toISOString();
    for await (const page of await polar.subscriptions.list({ customerId: id, productId, limit: 100 })) {
      for (const s of page.result.items) {
        const name = s.product?.name ?? "Subscription";
        timeline.push({ at: (s.startedAt ?? s.createdAt).toISOString(), title: `Started ${name}`, detail: `${money(s.amount, s.currency)} / ${s.recurringInterval}`, tone: "moss" });
        if (s.canceledAt) {
          timeline.push({
            at: s.canceledAt.toISOString(),
            title: s.cancelAtPeriodEnd && !s.endedAt ? "Canceled at period end" : "Canceled",
            detail: [s.customerCancellationReason, s.customerCancellationComment].filter(Boolean).join(" · ") || undefined,
            tone: "warning",
          });
        }
        if (s.pastDueAt) timeline.push({ at: s.pastDueAt.toISOString(), title: "Payment failed (past due)", tone: "error" });
        if (s.endedAt) timeline.push({ at: s.endedAt.toISOString(), title: `${name} ended` });
        if (s.pendingUpdate) {
          timeline.push({ at: s.pendingUpdate.appliesAt.toISOString(), title: "Scheduled plan change", detail: "Applies at the next renewal" });
        }
      }
    }
    for await (const page of await polar.orders.list({ customerId: id, productId, limit: 100 })) {
      for (const o of page.result.items) {
        timeline.push({
          at: o.createdAt.toISOString(),
          title: `${REASON_LABEL[o.billingReason] ?? "Order"}: ${money(o.totalAmount, o.currency)}`,
          detail: [o.product?.name, o.paid ? "paid" : o.status, o.refundedAmount ? `${money(o.refundedAmount, o.currency)} refunded` : null].filter(Boolean).join(" · "),
        });
      }
    }
  } catch (err) {
    timeline.push({ at: new Date().toISOString(), title: "Polar couldn't be read", detail: err instanceof Error ? err.message.slice(0, 120) : undefined, tone: "error" });
  }
  timeline.sort((a, b) => b.at.localeCompare(a.at));

  const email = row.email?.toLowerCase();
  const [sent, marketing] = await Promise.all([
    email ? listSentEmails({ since: Date.now() - 30 * 86_400_000, maxPages: 10 }) : Promise.resolve({ ok: false as const, error: "No email on this customer" }),
    email ? marketingStatus(email) : Promise.resolve("unknown" as const),
  ]);
  const emails: CustomerDetail["emails"] = sent.ok
    ? { ok: true, items: sent.emails.filter((e) => e.to.some((t) => t.toLowerCase() === email)), complete: sent.complete }
    : sent;

  return { row, createdAt, timeline, emails, marketing };
}

// ── Sample data (?demo=1), for screenshots and review ────────────────────
const FIRST = ["Ana", "Ben", "Chloé", "Dev", "Elif", "Farah", "Gus", "Hana", "Ivo", "Jun", "Kai", "Lea", "Mateo", "Noor", "Omar", "Priya", "Quinn", "Rosa", "Sam", "Tomás", "Uma", "Vik", "Wen", "Yara"];
const LAST = ["Silva", "Okafor", "Martin", "Patel", "Yılmaz", "Haddad", "Berg", "Sato", "Novak", "Chen", "Larsen", "Moreau", "García", "Rahman", "Aziz", "Shah", "Doyle", "Costa", "Reed", "Ruiz", "Iyer", "Rao", "Li", "Nasser"];
const DOMAINS = ["example.com", "example.org", "example.net"];

export function demoCustomers(): CustomerRow[] {
  const now = Date.UTC(2026, 10, 1);
  const statuses = ["active", "active", "active", "active", "cancelling", "active", "trialing", "past_due", "canceled", "active", "active", "canceled"];
  return FIRST.map((f, i) => {
    const status = statuses[i % statuses.length];
    const yearly = i % 3 === 0;
    const team = i % 11 === 5;
    const since = now - (12 + i * 9) * 86_400_000;
    const live = status === "active" || status === "past_due" || status === "cancelling";
    const periodEnd = now + ((i * 7) % 28 + 2) * 86_400_000;
    const amount = team ? 4000 : yearly ? 900 : 1200;
    return {
      customerId: `demo_${i}`,
      name: `${f} ${LAST[i]}`,
      email: `${f.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}.${LAST[i].toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}@${DOMAINS[i % 3]}`,
      plan: team ? "team" : "pro",
      product: team ? "Team (yearly)" : yearly ? "Pro (yearly)" : "Pro (monthly)",
      interval: yearly || team ? "year" : "month",
      status,
      since: new Date(since).toISOString(),
      mrrCents: live ? amount : 0,
      renewsAt: live && status !== "cancelling" ? new Date(periodEnd).toISOString() : null,
      endsAt: status === "cancelling" ? new Date(periodEnd).toISOString() : status === "canceled" ? new Date(now - (i + 5) * 86_400_000).toISOString() : null,
      subscriptionId: `demo_sub_${i}`,
    } satisfies CustomerRow;
  });
}

function demoDetail(id: string): CustomerDetail | null {
  const row = demoCustomers().find((c) => c.customerId === id);
  if (!row) return null;
  const since = Date.parse(row.since);
  const day = 86_400_000;
  const timeline: TimelineItem[] = [
    { at: new Date(since).toISOString(), title: `Started ${row.product}`, detail: row.interval === "year" ? "$108 / year" : "$12 / month", tone: "moss" },
    { at: new Date(since + 60_000).toISOString(), title: `First payment: ${row.interval === "year" ? "$108" : "$12"}`, detail: `${row.product} · paid` },
  ];
  if (row.interval === "month") {
    for (let t = since + 30 * day; t < Date.UTC(2026, 10, 1); t += 30 * day) {
      timeline.push({ at: new Date(t).toISOString(), title: "Renewal: $12", detail: `${row.product} · paid` });
    }
  }
  if (row.status === "cancelling") timeline.push({ at: new Date(Date.UTC(2026, 9, 28)).toISOString(), title: "Canceled at period end", detail: "too_expensive · “Love it, just tight this quarter.”", tone: "warning" });
  if (row.status === "past_due") timeline.push({ at: new Date(Date.UTC(2026, 9, 30)).toISOString(), title: "Payment failed (past due)", tone: "error" });
  timeline.sort((a, b) => b.at.localeCompare(a.at));
  const sent: SentEmail[] = [
    { id: "d1", to: [row.email!], subject: "Welcome to Ambient Pro. Here’s your key.", createdAt: new Date(since + 90_000).toISOString(), lastEvent: "opened" },
    { id: "d2", to: [row.email!], subject: "One thing worth trying: meeting notes, no bot", createdAt: new Date(Date.UTC(2026, 9, 14, 9)).toISOString(), lastEvent: "delivered" },
  ];
  if (row.status === "cancelling") sent.unshift({ id: "d3", to: [row.email!], subject: `Ambient Pro stays on until ${new Date(row.endsAt!).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, createdAt: new Date(Date.UTC(2026, 9, 28, 10)).toISOString(), lastEvent: "delivered" });
  return {
    row,
    createdAt: row.since,
    timeline,
    emails: { ok: true, items: sent.filter((e) => Date.parse(e.createdAt) > Date.UTC(2026, 9, 2)), complete: true },
    marketing: row.customerId === "demo_3" ? "unsubscribed" : "subscribed",
  };
}
