"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ADMIN_TABS, adminTabHref, type AdminTab } from "@/lib/admin/tabs";

/**
 * The admin section switch: a segmented control that scrolls sideways on a
 * phone, with the active tab kept in view. Links don't prefetch, so hovering
 * or showing the bar never renders (or fetches for) a tab nobody opened.
 */
export function AdminTabs({ current, period, demo, className = "" }: { current: AdminTab; period?: string; demo?: boolean; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }, [current]);
  return (
    <nav ref={ref} className={`admin-seg admin-seg-scroll admin-tabs ${className}`} aria-label="Admin sections">
      {ADMIN_TABS.map((t) => (
        <Link key={t.id} href={adminTabHref(t.id, { period, demo })} prefetch={false} aria-current={current === t.id ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
