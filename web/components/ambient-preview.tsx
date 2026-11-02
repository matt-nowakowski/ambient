"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import type { OrbVariant } from "./orb/Orb";
import { OrbIcon } from "./orb-icon";
import { spring } from "./motion";

type PreviewProps = {
  /** Window title. */
  window: string;
  /** First line, shown in the foreground colour. */
  heading: string;
  lines: ReactNode[];
  /** The one-line offer in the HUD bubble. */
  offer: string;
  meta: string;
  accept: string;
  orb?: OrbVariant;
};

/**
 * A window with a quiet HUD bubble offering the next step: how meeting nudges
 * and suggestions look in the app. Illustrative mock, not a screenshot.
 */
export function AmbientPreview({ preset }: { preset: "meeting" | "suggestion" }) {
  const { window: title, heading, lines, offer, meta, accept, orb = "S1" } = presets[preset];
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Visible most of the time; briefly dismissed, then offered again.
    const t = setTimeout(() => setOpen((o) => !o), open ? 7000 : 1200);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <div aria-hidden="true" className="glass-strong relative overflow-hidden rounded-[24px]">
      <div className="flex h-11 items-center gap-2 border-b border-border px-4">
        <span className="size-[11px] rounded-full bg-foreground/10" />
        <span className="size-[11px] rounded-full bg-foreground/10" />
        <span className="size-[11px] rounded-full bg-foreground/10" />
        <span className="eyebrow ml-3 truncate">{title}</span>
      </div>
      <div className="relative h-[390px] px-6 py-6 text-[14px] font-light leading-[1.7] text-muted sm:h-[360px]">
        <p className="text-foreground">{heading}</p>
        <ul className="mt-3 space-y-1">
          {lines.map((l, i) => (
            <li key={i} className={i === lines.length - 1 ? "text-foreground" : undefined}>
              {l}
              {i === lines.length - 1 ? (
                <span className="caret ml-px inline-block h-[1.05em] w-px translate-y-[3px] bg-foreground" />
              ) : null}
            </li>
          ))}
        </ul>

        <AnimatePresence>
          {open ? (
            <motion.div
              key="bubble"
              initial={{ opacity: 0, y: 10, scale: 0.94, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: 6, scale: 0.97, filter: "blur(4px)" }}
              transition={spring}
              style={{ transformOrigin: "100% 100%" }}
              className="glass-strong absolute bottom-5 left-4 right-4 rounded-[18px] p-4 sm:left-[38%] sm:right-6"
            >
              <div className="flex items-start gap-3">
                <OrbIcon variant={orb} footprint={15} className="mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[13.5px] leading-snug text-foreground">{offer}</p>
                  <p className="mt-1 text-[12px] text-subtle">{meta}</p>
                </div>
              </div>
              <div className="mt-3.5 flex items-center gap-2">
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-inverse px-3 text-[12px] text-inverse-fg">
                  {accept} <span className="text-[10px] opacity-60">↵</span>
                </span>
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] text-muted ring-[0.5px] ring-border-strong">
                  Not now <span className="text-[10px] opacity-60">esc</span>
                </span>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Mid-call: they asked you for something. */
const meetingPreview: PreviewProps = {
  window: "Notes · Q3 planning call",
  heading: "Q3 planning call · live",
  lines: [
    "— Linux packages ship before the October release",
    "— Maya owns pricing copy; review Thursday",
    "— Onboarding research moves to week 3",
    "— Them: can you send the Q3 numbers?",
  ],
  offer: "They asked you for the Q3 numbers.",
  meta: "From the last minute of the call",
  accept: "Find it",
  orb: "S1",
};

/** A date in an email thread. */
const suggestionPreview: PreviewProps = {
  window: "Mail · Re: Launch review",
  heading: "Re: Launch review",
  lines: [
    "Ana: Thanks for the deck, it reads well.",
    "Ana: Two small notes on the pricing slide.",
    "Ana: Can we walk through it on Thursday at 3pm?",
  ],
  offer: "Add “Launch review” on Thursday at 3pm to your calendar?",
  meta: "Spotted on this computer · nothing sent",
  accept: "Add it",
  orb: "C4",
};

const presets = { meeting: meetingPreview, suggestion: suggestionPreview };
