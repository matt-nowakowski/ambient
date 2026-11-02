"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Orb } from "./orb/Orb";
import { orbIconSize } from "./orb-icon";
import { spring } from "./motion";

type Phase = "idle" | "listening" | "polishing" | "typing" | "done";

const SPOKEN =
  "hi sam um so quick update on the launch uh we're on track for thursday and the team did great work getting the last pieces over the line the landing page is live and pricing goes out thursday thanks maya".split(
    " ",
  );
const FILLERS = new Set(["um", "uh", "so"]);

const POLISHED = `Hi Sam,

Quick update on the launch: we’re on track for Thursday, and the team did great work getting the last pieces over the line.

•  The landing page is live
•  Pricing goes out Thursday

Thanks,
Maya`;

const TIMING = { idle: 1100, word: 150, polishing: 1100, char: 16, done: 4200 };

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

const white = { "--orb-fg": "#ffffff", "--orb-rest-ink": 0.22, "--orb-ring-rest-ink": 0.3 } as CSSProperties;

export function HeroDemo({ shortcut = "⌥ Space" }: { shortcut?: string }) {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const [words, setWords] = useState(0);
  const [chars, setChars] = useState(0);
  const [visible, setVisible] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || !visible) return;
    let timer: ReturnType<typeof setTimeout>;
    switch (phase) {
      case "idle":
        timer = setTimeout(() => {
          setWords(0);
          setChars(0);
          setPhase("listening");
        }, TIMING.idle);
        break;
      case "listening":
        timer =
          words < SPOKEN.length
            ? setTimeout(() => setWords((w) => w + 1), TIMING.word)
            : setTimeout(() => setPhase("polishing"), 450);
        break;
      case "polishing":
        timer = setTimeout(() => setPhase("typing"), TIMING.polishing);
        break;
      case "typing":
        timer =
          chars < POLISHED.length
            ? setTimeout(() => setChars((c) => Math.min(POLISHED.length, c + 2)), TIMING.char * 2)
            : setTimeout(() => setPhase("done"), 100);
        break;
      case "done":
        timer = setTimeout(() => {
          setWords(0);
          setChars(0);
          setPhase("idle");
        }, TIMING.done);
        break;
    }
    return () => clearTimeout(timer);
  }, [phase, words, chars, reduced, visible]);

  const p: Phase = reduced ? "done" : phase;
  const shownChars = reduced ? POLISHED.length : chars;
  const showBody = p === "typing" || p === "done";
  const showPill = p === "listening" || p === "polishing";
  const seconds = Math.floor((words * TIMING.word) / 1000);

  return (
    <div ref={rootRef} className="relative">
      <p className="sr-only">
        Demo: a person holds the shortcut and says “{SPOKEN.join(" ")}”. On release, the speech is cleaned up — filler
        words removed, punctuation and a bulleted list added — and typed into an email draft.
      </p>
      <div aria-hidden="true" className="glass-strong overflow-hidden rounded-[24px]">
        {/* Title bar */}
        <div className="flex h-11 items-center gap-2 border-b border-border px-4">
          <span className="size-[11px] rounded-full bg-foreground/10" />
          <span className="size-[11px] rounded-full bg-foreground/10" />
          <span className="size-[11px] rounded-full bg-foreground/10" />
          <span className="eyebrow ml-3 truncate">New message</span>
        </div>

        <div className="divide-y divide-border border-b border-border text-[14px]">
          <div className="flex gap-3 px-5 py-2.5">
            <span className="w-14 shrink-0 text-subtle">To</span>
            <span className="truncate text-foreground">sam@northwind.co</span>
          </div>
          <div className="flex gap-3 px-5 py-2.5">
            <span className="w-14 shrink-0 text-subtle">Subject</span>
            <span className="truncate text-foreground">Launch update</span>
          </div>
        </div>

        <div className="relative px-5 pb-[148px] pt-5">
          {/* Body measure: ~62% of the email on desktop, full width on mobile. The
              invisible full text in the same grid cell reserves the final height
              so wrapping never shifts layout while typing. */}
          <div className="grid max-w-full text-[15px] font-light leading-[1.65] text-foreground sm:max-w-[62%]">
            <div className="invisible col-start-1 row-start-1 whitespace-pre-wrap" aria-hidden="true">
              {POLISHED}
            </div>
            <div className="col-start-1 row-start-1 whitespace-pre-wrap">
              {showBody ? POLISHED.slice(0, shownChars) : null}
              {p === "idle" || p === "typing" ? (
                <span className="caret ml-px inline-block h-[1.1em] w-px translate-y-[3px] bg-foreground" />
              ) : null}
            </div>
          </div>

          {/* Live transcript */}
          <div
            className={`absolute inset-x-5 bottom-[72px] text-center text-[11.5px] leading-relaxed transition-opacity duration-300 sm:text-[12px] ${
              showPill ? "opacity-100" : "opacity-0"
            }`}
          >
            {SPOKEN.slice(0, showPill ? words : 0).map((w, i) => {
              const filler = FILLERS.has(w) && p === "polishing";
              return (
                <span
                  key={i}
                  className={`transition-colors duration-300 ${filler ? "text-subtle/50 line-through" : "text-muted"}`}
                >
                  {w}{" "}
                </span>
              );
            })}
          </div>

          {/* Recording overlay pill (matches the app's overlay) */}
          <div className="absolute inset-x-0 bottom-5 flex justify-center">
            <AnimatePresence mode="popLayout">
              {showPill ? (
                <motion.div
                  key="pill"
                  layout
                  initial={{ opacity: 0, y: 12, scale: 0.92, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: 8, scale: 0.95, filter: "blur(4px)" }}
                  transition={spring}
                  className="glass-dark flex h-10 items-center gap-2.5 rounded-full pl-2.5 pr-4"
                >
                  {p === "polishing" ? (
                    <>
                      <Orb variant="S1" size={orbIconSize("S1").size} style={white} />
                      <span
                        className="t-shimmer text-[11px] tracking-[0.04em]"
                        data-text="Polishing"
                        style={{ "--shimmer-base": "rgba(255,255,255,0.45)", "--shimmer-highlight": "#fff" } as CSSProperties}
                      >
                        Polishing
                      </span>
                    </>
                  ) : (
                    <>
                      <Orb variant="C2" size={orbIconSize("C2").size} style={white} />
                      <span className="rec-dot size-1.5 rounded-full bg-rec" />
                      <Waveform />
                      <span className="w-7 text-[11px] tabular-nums text-white/60">
                        0:{String(seconds).padStart(2, "0")}
                      </span>
                    </>
                  )}
                </motion.div>
              ) : p === "idle" ? (
                <motion.div
                  key="hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="eyebrow flex h-10 items-center"
                >
                  hold {shortcut} and speak
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

const BAR_DELAYS = [0, 0.15, 0.3, 0.1, 0.45, 0.2, 0.35, 0.05, 0.25];

function Waveform() {
  return (
    <span className="flex h-4 items-center gap-[3px]">
      {BAR_DELAYS.map((d, i) => (
        <span
          key={i}
          className="wave-bar block h-4 w-[2px] rounded-full bg-white/90"
          style={{ animationDelay: `${-d}s`, animationDuration: `${0.75 + (i % 3) * 0.15}s` }}
        />
      ))}
    </span>
  );
}
