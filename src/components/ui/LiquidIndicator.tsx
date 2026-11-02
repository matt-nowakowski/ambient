/*
 * A liquid active-item indicator: a transparent pill slides between items
 * (transitions.dev "Tabs sliding" — CSS owns the tween, JS writes the
 * measured offset/size), and a liquid-gooey `move` item trails it, so the
 * surface you see is the liquid silhouette with its droplet tail.
 * liquid-gooey: MIT, Jakub Antalik.
 */
import React, { useLayoutEffect, useRef, useState } from "react";
import { Liquid } from "liquid-gooey";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Measures the `[data-liquid-active]` child of the group, relative to it. */
const useActiveBox = (
  ref: React.RefObject<HTMLElement | null>,
  activeKey: string,
) => {
  const [box, setBox] = useState<Box | null>(null);
  const first = useRef(true);
  const [snap, setSnap] = useState(true);

  useLayoutEffect(() => {
    const group = ref.current;
    if (!group) return;
    const measure = (animate: boolean) => {
      const el = group.querySelector<HTMLElement>("[data-liquid-active]");
      if (!el) return setBox(null);
      setSnap(!animate);
      setBox({
        x: el.offsetLeft,
        y: el.offsetTop,
        w: el.offsetWidth,
        h: el.offsetHeight,
      });
    };
    // First paint and resizes snap; a change of item slides.
    measure(!first.current);
    first.current = false;
    const ro = new ResizeObserver(() => measure(false));
    ro.observe(group);
    return () => ro.disconnect();
  }, [ref, activeKey]);

  return { box, snap };
};

interface LiquidIndicatorGroupProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** Changes when the active item does; the pill re-measures then. */
  activeKey: string;
  /** Liquid surface colour (CSS colour or var()). */
  fill: string;
  shadow?: string;
  /** Corner radius of the pill, px. */
  radius: number;
  /** Goo blur; keep it under the gap between items so they don't bridge. */
  blur?: number;
  children: React.ReactNode;
}

/** Wraps a row/column of items; mark the active one with `data-liquid-active`. */
export const LiquidIndicatorGroup = React.forwardRef<
  HTMLDivElement,
  LiquidIndicatorGroupProps
>(function LiquidIndicatorGroup(
  { activeKey, fill, shadow, radius, blur = 5, children, ...rest },
  fwd,
) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { box, snap } = useActiveBox(ref, activeKey);

  return (
    <Liquid
      {...rest}
      ref={(node) => {
        ref.current = node;
        if (typeof fwd === "function") fwd(node);
        else if (fwd) fwd.current = node;
      }}
      blur={blur}
      contrast={18}
      fill={fill}
      shadow={shadow}
    >
      {box && (
        <Liquid.Item
          effect="move"
          move={{ springiness: 0.55, wobble: 0.45, trail: 0.5 }}
        >
          <span
            aria-hidden="true"
            className={`t-tabs-pill ${snap ? "is-snapping" : ""}`}
            style={{
              width: box.w,
              height: box.h,
              borderRadius: radius,
              transform: `translate(${box.x}px, ${box.y}px)`,
            }}
          />
        </Liquid.Item>
      )}
      {children}
    </Liquid>
  );
});
