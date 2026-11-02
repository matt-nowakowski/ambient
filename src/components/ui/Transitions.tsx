/*
 * React wrappers for the transitions.dev snippets in src/styles/transitions.css
 * (Transitions.dev License, Copyright (c) 2026 Jakub Antalik / Transitions.dev).
 * The CSS owns the motion; these only flip the documented classes/attributes.
 */
import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { prefersReducedMotion } from "@/lib/utils/motion";

/** Reads a `--token: 150ms` duration from :root, in ms. */
const cssMs = (name: string, fallback: number): number => {
  const v = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name),
  );
  return Number.isFinite(v) ? v : fallback;
};

/* transitions.dev — Icon swap */
/** Cross-fades two icons in one slot: `a` while `swapped` is false, `b` after. */
export const IconSwap: React.FC<{
  swapped: boolean;
  a: React.ReactNode;
  b: React.ReactNode;
  className?: string;
}> = ({ swapped, a, b, className = "" }) => (
  <span
    className={`t-icon-swap ${className}`}
    data-state={swapped ? "b" : "a"}
  >
    <span className="t-icon" data-icon="a" aria-hidden={swapped}>
      {a}
    </span>
    <span className="t-icon" data-icon="b" aria-hidden={!swapped}>
      {b}
    </span>
  </span>
);

/* transitions.dev — Number pop-in */
/** Each character re-enters from below with blur whenever `text` changes;
 *  the last two ride in a stagger behind. */
export const NumberPopIn: React.FC<{ text: string; className?: string }> = ({
  text,
  className = "",
}) => {
  const chars = Array.from(text);
  return (
    <>
    <span className="sr-only">{text}</span>
    {/* Keyed on the text: a fresh group replays the keyframes. */}
    <span
      key={text}
      className={`t-digit-group is-animating ${className}`}
      aria-hidden="true"
    >
      {chars.map((ch, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="t-digit"
          data-stagger={
            i === chars.length - 2
              ? "1"
              : i === chars.length - 1 && chars.length > 1
                ? "2"
                : undefined
          }
        >
          {ch}
        </span>
      ))}
    </span>
    </>
  );
};

/* transitions.dev — Shimmer text */
/** An in-progress label with a highlight sweeping across the glyphs. */
export const Shimmer: React.FC<{
  text: string;
  active?: boolean;
  className?: string;
}> = ({ text, active = true, className = "" }) =>
  active ? (
    <span className={`t-shimmer ${className}`} data-text={text}>
      {text}
    </span>
  ) : (
    <span className={className}>{text}</span>
  );

/* transitions.dev — Text states swap */
/** Swaps its text in place: the old exits up with blur, the new enters
 *  from below (three-phase sequence from the snippet). */
export const TextSwap: React.FC<{ text: string; className?: string }> = ({
  text,
  className = "",
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(text);
  const [phase, setPhase] = useState<"" | "is-exit" | "is-enter-start">("");

  useEffect(() => {
    if (text === shown) return;
    if (prefersReducedMotion()) {
      setShown(text);
      return;
    }
    setPhase("is-exit");
    const id = window.setTimeout(() => {
      setShown(text);
      setPhase("is-enter-start");
    }, cssMs("--text-swap-dur", 150));
    return () => window.clearTimeout(id);
    // `shown` only trails `text`; re-running on it would restart the swap.
  }, [text]);

  useLayoutEffect(() => {
    if (phase !== "is-enter-start") return;
    void ref.current?.offsetHeight; // commit the "below" pose before easing back
    setPhase("");
  }, [phase]);

  return (
    <span ref={ref} className={`t-text-swap ${phase} ${className}`}>
      {shown}
    </span>
  );
};

/* transitions.dev — Success check */
/** A check that fades in, rotates upright, bobs and draws its stroke. */
export const SuccessCheck: React.FC<{
  show: boolean;
  size?: number;
  className?: string;
}> = ({ show, size = 16, className = "" }) => (
  <span
    className={`t-success-check ${className}`}
    data-state={show ? "in" : "out"}
    aria-hidden="true"
  >
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8.5 6.5 12 13 4.5" />
    </svg>
  </span>
);

/* transitions.dev — Skeleton loader and reveal */
/** Shows `skeleton` while loading, then cross-fades (with cross-blur) to the
 *  children. Once the reveal is over the wrapper steps aside, so nothing
 *  (filters, stacking) lingers around the real content. */
export const SkeletonReveal: React.FC<{
  loading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ loading, skeleton, children, className = "" }) => {
  const [phase, setPhase] = useState<"loading" | "revealing" | "done">(
    loading ? "loading" : "done",
  );
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (loading) {
      setPhase("loading");
      setRevealed(false);
      return;
    }
    if (phase !== "loading") return;
    if (prefersReducedMotion()) {
      setPhase("done");
      return;
    }
    setPhase("revealing");
    // One frame at rest so the reveal has somewhere to transition from.
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setRevealed(true)),
    );
    const id = window.setTimeout(
      () => setPhase("done"),
      cssMs("--reveal-dur", 400) + 50,
    );
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(id);
    };
    // Only the loading flag drives the sequence.
  }, [loading]);

  if (phase === "done") return <>{children}</>;
  return (
    <div
      className={`t-skel t-skel--flow ${revealed ? "is-revealed" : ""} ${className}`}
      style={{ "--pulse-count": "infinite" } as CSSProperties}
    >
      <div className="t-skel-skeleton is-pulsing">{skeleton}</div>
      {phase === "revealing" && (
        <div className="t-skel-content">{children}</div>
      )}
    </div>
  );
};

/* transitions.dev — Menu dropdown (open/close orchestration) */
/** Keeps a menu mounted through its close, flipping `.is-open` /
 *  `.is-closing` as the snippet's JS does. */
export const usePresence = (
  open: boolean,
): { mounted: boolean; className: string } => {
  const [mounted, setMounted] = useState(open);
  const [state, setState] = useState<"" | "is-open" | "is-closing">(
    open ? "is-open" : "",
  );

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Mount at the pre-open pose, then open on the next frame.
      const raf = requestAnimationFrame(() =>
        requestAnimationFrame(() => setState("is-open")),
      );
      return () => cancelAnimationFrame(raf);
    }
    if (!mounted) return;
    setState("is-closing");
    const id = window.setTimeout(
      () => {
        setMounted(false);
        setState("");
      },
      prefersReducedMotion() ? 0 : cssMs("--dropdown-close-dur", 150),
    );
    return () => window.clearTimeout(id);
    // `mounted` is read, not tracked: only `open` drives the sequence.
  }, [open]);

  return { mounted, className: state };
};
