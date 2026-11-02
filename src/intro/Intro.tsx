import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { commands, type IntroTarget } from "@/bindings";
import { BRAND } from "@/lib/brand";
import "./intro.css";

// The skip hint and tagline were dropped on purpose: the mark is the moment.
// Any key or click still skips.

/** Seconds from first frame to handing over to the main window. */
const LENGTH = 3.6;
/** The B1 lens: four dots on the corners of a square, top-left in focus. */
const DOTS = [
  { x: -1, y: -1, a: 1, from: { x: -0.48, y: -0.42 } },
  { x: 1, y: -1, a: 0.5, from: { x: 0.5, y: -0.46 } },
  { x: 1, y: 1, a: 0.26, from: { x: 0.46, y: 0.5 } },
  { x: -1, y: 1, a: 0.38, from: { x: -0.5, y: 0.44 } },
];
/** The shrink into the main window: Apple's window-zoom curve. */
const MORPH = { duration: 0.62, ease: [0.32, 0.72, 0, 1] as const };
const GAP = 14; // half the distance between dot centres
const DOT = 17;

/** A soft two-note chime, synthesized (no audio file). Quiet on purpose. */
function chime() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.gain.exponentialRampToValueAtTime(0.12, now + 0.05);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);
    master.connect(ctx.destination);
    [523.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0.0001;
      gain.gain.exponentialRampToValueAtTime(
        0.6 / (i + 1),
        now + 0.08 + i * 0.12,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
      osc.connect(gain).connect(master);
      osc.start(now + i * 0.12);
      osc.stop(now + 3);
    });
    setTimeout(() => ctx.close(), 3500);
  } catch {
    // No audio: the intro is just as good silent.
  }
}

export default function Intro() {
  const reduce = useReducedMotion();
  // in: the mark; out: it shrinks into the main window (or fades, if the
  // window's spot isn't known).
  const [phase, setPhase] = useState<"in" | "out">("in");
  const [target, setTarget] = useState<IntroTarget | null>(null);
  const done = useRef(false);
  const vw = typeof window === "undefined" ? 1440 : window.innerWidth;
  const vh = typeof window === "undefined" ? 900 : window.innerHeight;

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    const handOver = (t: IntroTarget | null) => {
      setTarget(t);
      setPhase("out");
      // The main window opens exactly where the veil lands, then the intro
      // closes over it.
      setTimeout(
        () => commands.introFinished(),
        reduce ? 150 : t ? MORPH.duration * 1000 + 40 : 700,
      );
    };
    if (reduce) return handOver(null);
    commands.introTarget().then(handOver, () => handOver(null));
  }, [reduce]);

  useEffect(() => {
    if (!reduce) setTimeout(chime, 450);
    const end = setTimeout(finish, (reduce ? 1.8 : LENGTH) * 1000);
    const skip = () => finish();
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    return () => {
      clearTimeout(end);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [finish, reduce]);

  const out = phase === "out";
  const morph = out && target != null;
  const letters = Array.from(BRAND.slug);

  return (
    <motion.div
      className="intro-stage"
      initial={{ opacity: 0 }}
      animate={{ opacity: out && !morph ? 0 : 1 }}
      transition={{ duration: out ? 0.6 : 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* The veil becomes the main window: it shrinks to its frame. */}
      <motion.div
        className="intro-veil"
        data-morph={morph || undefined}
        initial={false}
        animate={
          morph
            ? {
                top: target.y,
                left: target.x,
                width: target.width,
                height: target.height,
                borderRadius: 12,
              }
            : { top: 0, left: 0, width: vw, height: vh, borderRadius: 0 }
        }
        transition={MORPH}
      />
      {!reduce && (
        <>
          {["a", "b"].map((k) => (
            <motion.div
              key={k}
              className={`intro-aurora intro-aurora-${k}`}
              animate={{ opacity: morph ? 0 : 0.38 }}
              transition={{ duration: 0.3 }}
            />
          ))}
        </>
      )}

      <motion.div
        className="intro-center"
        animate={
          out
            ? { scale: morph ? 0.5 : 0.86, opacity: 0, y: morph ? 0 : -6 }
            : { scale: 1, opacity: 1, y: 0 }
        }
        transition={{ duration: morph ? 0.36 : 0.55, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="intro-lockup">
          <div
            className="intro-orb"
            style={{ width: GAP * 2 + DOT, height: GAP * 2 + DOT }}
          >
            {!reduce && (
              <motion.span
                className="intro-bloom"
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: [0, 0.9, 0.35], scale: [0.3, 1.6, 1.2] }}
                transition={{ delay: 1.15, duration: 1.4, ease: "easeOut" }}
              />
            )}
            {DOTS.map((d, i) => (
              <motion.span
                key={i}
                className="intro-dot"
                style={{
                  width: DOT,
                  height: DOT,
                  left: GAP + d.x * GAP,
                  top: GAP + d.y * GAP,
                }}
                initial={
                  reduce
                    ? { opacity: 0 }
                    : {
                        x: d.from.x * vw,
                        y: d.from.y * vh,
                        opacity: 0,
                        scale: 2.4,
                        filter: "blur(14px)",
                      }
                }
                animate={{
                  x: 0,
                  y: 0,
                  opacity: reduce ? d.a : [0, 1, d.a],
                  scale: 1,
                  filter: "blur(0px)",
                }}
                transition={{
                  duration: reduce ? 0.4 : 1.15,
                  delay: reduce ? 0 : 0.25 + i * 0.07,
                  ease: [0.16, 1, 0.3, 1],
                  opacity: {
                    duration: reduce ? 0.4 : 1.6,
                    delay: reduce ? 0 : 0.25 + i * 0.07,
                    times: [0, 0.55, 1],
                  },
                }}
              />
            ))}
          </div>
          <span className="intro-word" aria-label={BRAND.slug}>
            {letters.map((ch, i) => (
              <motion.span
                key={i}
                initial={
                  reduce ? false : { opacity: 0, y: 18, filter: "blur(8px)" }
                }
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{
                  delay: 1.35 + i * 0.05,
                  duration: 0.6,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {ch}
              </motion.span>
            ))}
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}
