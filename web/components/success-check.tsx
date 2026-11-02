"use client";

import { useEffect, useState } from "react";

/** transitions.dev "success check": the check rotates, bobs and draws in. */
export function SuccessCheck({ size = 56 }: { size?: number }) {
  const [state, setState] = useState<"idle" | "in">("idle");
  useEffect(() => {
    const id = requestAnimationFrame(() => setState("in"));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <span className="t-success-check" data-state={state} aria-hidden="true">
      <span
        className="glass-strong flex items-center justify-center rounded-full"
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 24 24" fill="none" style={{ width: size * 0.42, height: size * 0.42 }}>
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </span>
  );
}
