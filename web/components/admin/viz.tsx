"use client";

import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

/**
 * Hand-built SVG charts for /admin. One ink, stepped for series; thin marks,
 * light gridlines, tabular numbers, hover tooltips, and motion on load that
 * honours reduced motion.
 */
import { format, type Fmt } from "@/lib/admin/format";

export { format, type Fmt };

const ease = [0.22, 1, 0.36, 1] as const;

export function CountUp({ value, fmt, className }: { value: number; fmt: Fmt; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || !Number.isFinite(value)) return;
    // Write straight to the DOM: no re-render per frame, and the server-rendered
    // final value stays correct without JavaScript.
    const c = animate(from.current, value, {
      duration: 1.1,
      ease,
      onUpdate: (v) => {
        el.textContent = format(v, fmt);
      },
    });
    from.current = value;
    return () => c.stop();
  }, [value, fmt, reduce]);
  return (
    <span ref={ref} className={className}>
      {format(value, fmt)}
    </span>
  );
}

/**
 * A small trend line. With `fluid`, it fills its container's width (measured,
 * so the end dot stays round) and `width` is only the first-paint guess.
 */
export function Sparkline({
  values,
  width: fixedWidth = 132,
  height = 34,
  className = "",
  fluid = false,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  fluid?: boolean;
}) {
  const reduce = useReducedMotion();
  const id = useId();
  const ref = useRef<SVGSVGElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!fluid || !el) return;
    const ro = new ResizeObserver(([e]) => setMeasured(Math.max(24, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fluid]);
  const width = fluid && measured ? measured : fixedWidth;
  const size = fluid ? { width: "100%", height, style: { display: "block", maxWidth: "100%" } } : { width, height };
  if (values.length < 2 || values.every((v) => v === 0)) {
    return <svg ref={ref} {...size} aria-hidden className={className} />;
  }
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const x = (i: number) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 8);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = `${line}L${x(values.length - 1)},${height}L${x(0)},${height}Z`;
  const last = values.length - 1;
  return (
    <svg ref={ref} {...size} viewBox={`0 0 ${width} ${height}`} aria-hidden className={className}>
      <defs>
        <linearGradient id={`sg${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.14" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={area}
        fill={`url(#sg${id})`}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.9, delay: 0.5 }}
      />
      <motion.path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease }}
      />
      <circle cx={x(last)} cy={y(values[last])} r={2.5} fill="currentColor" />
    </svg>
  );
}

export function Meter({ used, limit, level }: { used: number | null; limit: number; level: string }) {
  const reduce = useReducedMotion();
  const pct = used === null || !(limit > 0) ? 0 : Math.min(used / limit, 1);
  return (
    <div className="admin-meter" data-level={level} role="presentation">
      <motion.span
        initial={reduce ? false : { scaleX: 0 }}
        animate={{ scaleX: pct }}
        transition={{ duration: 1, ease, delay: 0.15 }}
        style={{ width: "100%" }}
      />
    </div>
  );
}

type Series = { name: string; values: number[]; color: string };

/** Stacked bars over time with a hover tooltip; legend sits above (in the page). */
export function StackedBars({
  labels,
  series,
  height = 180,
  fmt = "int",
  tipLabels,
  hatchLast = false,
}: {
  labels: string[];
  series: Series[];
  height?: number;
  fmt?: Fmt;
  tipLabels?: string[];
  /** Mark the last column as partial (current month). */
  hatchLast?: boolean;
}) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0));
  const max = niceMax(Math.max(...totals, 1));
  const left = 44;
  const bottom = 22;
  const plotW = width - left - 4;
  const plotH = height - bottom - 8;
  const step = plotW / n;
  const barW = Math.max(3, Math.min(step * 0.62, 36));
  const yScale = (v: number) => (v / max) * plotH;
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const labelEvery = Math.ceil(n / Math.max(2, Math.floor(plotW / 64)));
  const id = useId();

  return (
    <div ref={wrap} className="relative w-full min-w-0" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label="Bar chart">
        <defs>
          <pattern id={`hatch${id}`} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--a-surface)" strokeWidth="2" strokeOpacity="0.55" />
          </pattern>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={width - 4} y1={8 + plotH - yScale(t)} y2={8 + plotH - yScale(t)} stroke="var(--a-line)" strokeWidth={t === 0 ? 1 : 0.5} />
            <text x={left - 8} y={8 + plotH - yScale(t) + 4} textAnchor="end" fontSize="10.5" fill="var(--a-ink-3)">
              {format(t, fmt === "money" ? "money0" : fmt === "int" ? "compact" : fmt)}
            </text>
          </g>
        ))}
        {labels.map((l, i) => {
          const cx = left + step * i + step / 2;
          let acc = 0;
          return (
            <g key={l} opacity={hover === null || hover === i ? 1 : 0.45} style={{ transition: "opacity 150ms" }}>
              {series.map((s, si) => {
                const v = s.values[i] ?? 0;
                if (v <= 0) return null;
                const h = yScale(v);
                const yTop = 8 + plotH - acc - h;
                acc += h;
                const isTop = series.slice(si + 1).every((x) => (x.values[i] ?? 0) <= 0);
                // 2px surface gap between stacked segments.
                const gap = acc - h > 0 ? 2 : 0;
                const rh = Math.max(0, h - gap);
                return (
                  <motion.rect
                    key={s.name}
                    x={cx - barW / 2}
                    width={barW}
                    y={yTop}
                    height={rh}
                    rx={isTop && rh > 6 ? Math.min(3, barW / 2) : 0}
                    fill={s.color}
                    initial={reduce ? false : { scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 0.7, ease, delay: 0.02 * i }}
                    style={{ transformOrigin: `${cx}px ${8 + plotH}px`, transformBox: "view-box" } as CSSProperties}
                  />
                );
              })}
              {hatchLast && i === n - 1 && acc > 0 ? (
                <rect x={cx - barW / 2} width={barW} y={8 + plotH - acc} height={acc} fill={`url(#hatch${id})`} />
              ) : null}
              {i % labelEvery === 0 || i === n - 1 ? (
                <text x={cx} y={height - 6} textAnchor="middle" fontSize="10.5" fill="var(--a-ink-3)">
                  {l}
                </text>
              ) : null}
              <rect
                x={left + step * i}
                width={step}
                y={0}
                height={height - bottom}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
              />
            </g>
          );
        })}
      </svg>
      {hover !== null ? (
        <div
          className="admin-tip"
          style={{
            left: Math.min(Math.max(left + step * hover + step / 2 - 80, 0), width - 170),
            top: 0,
          }}
        >
          <div className="admin-meta mb-1">{tipLabels?.[hover] ?? labels[hover]}</div>
          {[...series].reverse().map((s) => (
            <div key={s.name} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 ink-2">
                <span className="admin-swatch" style={{ background: s.color }} />
                {s.name}
              </span>
              <span>{format(s.values[hover] ?? 0, fmt)}</span>
            </div>
          ))}
          {series.length > 1 ? (
            <div className="mt-1 flex justify-between border-t border-[var(--a-line)] pt-1">
              <span className="ink-2">Total</span>
              <span>{format(totals[hover], fmt)}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** One line over time with a crosshair tooltip and the latest value labelled. */
export function LineChart({
  labels,
  values,
  height = 180,
  fmt = "money0",
  name,
}: {
  labels: string[];
  values: number[];
  height?: number;
  fmt?: Fmt;
  name: string;
}) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const id = useId();
  const left = 44;
  const right = 56;
  const bottom = 22;
  const plotW = width - left - right;
  const plotH = height - bottom - 12;
  const max = niceMax(Math.max(...values, 1));
  const n = values.length;
  const x = (i: number) => left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => 12 + plotH - (v / max) * plotH;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = `${line}L${x(n - 1)},${12 + plotH}L${x(0)},${12 + plotH}Z`;
  const last = n - 1;
  const labelEvery = Math.ceil(n / Math.max(2, Math.floor(plotW / 56)));

  return (
    <div ref={wrap} className="relative w-full min-w-0" onMouseLeave={() => setHover(null)}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={name}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = e.clientX - r.left;
          const i = Math.round(((px - left) / plotW) * (n - 1));
          setHover(Math.min(Math.max(i, 0), n - 1));
        }}
      >
        <defs>
          <linearGradient id={`lg${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--a-ink)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--a-ink)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={left} x2={width - right} y1={y(t * max)} y2={y(t * max)} stroke="var(--a-line)" strokeWidth={t === 0 ? 1 : 0.5} />
            <text x={left - 8} y={y(t * max) + 4} textAnchor="end" fontSize="10.5" fill="var(--a-ink-3)">
              {format(t * max, fmt === "money" ? "money0" : fmt)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % labelEvery === 0 || i === last ? (
            <text key={l} x={x(i)} y={height - 6} textAnchor="middle" fontSize="10.5" fill="var(--a-ink-3)">
              {l}
            </text>
          ) : null,
        )}
        <motion.path d={area} fill={`url(#lg${id})`} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.6 }} />
        <motion.path
          d={line}
          fill="none"
          stroke="var(--a-ink)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.3, ease }}
        />
        <circle cx={x(last)} cy={y(values[last] ?? 0)} r={4} fill="var(--a-ink)" stroke="var(--a-surface)" strokeWidth={2} />
        <text x={x(last) + 8} y={y(values[last] ?? 0) + 4} fontSize="11.5" fill="var(--a-ink)">
          {format(values[last] ?? 0, fmt)}
        </text>
        {hover !== null ? (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={12} y2={12 + plotH} stroke="var(--a-line-strong)" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(values[hover])} r={4} fill="var(--a-ink)" stroke="var(--a-surface)" strokeWidth={2} />
          </g>
        ) : null}
      </svg>
      {hover !== null ? (
        <div className="admin-tip" style={{ left: Math.min(Math.max(x(hover) - 70, 0), width - 150), top: -6 }}>
          <div className="admin-meta">{labels[hover]}</div>
          <div className="flex justify-between gap-4">
            <span className="ink-2">{name}</span>
            <span>{format(values[hover], fmt)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function niceMax(v: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / exp;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return nice * exp;
}
