"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useReducedMotionPref, white } from "./agent-demo";
import { spring } from "./motion";
import { Orb } from "./orb/Orb";
import { orbIconSize } from "./orb-icon";

/**
 * Dictation as an assistant: what you say, rough, becomes what you meant.
 * Two cases cycle: tidied words, and an instruction written up as a message.
 * Illustrative mock.
 */
const EXAMPLES = [
  {
    app: "Slack · #launch",
    said: "um so the build is uh green now let's ship it",
    wrote: "The build is green now. Let’s ship it.",
    what: "Polished",
  },
  {
    app: "Mail · Sam",
    said: "tell Sam I can't make it today, be polite",
    wrote: "Hi Sam, I’m sorry, I can’t make it today. Could we find another time this week?",
    what: "Written for you",
  },
] as const;

type Stage = "say" | "write";
const MS: Record<Stage, number> = { say: 2000, write: 3800 };

export function WriteDemo() {
  const reduced = useReducedMotionPref();
  const [i, setI] = useState(0);
  const [stage, setStage] = useState<Stage>("say");

  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => {
      if (stage === "say") setStage("write");
      else {
        setI((n) => (n + 1) % EXAMPLES.length);
        setStage("say");
      }
    }, MS[stage]);
    return () => clearTimeout(t);
  }, [stage, reduced]);

  const ex = EXAMPLES[i];
  const s: Stage = reduced ? "write" : stage;

  return (
    <div>
      <p className="sr-only">
        Demo: {EXAMPLES.map((e) => `you say “${e.said}” and it types “${e.wrote}”`).join("; ")}.
      </p>
      <div aria-hidden="true" className="glass-strong overflow-hidden rounded-[24px]">
        <div className="flex h-11 items-center gap-2 border-b border-border px-4">
          <span className="size-[11px] rounded-full bg-foreground/10" />
          <span className="size-[11px] rounded-full bg-foreground/10" />
          <span className="size-[11px] rounded-full bg-foreground/10" />
          <span className="eyebrow ml-3 truncate">{ex.app}</span>
        </div>
        <div className="relative h-[200px] px-5 py-5">
          <AnimatePresence mode="wait">
            {s === "write" ? (
              <motion.div
                key={`wrote-${i}`}
                initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(4px)" }}
                transition={{ duration: 0.45 }}
              >
                <p className="text-[15px] font-light leading-[1.6] text-foreground">
                  {ex.wrote}
                  <span className="caret ml-px inline-block h-[1.05em] w-px translate-y-[3px] bg-foreground" />
                </p>
                <span className="glass mt-3 inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] text-muted">
                  {ex.what}
                </span>
              </motion.div>
            ) : (
              <motion.span
                key={`caret-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="caret inline-block h-[1.1em] w-px translate-y-[3px] bg-foreground"
              />
            )}
          </AnimatePresence>

          <div className="absolute inset-x-4 bottom-5 flex justify-center">
            <AnimatePresence mode="popLayout">
              {s === "say" ? (
                <motion.div
                  key={`say-${i}`}
                  initial={{ opacity: 0, y: 12, scale: 0.92, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: 8, scale: 0.95, filter: "blur(4px)" }}
                  transition={spring}
                  className="glass-dark flex h-10 max-w-full items-center gap-2.5 rounded-full pl-2.5 pr-4"
                >
                  <Orb variant="C2" size={orbIconSize("C2").size} style={white} />
                  <span className="rec-dot size-1.5 shrink-0 rounded-full bg-rec" />
                  <span className="truncate text-[12px] text-white/80">{ex.said}</span>
                </motion.div>
              ) : (
                <motion.p
                  key={`said-${i}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="eyebrow flex h-10 max-w-full items-center truncate"
                >
                  “{ex.said}”
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
