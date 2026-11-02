import React, { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";

type Shape = "dot" | "bar" | "square";

interface Particle {
  dx: number;
  dy: number;
  fall: number;
  spin: number;
  size: number;
  shape: Shape;
  live: boolean;
  tone: 0 | 1 | 2;
  delay: number;
  duration: number;
}

const TONES = ["var(--color-text)", "var(--color-ink-2)", "var(--color-ink-3)"];
const SHAPES: Shape[] = ["dot", "bar", "square"];

/** Seeded, so a re-render doesn't reshuffle a burst mid-flight. */
const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const makeParticles = (
  count: number,
  spread: number,
  seed: number,
  rise: boolean,
  toward: number,
) => {
  const r = rng(seed);
  return Array.from({ length: count }, (_, i): Particle => {
    // Mostly downward and outward, as from something hung up high.
    const angle = Math.PI * (0.05 + r() * 0.9) + (r() - 0.5) * 0.6;
    const dist = spread * (0.5 + r() * 0.5);
    return {
      dx: Math.abs(Math.cos(angle)) * dist * (r() < 0.8 ? toward : -toward),
      dy: (rise ? -1 : 1) * Math.sin(angle) * dist * 0.7 - 30 * r(),
      fall: 60 + r() * 90,
      spin: (r() - 0.5) * 540,
      size: 4 + r() * 5,
      shape: SHAPES[Math.floor(r() * SHAPES.length)],
      // One accent: the recording red, on a few.
      live: i % 9 === 4,
      tone: Math.floor(r() * 3) as 0 | 1 | 2,
      delay: r() * 0.12,
      duration: 0.9 + r() * 0.45,
    };
  });
};

/**
 * A soft burst of monochrome confetti (with a red accent) from a point.
 * Decorative, under Try it's panel (z 4); nothing under reduced motion. Re-key to play again.
 */
export const Celebration: React.FC<{
  x: number;
  y: number;
  count?: number;
  spread?: number;
  seed?: number;
  /** Burst upward first (from a taskbar at the bottom), then fall. */
  rise?: boolean;
  /** Most fly this way (-1 left, 1 right), clear of what's beside the point. */
  toward?: -1 | 1;
}> = ({
  x,
  y,
  count = 44,
  spread = 380,
  seed = 7,
  rise = false,
  toward = -1,
}) => {
  const reduce = useReducedMotion();
  const particles = useMemo(
    () => makeParticles(count, spread, seed, rise, toward),
    [count, spread, seed, rise, toward],
  );
  if (reduce) return null;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[3] overflow-hidden"
    >
      {particles.map((p, i) => (
        <motion.i
          key={i}
          className="absolute block"
          style={{
            left: x,
            top: y,
            width: p.shape === "bar" ? p.size * 0.45 : p.size,
            height: p.shape === "bar" ? p.size * 1.8 : p.size,
            marginLeft: -p.size / 2,
            marginTop: -p.size / 2,
            borderRadius:
              p.shape === "dot" ? "50%" : p.shape === "bar" ? 2 : 2.5,
            background: p.live ? "var(--onb-live)" : TONES[p.tone],
          }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.3, rotate: 0 }}
          animate={{
            x: [0, p.dx, p.dx * 1.12],
            y: [0, p.dy, p.dy + p.fall],
            opacity: [0, 1, 1, 0],
            scale: [0.3, 1, 1, 0.8],
            rotate: [0, p.spin * 0.6, p.spin],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            times: [0, 0.38, 1],
            ease: [
              [0.15, 0.85, 0.35, 1],
              [0.45, 0, 0.75, 0.6],
            ],
            opacity: {
              duration: p.duration,
              delay: p.delay,
              times: [0, 0.08, 0.7, 1],
            },
            scale: {
              duration: p.duration,
              delay: p.delay,
              times: [0, 0.2, 0.7, 1],
            },
          }}
        />
      ))}
    </span>
  );
};
