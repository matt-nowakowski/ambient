/*
 * A liquid active-item indicator: a pill that flows between items. Its edges
 * travel separately — the leading edge sets off first and the trailing edge
 * catches up — so on the way it stretches into a drop and settles back into
 * a pill on arrival.
 *
 * It used to be drawn by liquid-gooey's `move` effect (an SVG goo layer that
 * trails a transparent pill). That layer only repaints from a rAF loop that
 * sleeps when idle; in the app's WKWebView it could miss the wake-up and stay
 * painted on the first item (the sidebar kept highlighting Home). The pill
 * now paints itself, so what you see is always where the active item is.
 */
import React, { useLayoutEffect, useRef, useState } from "react";

interface Edges {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

interface PillState {
  edges: Edges;
  /** Per-edge transition, chosen from the direction of travel. */
  transition: string;
}

// Leading edge, trailing edge (ms). The gap between them is the stretch.
const LEAD_MS = 300;
const TRAIL_MS = 460;
const TRAIL_DELAY_MS = 30;
const EASE = "var(--tabs-ease)";

const edgeTransition = (prev: Edges | null, next: Edges): string => {
  if (!prev) return "none";
  const lead = `${LEAD_MS}ms ${EASE}`;
  const trail = `${TRAIL_MS}ms ${EASE} ${TRAIL_DELAY_MS}ms`;
  // Moving down: the bottom edge leads; up: the top. Same across.
  const down = next.top > prev.top;
  const right = next.left > prev.left;
  return [
    `top ${down ? trail : lead}`,
    `bottom ${down ? lead : trail}`,
    `left ${right ? trail : lead}`,
    `right ${right ? lead : trail}`,
  ].join(", ");
};

/** Measures the `[data-liquid-active]` child of the group, relative to it. */
const useActivePill = (
  ref: React.RefObject<HTMLElement | null>,
  activeKey: string,
) => {
  const [pill, setPill] = useState<PillState | null>(null);
  const last = useRef<Edges | null>(null);

  useLayoutEffect(() => {
    const group = ref.current;
    if (!group) return;
    const measure = (animate: boolean) => {
      const el = group.querySelector<HTMLElement>("[data-liquid-active]");
      if (!el) {
        last.current = null;
        setPill(null);
        return;
      }
      const edges: Edges = {
        top: el.offsetTop,
        left: el.offsetLeft,
        bottom: group.clientHeight - el.offsetTop - el.offsetHeight,
        right: group.clientWidth - el.offsetLeft - el.offsetWidth,
      };
      const transition = animate ? edgeTransition(last.current, edges) : "none";
      last.current = edges;
      setPill({ edges, transition });
    };
    // A change of item flows; first paint and resizes snap.
    measure(true);
    // A ResizeObserver reports once as soon as it observes; skip that one,
    // or it would snap the pill in the same frame the flow starts.
    let initial = true;
    const ro = new ResizeObserver(() => {
      if (initial) {
        initial = false;
        return;
      }
      measure(false);
    });
    ro.observe(group);
    return () => ro.disconnect();
  }, [ref, activeKey]);

  return pill;
};

interface LiquidIndicatorGroupProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** Changes when the active item does; the pill re-measures then. */
  activeKey: string;
  /** Pill colour (CSS colour or var()). */
  fill: string;
  shadow?: string;
  /** Corner radius of the pill, px. */
  radius: number;
  children: React.ReactNode;
}

/** Wraps a row/column of items; mark the active one with `data-liquid-active`. */
export const LiquidIndicatorGroup = React.forwardRef<
  HTMLDivElement,
  LiquidIndicatorGroupProps
>(function LiquidIndicatorGroup(
  { activeKey, fill, shadow, radius, children, className, style, ...rest },
  fwd,
) {
  const ref = useRef<HTMLDivElement | null>(null);
  const pill = useActivePill(ref, activeKey);

  return (
    <div
      {...rest}
      ref={(node) => {
        ref.current = node;
        if (typeof fwd === "function") fwd(node);
        else if (fwd) fwd.current = node;
      }}
      className={className}
      style={{ ...style, position: "relative", isolation: "isolate" }}
    >
      {pill && (
        <span
          aria-hidden="true"
          className="t-liquid-pill"
          style={{
            ...pill.edges,
            background: fill,
            boxShadow: shadow,
            borderRadius: radius,
            transition: pill.transition,
          }}
        />
      )}
      {children}
    </div>
  );
});
