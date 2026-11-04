/** The /admin sections. Shared by the tab bar (client) and the pages (server). */
export const ADMIN_TABS = [
  { id: "overview", label: "Overview" },
  { id: "installs", label: "Installs" },
  { id: "revenue", label: "Revenue" },
  { id: "usage", label: "Usage" },
  { id: "costs", label: "Costs" },
  { id: "dependencies", label: "Dependencies" },
  { id: "orgs", label: "Orgs" },
  { id: "agent", label: "Agent health" },
  { id: "feedback", label: "Feedback" },
  { id: "customers", label: "Customers" },
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number]["id"];

/** The tabs rendered by app/admin/page.tsx; Customers has its own route. */
export type DashboardTab = Exclude<AdminTab, "customers">;

export function parseTab(v: unknown): DashboardTab {
  return ADMIN_TABS.some((t) => t.id === v && t.id !== "customers") ? (v as DashboardTab) : "overview";
}

/** `/admin?tab=…` for the dashboard tabs, `/admin/customers` for Customers. Keeps the period and demo flags. */
export function adminTabHref(tab: AdminTab, opts: { period?: string; demo?: boolean } = {}) {
  if (tab === "customers") return `/admin/customers${opts.demo ? "?demo=1" : ""}`;
  const q = new URLSearchParams();
  if (tab !== "overview") q.set("tab", tab);
  if (opts.period && opts.period !== "month") q.set("period", opts.period);
  if (opts.demo) q.set("demo", "1");
  const s = q.toString();
  return s ? `/admin?${s}` : "/admin";
}
