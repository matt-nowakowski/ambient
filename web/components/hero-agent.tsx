"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Card, useReducedMotionPref, white } from "./agent-demo";
import { spring } from "./motion";
import { Orb } from "./orb/Orb";
import { MailWindow, type InboxRow, type MailMessage } from "./mail-window";
import { OrbIcon, orbIconSize } from "./orb-icon";

/**
 * The hero: a conversation with the agent, both ways. You ask and it answers,
 * you ask and it acts, then it notices a moment and offers to help. Illustrative mock.
 */

type Beat = "ask" | "act" | "nudge";
type Step =
  | { beat: Beat; kind: "say"; text: string; ms: number }
  | { beat: Beat; kind: "answer" | "act" | "offer" | "reply"; ms: number }
  | { beat: Beat; kind: "accept"; text: string; ms: number };

const STEPS: Step[] = [
  { beat: "ask", kind: "say", text: "when did Ana want to meet?", ms: 1800 },
  { beat: "ask", kind: "answer", ms: 3600 },
  { beat: "act", kind: "say", text: "add the launch review on Thursday at 3", ms: 1900 },
  { beat: "act", kind: "act", ms: 3200 },
  { beat: "nudge", kind: "offer", ms: 2800 },
  { beat: "nudge", kind: "accept", text: "yes, tell her Thursday works", ms: 1900 },
  { beat: "nudge", kind: "reply", ms: 4200 },
];

const BEATS: { k: Beat; label: string }[] = [
  { k: "ask", label: "You ask" },
  { k: "act", label: "It acts" },
  { k: "nudge", label: "It nudges you" },
];

/** The step shown for each beat when motion is reduced, or a beat is picked. */
const lastStep = (b: Beat) => STEPS.length - 1 - [...STEPS].reverse().findIndex((s) => s.beat === b);
const firstStep = (b: Beat) => STEPS.findIndex((s) => s.beat === b);
/** With reduced motion, each beat holds one still: the answer, the action, and the offer itself. */
const stillStep = (b: Beat) => (b === "nudge" ? STEPS.findIndex((s) => s.kind === "offer") : lastStep(b));

/** Ambient's cards sit at the bottom right, clear of the email and above the pill. */
const CARD = "absolute bottom-[72px] left-4 right-4 sm:left-auto sm:right-5 sm:w-[290px]";

const THREAD: MailMessage[] = [
  {
    from: "Ana Ruiz",
    email: "ana@northwind.co",
    time: "9:40 AM",
    lines: ["Thanks for the deck, it reads well. Can we walk through it on Thursday at 3pm?"],
    signoff: "Ana",
  },
];

const INBOX: InboxRow[] = [
  { from: "Ana Ruiz", subject: "Re: Launch review", preview: "Thanks for the deck, it reads well.", time: "9:40", unread: true },
  { from: "Priya Shah", subject: "Press kit", preview: "Draft attached for Friday.", time: "9:02", unread: true },
  { from: "Tom Berg", subject: "Pricing page", preview: "Signed off, ship it.", time: "Mon" },
  { from: "Sam Lee", subject: "Offsite", preview: "Three venue options below.", time: "Fri" },
  { from: "Priya Shah", subject: "Q3 numbers", preview: "Can you send them over?", time: "Thu" },
];

const REPLY = "Hi Ana, Thursday at 3 works for me. See you then.";

export function HeroAgent() {
  const reduced = useReducedMotionPref();
  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || !visible) return;
    const t = setTimeout(() => setI((n) => (n + 1) % STEPS.length), STEPS[i].ms);
    return () => clearTimeout(t);
  }, [i, reduced, visible]);

  const idx = reduced ? stillStep(STEPS[i].beat) : i;
  const step = STEPS[idx];
  const beat = step.beat;
  // What was last said in this beat, for the quiet caption once the result shows.
  const said = STEPS.slice(0, idx + 1).reverse().find((s) => s.beat === beat && "text" in s) as
    | { text: string }
    | undefined;

  const showOffer = step.kind === "offer" || step.kind === "accept";
  const pill = step.kind === "say" || step.kind === "accept" ? (step as { text: string }).text : null;

  return (
    <div ref={rootRef}>
      <p className="sr-only">
        Demo of talking with the agent. You ask “when did Ana want to meet?” and it answers: Thursday at 3pm. You
        say “add the launch review on Thursday at 3” and it adds the event to your calendar. Then it notices Ana is
        waiting on a reply and offers to help; you say “yes, tell her Thursday works” and the reply is written for you.
      </p>
      <div aria-hidden="true">
        <MailWindow subject="Re: Launch review" messages={THREAD} inbox={INBOX} heightClass="h-[440px] sm:h-[400px]">
          {/* The reply it writes for you */}
          <AnimatePresence>
            {step.kind === "reply" ? (
              <motion.div
                key="reply"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={spring}
                className="mt-4 overflow-hidden rounded-[14px] ring-[0.5px] ring-border-strong sm:max-w-[85%]"
              >
                <p className="flex items-center gap-1.5 border-b border-border px-4 py-2 text-[11.5px] text-subtle">
                  <span className="text-muted">To:</span> Ana
                  <span className="ml-auto">Re: Launch review</span>
                </p>
                <p className="min-h-[3.4em] px-4 py-2.5 text-foreground">
                  <Typed text={REPLY} instant={reduced} />
                  <span className="caret ml-px inline-block h-[1.05em] w-px translate-y-[3px] bg-foreground" />
                </p>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Its answer and its action: the glass card, bottom right, above what you said */}
          <AnimatePresence mode="wait">
            {step.kind === "answer" ? (
              <Card key="answer" orb="B2" place={CARD} origin="100% 100%">
                <p className="text-foreground">Thursday at 3pm.</p>
                <p className="mt-1 text-muted">In Ana’s last email, to walk through the deck.</p>
                <p className="mt-2.5 text-[11.5px] text-subtle">From this window</p>
              </Card>
            ) : step.kind === "act" ? (
              <Card key="act" orb="S3" place={CARD} origin="100% 100%">
                <p className="text-foreground">Added to Calendar</p>
                <p className="mt-1 text-muted">Launch review · Thursday, 3:00 pm</p>
                <p className="mt-2.5 text-[11.5px] text-subtle">Undo</p>
              </Card>
            ) : null}
          </AnimatePresence>

          {/* It notices, and offers: the HUD bubble, where the cards sit */}
          <AnimatePresence>
            {showOffer ? (
              <motion.div
                key="offer"
                initial={{ opacity: 0, y: 10, scale: 0.94, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: 6, scale: 0.97, filter: "blur(4px)" }}
                transition={spring}
                style={{ transformOrigin: "100% 100%" }}
                className={`glass-strong rounded-[18px] p-4 ${CARD}`}
              >
                <div className="flex items-start gap-3">
                  <OrbIcon variant="S1" footprint={15} className="mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[13.5px] leading-snug text-foreground">Ana is waiting on you. Reply to Ana?</p>
                    <p className="mt-1 text-[12px] text-subtle">Noticed on this computer · nothing sent</p>
                  </div>
                </div>
                <div className="mt-3.5 flex items-center gap-2">
                  <span
                    className={`inline-flex h-7 items-center gap-1.5 rounded-full bg-inverse px-3 text-[12px] text-inverse-fg transition-transform duration-300 ${
                      step.kind === "accept" ? "scale-105" : ""
                    }`}
                  >
                    Reply <span className="text-[10px] opacity-60">↵</span>
                  </span>
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] text-muted ring-[0.5px] ring-border-strong">
                    Not now <span className="text-[10px] opacity-60">esc</span>
                  </span>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* What you say: the recording pill, then a quiet caption */}
          <div className="absolute inset-x-4 bottom-5 flex justify-center">
            <AnimatePresence mode="popLayout">
              {pill ? (
                <motion.div
                  key={`say-${idx}`}
                  initial={{ opacity: 0, y: 12, scale: 0.92, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: 8, scale: 0.95, filter: "blur(4px)" }}
                  transition={spring}
                  className="glass-dark flex h-10 max-w-full items-center gap-2.5 rounded-full pl-2.5 pr-4"
                >
                  <Orb variant="C2" size={orbIconSize("C2").size} style={white} />
                  <span className="rec-dot size-1.5 shrink-0 rounded-full bg-rec" />
                  <span className="truncate text-[12px] text-white/80">{pill}</span>
                </motion.div>
              ) : said && step.kind !== "offer" ? (
                <motion.p
                  key={`said-${beat}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="eyebrow flex h-10 items-center truncate"
                >
                  “{said.text}”
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>
        </MailWindow>
      </div>

      <div className="mt-4 flex justify-center">
        <div className="glass inline-flex gap-1 rounded-full p-1" role="group" aria-label="Talking with the agent">
          {BEATS.map((b) => (
            <button
              key={b.k}
              type="button"
              aria-pressed={beat === b.k}
              onClick={() => setI(reduced ? stillStep(b.k) : firstStep(b.k))}
              className={`h-8 rounded-full px-3.5 text-[12.5px] transition-colors duration-200 ${
                beat === b.k ? "bg-[var(--toggle-pill)] text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Types the text out once, a few characters at a time. */
function Typed({ text, instant }: { text: string; instant: boolean }) {
  const [n, setN] = useState(instant ? text.length : 0);
  useEffect(() => {
    if (instant || n >= text.length) return;
    const t = setTimeout(() => setN((c) => Math.min(text.length, c + 2)), 32);
    return () => clearTimeout(t);
  }, [n, text, instant]);
  return <>{text.slice(0, instant ? text.length : n)}</>;
}
