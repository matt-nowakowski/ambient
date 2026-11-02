"use client";

import { useRef, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { brand } from "@/lib/brand";
import { Toast } from "./toast";
import { Arrow } from "./ui";

const TRACK = 320; // px, shrinks to the container on small screens
const KNOB = 48;
const PAD = 4;
/** Reaching this far while dragging locks the claim in, no release needed. */
const LOCK = 0.97;
/** Releasing past this, or flicking right past half way, also claims. */
const THRESHOLD = 0.8;
const FLICK = 0.6; // px per ms
const SPRING = { type: "spring", stiffness: 520, damping: 38 } as const;

/** A soft rising three-note chime, synthesized (no audio file). Quiet on purpose. */
function chime() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.gain.exponentialRampToValueAtTime(0.14, now + 0.04);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
    master.connect(ctx.destination);
    [659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0.0001;
      gain.gain.exponentialRampToValueAtTime(0.6 / (i + 1), now + 0.05 + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
      osc.connect(gain).connect(master);
      osc.start(now + i * 0.09);
      osc.stop(now + 1.7);
    });
    setTimeout(() => ctx.close(), 2000);
  } catch {
    // No audio: the claim works just the same.
  }
}

/** "Slide to claim": drag the knob across (or press it) to open a Polar
 * checkout with the gift code pre-applied. A chime plays on success. */
export function GiftClaim({ code }: { code: string }) {
  const reduce = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [state, setState] = useState<"idle" | "claiming">("idle");
  const [toast, setToast] = useState<string | null>(null);
  const drag = useRef<{ start: number; from: number; lastX: number; lastT: number; v: number } | null>(null);
  const [pressed, setPressed] = useState(false);

  const travel = () => (trackRef.current?.clientWidth ?? TRACK) - KNOB - PAD * 2;
  const progress = useTransform(x, (v) => Math.min(1, Math.max(0, v / travel())));
  const labelOpacity = useTransform(progress, [0, 0.5], [1, 0]);
  const labelX = useTransform(progress, [0, 1], [0, 24]);
  const fillWidth = useTransform(x, (v) => v + KNOB);
  const fillOpacity = useTransform(progress, [0, 1], [0.05, 0.14]);

  async function claim() {
    if (state === "claiming") return;
    drag.current = null;
    setPressed(false);
    setState("claiming");
    animate(x, travel(), reduce ? { duration: 0 } : SPRING);
    chime();
    navigator.vibrate?.(12);
    const started = Date.now();
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: "pro", gift: code }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
      if (res.ok && data.url) {
        // Let the chime land before leaving the page.
        setTimeout(() => window.location.assign(data.url!), Math.max(0, 700 - (Date.now() - started)));
        return;
      }
      setToast(
        res.status === 503
          ? `Checkout isn’t open yet. Email ${brand.supportEmail} and we’ll set you up.`
          : data.message || "Something went wrong. Please try again.",
      );
    } catch {
      setToast("Network error. Check your connection and try again.");
    }
    setState("idle");
    animate(x, 0, SPRING);
  }

  // The drag is tracked on the window, so it keeps following the pointer
  // wherever it goes (pointer capture alone isn't reliable everywhere).
  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (state === "claiming" || e.button !== 0) return;
    e.preventDefault();
    drag.current = { start: e.clientX, from: x.get(), lastX: e.clientX, lastT: e.timeStamp, v: 0 };
    setPressed(true);
    const move = (ev: PointerEvent) => onPointerMove(ev);
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (ev.type === "pointercancel") {
        drag.current = null;
        setPressed(false);
        animate(x, 0, SPRING);
      } else onPointerUp(ev);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }
  function onPointerMove(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.v = 0.7 * d.v + 0.3 * ((e.clientX - d.lastX) / dt);
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    const max = travel();
    const raw = d.from + e.clientX - d.start;
    // Rubber-band a little past either end instead of a hard stop.
    const next = raw < 0 ? raw / 4 : raw > max ? max + (raw - max) / 4 : raw;
    x.set(next);
    // At the end of the track the claim locks in, like an unlock slider.
    if (next / max >= LOCK) claim();
  }
  function onPointerUp(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setPressed(false);
    const moved = Math.abs(e.clientX - d.start);
    const p = progress.get();
    // A tap without a slide still claims: the knob is a real button.
    if (p >= THRESHOLD || (p > 0.5 && d.v > FLICK) || moved < 4) claim();
    else animate(x, 0, SPRING);
  }

  const claiming = state === "claiming";
  const label = "Slide to claim your gift";

  return (
    <>
      <div
        ref={trackRef}
        className="relative mx-auto h-14 w-full select-none overflow-hidden rounded-full border border-[var(--border)] bg-[var(--foreground)]/[0.035] shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]"
        style={{ maxWidth: TRACK, touchAction: "pan-y" }}
      >
        {/* The trail behind the knob, filling as it slides. */}
        <motion.div
          aria-hidden="true"
          className="absolute inset-y-1 left-1 rounded-full bg-[var(--foreground)]"
          style={{ width: fillWidth, opacity: claiming ? 0.14 : fillOpacity }}
        />
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center pl-12 text-[14px] tracking-[-0.005em]"
          style={{ opacity: claiming ? 0 : labelOpacity, x: labelX }}
        >
          <span className={reduce ? "text-muted" : "t-shimmer"} data-text={label}>
            {label}
          </span>
        </motion.span>
        {claiming ? (
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center pr-12 text-[14px] text-muted"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduce ? 0 : 0.25, duration: 0.3 }}
          >
            Opening checkout…
          </motion.span>
        ) : null}
        <motion.button
          type="button"
          aria-label={claiming ? "Opening checkout" : "Claim your gift"}
          aria-busy={claiming}
          disabled={claiming}
          onPointerDown={onPointerDown}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
              e.preventDefault();
              claim();
            }
          }}
          className="absolute left-1 top-1 flex cursor-grab items-center justify-center rounded-full bg-[var(--inverse)] text-[var(--inverse-fg)] shadow-[0_1px_2px_rgba(0,0,0,0.12),0_4px_14px_rgba(0,0,0,0.16)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--foreground)]/40 active:cursor-grabbing"
          style={{ x, width: KNOB, height: KNOB }}
          animate={{ scale: pressed ? 0.94 : 1 }}
          transition={SPRING}
        >
          {claiming ? (
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-4">
              <motion.path
                d="M3.5 8.5 6.5 11.5 12.5 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: reduce ? 1 : 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
              />
            </svg>
          ) : (
            <Arrow className="size-4" />
          )}
        </motion.button>
      </div>
      <p className="sr-only" aria-live="polite">
        {claiming ? "Opening checkout…" : ""}
      </p>
      <Toast message={toast} onClose={() => setToast(null)} />
    </>
  );
}
