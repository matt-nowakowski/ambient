"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { brand } from "@/lib/brand";
import { agentModes } from "@/lib/content";
import { spring } from "./motion";
import { Orb } from "./orb/Orb";
import { OrbIcon, orbIconSize } from "./orb-icon";

type Mode = (typeof agentModes)[number]["k"];

const white = { "--orb-fg": "#ffffff", "--orb-rest-ink": 0.22, "--orb-ring-rest-ink": 0.3 } as CSSProperties;
const SAY_MS = 1700;
const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const SHOW_MS = 4600;

const windows: Record<Mode, string> = {
  Write: "Slack · #launch",
  Answer: "Safari",
  Act: "Notes",
  Recall: "Notes",
};

/** Faint lines standing in for whatever window is in front. */
function Backdrop() {
  return (
    <div className="space-y-3 pt-1">
      {[78, 64, 86, 52, 70, 40].map((w, i) => (
        <span key={i} className="block h-2.5 rounded-full bg-foreground/[0.06]" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

function Card({ children, orb }: { children: ReactNode; orb: "B2" | "S3" | "G3" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.96, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -6, scale: 0.98, filter: "blur(4px)" }}
      transition={spring}
      style={{ transformOrigin: "100% 0%" }}
      className="glass-strong absolute left-4 right-4 top-4 rounded-[18px] p-4 sm:left-auto sm:w-[300px]"
    >
      <div className="flex items-start gap-3">
        <OrbIcon variant={orb} footprint={15} className="mt-0.5" />
        <div className="min-w-0 text-[13px] leading-relaxed">{children}</div>
      </div>
    </motion.div>
  );
}

function Result({ mode }: { mode: Mode }) {
  switch (mode) {
    case "Write":
      return (
        <motion.div
          key="write"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-x-5 bottom-[76px] rounded-[14px] px-4 py-3 text-[14px] font-light text-foreground ring-[0.5px] ring-border-strong"
        >
          Hey, can we push the sync to Thursday?
          <span className="caret ml-px inline-block h-[1.05em] w-px translate-y-[3px] bg-foreground" />
        </motion.div>
      );
    case "Answer":
      return (
        <Card key="answer" orb="B2">
          <p className="text-foreground">For everyday use they show the same time.</p>
          <p className="mt-1 text-muted">GMT is a time zone. UTC is the standard clocks are set by, and it never changes for summer.</p>
          <p className="mt-2.5 text-[11.5px] text-subtle">2 sources · Insert · Copy</p>
        </Card>
      );
    case "Act":
      return (
        <Card key="act" orb="S3">
          <p className="text-foreground">Added to Calendar</p>
          <p className="mt-1 text-muted">Lunch with Ana · Friday, 1:00 pm</p>
          <p className="mt-2.5 text-[11.5px] text-subtle">In your Mac’s own Calendar</p>
        </Card>
      );
    case "Recall":
      return (
        <Card key="recall" orb="G3">
          <p className="text-foreground">Yesterday at 4:12 pm, in Slack:</p>
          <p className="mt-1 text-muted">
            “Keep Pro at ${brand.pricing.proMonthly}, and lead with ${brand.pricing.proYearlyPerMonth} on annual.”
          </p>
          <p className="mt-2.5 text-[11.5px] text-subtle">From your dictation history</p>
        </Card>
      );
  }
}

/** The voice agent: one key, four outcomes, cycling. Illustrative mock. */
export function AgentDemo() {
  const [i, setI] = useState(0);
  const [stage, setStage] = useState<"say" | "show">("say");
  const [auto, setAuto] = useState(true);
  const reduced = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );

  useEffect(() => {
    if (reduced) return;
    const t =
      stage === "say"
        ? setTimeout(() => setStage("show"), SAY_MS)
        : auto
          ? setTimeout(() => {
              setI((n) => (n + 1) % agentModes.length);
              setStage("say");
            }, SHOW_MS)
          : undefined;
    return () => clearTimeout(t);
  }, [stage, auto, reduced]);

  const m = agentModes[i];
  const s: "say" | "show" = reduced ? "show" : stage;

  return (
    <div>
      <p className="sr-only">
        Demo of the voice agent. {agentModes.map((x) => `${x.k}: you say “${x.say}”. ${x.body}`).join(" ")}
      </p>
      <div aria-hidden="true" className="glass-strong overflow-hidden rounded-[24px]">
        <div className="flex h-11 items-center gap-2 border-b border-border px-4">
          <span className="size-[11px] rounded-full bg-foreground/10" />
          <span className="size-[11px] rounded-full bg-foreground/10" />
          <span className="size-[11px] rounded-full bg-foreground/10" />
          <span className="eyebrow ml-3 truncate">{windows[m.k]}</span>
        </div>
        <div className="relative h-[340px] px-5 py-5">
          <Backdrop />
          <AnimatePresence mode="wait">{s === "show" ? <Result key={m.k} mode={m.k} /> : null}</AnimatePresence>

          <div className="absolute inset-x-4 bottom-5 flex justify-center">
            <AnimatePresence mode="popLayout">
              {s === "say" ? (
                <motion.div
                  key={`say-${m.k}`}
                  initial={{ opacity: 0, y: 12, scale: 0.92, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: 8, scale: 0.95, filter: "blur(4px)" }}
                  transition={spring}
                  className="glass-dark flex h-10 max-w-full items-center gap-2.5 rounded-full pl-2.5 pr-4"
                >
                  <Orb variant="C2" size={orbIconSize("C2").size} style={white} />
                  <span className="rec-dot size-1.5 shrink-0 rounded-full bg-rec" />
                  <span className="truncate text-[12px] text-white/80">{m.say}</span>
                </motion.div>
              ) : (
                <motion.p
                  key={`said-${m.k}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="eyebrow flex h-10 items-center truncate"
                >
                  “{m.say}”
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-center">
        <div className="glass inline-flex gap-1 rounded-full p-1" role="group" aria-label="Agent outcomes">
          {agentModes.map((x, n) => (
            <button
              key={x.k}
              type="button"
              aria-pressed={n === i}
              onClick={() => {
                setAuto(false);
                setI(n);
                setStage(reduced ? "show" : "say");
              }}
              className={`h-8 rounded-full px-3.5 text-[12.5px] transition-colors duration-200 ${
                n === i ? "bg-[var(--toggle-pill)] text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {x.k}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
