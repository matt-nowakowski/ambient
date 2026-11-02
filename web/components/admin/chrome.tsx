import type { ReactNode } from "react";
import { logout } from "@/app/admin/login/actions";
import { refresh } from "@/app/admin/actions";
import type { AdminTab } from "@/lib/admin/tabs";
import { AdminTabs } from "./tabs";

/**
 * The static brand mark (brand/mark.svg geometry: four circles, top-left in
 * focus) in currentColor, so it follows the admin ink in light and dark. The
 * animated orb reads as a single dot at header sizes.
 */
export function BrandMark({ size = 30, className = "", id = "am" }: { size?: number; className?: string; id?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="Ambient">
      <defs>
        <filter id={`${id}-b1`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.30" />
        </filter>
        <filter id={`${id}-b2`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.92" />
        </filter>
        <filter id={`${id}-b3`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.61" />
        </filter>
      </defs>
      <g fill="currentColor">
        <circle cx="20.30" cy="20.30" r="7.80" />
        <circle cx="43.70" cy="20.30" r="8.27" opacity="0.5" filter={`url(#${id}-b1)`} />
        <circle cx="43.70" cy="43.70" r="8.49" opacity="0.26" filter={`url(#${id}-b2)`} />
        <circle cx="20.30" cy="43.70" r="8.38" opacity="0.38" filter={`url(#${id}-b3)`} />
      </g>
    </svg>
  );
}

/**
 * The header every admin page shares: the mark and title, the page's own
 * controls (children), Refresh and Sign out, then the section tabs.
 */
export function AdminHeader({
  email,
  demo,
  title,
  meta,
  tab = "customers",
  period,
  refreshTitle = "Refetch Polar customers",
  children,
}: {
  email: string;
  demo: boolean;
  title: string;
  meta?: string;
  tab?: AdminTab;
  period?: string;
  refreshTitle?: string;
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-[var(--a-line)] pb-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark size={30} />
          <div className="min-w-0">
            <div className="admin-title truncate">{title}</div>
            <div className="admin-meta truncate">
              {meta ? `${meta} · ` : ""}
              {email}
            </div>
          </div>
          {demo ? (
            <span className="admin-pill ml-1" data-tone="warning">
              Sample data
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {children}
          <form action={refresh}>
            <button className="admin-btn" type="submit" title={refreshTitle}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Refresh
            </button>
          </form>
          <form action={logout}>
            <button className="admin-btn" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <AdminTabs current={tab} period={period} demo={demo} className="mt-4" />
    </header>
  );
}

export const adminField =
  "h-9 w-full rounded-[9px] border border-[var(--a-line-strong)] bg-[var(--a-panel)] px-3 text-[13px] text-[var(--a-ink)] outline-none placeholder:text-[var(--a-ink-3)] focus-visible:outline-2 focus-visible:outline-[var(--a-ink)]";
