"use client";

import { useId, useState } from "react";
import type { FaqItem } from "@/lib/faqs";

/** FAQ accordion — transitions.dev "accordion expand" (grid-rows 0fr → 1fr + blur). */
export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="glass rounded-[22px] px-5 sm:px-7">
      <div className="divide-y divide-border">
        {items.map((f) => (
          <FaqRow key={f.q} item={f} />
        ))}
      </div>
    </div>
  );
}

function FaqRow({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="t-acc" data-open={open}>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          id={`${id}-btn`}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-6 py-5 text-left text-[14.5px] font-normal tracking-[-0.01em]"
        >
          {item.q}
          <span className="t-acc-chevron shrink-0 text-subtle" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none" className="size-3.5">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      </h3>
      <div className="t-acc-panel" id={`${id}-panel`} role="region" aria-labelledby={`${id}-btn`}>
        <div className="t-acc-panel-inner">
          <p className="max-w-2xl pb-5 pr-8 text-[13.5px] leading-relaxed text-muted">{item.a}</p>
        </div>
      </div>
    </div>
  );
}
