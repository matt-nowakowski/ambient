// Shared parts for the launch video. Everything is driven by the frame number
// (no CSS animations or timers), so every render is identical.
//
// Look: Ambient's own tokens (web/app/globals.css, src/styles/glass.css,
// src/hud/hud.css, src/intro/intro.css), copied here rather than imported.
import React, { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { AbsoluteFill, Easing, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

// Geist, the app's and site's font (copied from web/node_modules/geist into public/fonts).
// Light weights only: display 300–400, UI 400–500. Nothing bolder is loaded.
const GEIST: [string, string][] = [
  ["300", "Geist-Light.woff2"],
  ["400", "Geist-Regular.woff2"],
  ["500", "Geist-Medium.woff2"],
];
if (typeof document !== "undefined") {
  const handle = delayRender("Loading Geist");
  Promise.all(
    GEIST.map(([weight, file]) => {
      const face = new FontFace("Geist", `url(${staticFile(`fonts/${file}`)}) format("woff2")`, { weight });
      document.fonts.add(face);
      return face.load();
    }),
  ).then(() => continueRender(handle), () => continueRender(handle));
}
/** The intro's stack (src/intro/intro.css). */
export const FONT = `Geist, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

// ---------------------------------------------------------------- tokens
export const C = {
  bg: "#f5f5f7",
  bgDark: "#0b0b0d",
  fg: "#0a0a0a",
  fgDark: "#ededed",
  muted: "#666666",
  mutedDark: "#a1a1a1",
  subtle: "#8f8f8f",
  border: "rgba(0,0,0,0.08)",
  rec: "#ef4444",
  success: "#4ade80",
  // HUD glass (src/hud/hud.css)
  hInk: "#fafafa",
  hMuted: "rgba(255,255,255,0.64)",
  hFaint: "rgba(255,255,255,0.42)",
  hSurface: "rgba(18,18,22,0.74)",
  hRaise: "rgba(255,255,255,0.08)",
  hHair: "rgba(255,255,255,0.1)",
  // the two backdrop lights (glass.css --ambient-a / --ambient-b)
  aLight: "rgba(186,204,236,0.55)",
  bLight: "rgba(236,214,204,0.45)",
  aDark: "rgba(64,84,140,0.32)",
  bDark: "rgba(120,72,64,0.22)",
};

// Stageshow's two curves (v1): travel, and arrival from nowhere.
export const TRAVEL = Easing.bezier(0.45, 0, 0.1, 1);
export const ARRIVE = Easing.bezier(0.25, 0.8, 0.25, 1);
export const SOFT = Easing.bezier(0.4, 0, 0.2, 1);

/** Clamped interpolate with an easing. */
export function ease(f: number, [a, b]: [number, number], [from, to]: [number, number], e = TRAVEL) {
  return interpolate(f, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: e });
}

/** 0→1 spring starting at frame `at` (v1's snappy default). */
export function springAt(f: number, fps: number, at: number, cfg: { damping?: number; stiffness?: number; mass?: number } = {}) {
  return spring({ frame: f - at, fps, config: { damping: 22, stiffness: 170, mass: 1, ...cfg } });
}

// ---------------------------------------------------------------- stage + camera
/**
 * A 960×540 logical stage drawn at 2× (UI is built at real app sizes, then
 * scaled), with a camera: zoom about (cx, cy) in stage px, centred in the frame
 * (works for both 16:9 and 9:16).
 */
export const Stage: React.FC<{ children: ReactNode; zoom?: number; cx?: number; cy?: number; style?: CSSProperties }> = ({
  children,
  zoom = 1,
  cx = 480,
  cy = 270,
  style,
}) => {
  const { width, height } = useVideoConfig();
  const s = 2 * zoom;
  const tx = width / 2 - cx * s;
  const ty = height / 2 - cy * s;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 960,
          height: 540,
          transformOrigin: "0 0",
          transform: `translate(${tx}px, ${ty}px) scale(${s})`,
          fontFamily: FONT,
          ...style,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};

/** Camera keyframes: [frame, zoom, cx, cy][]; eased with TRAVEL between them. */
export function camera(f: number, keys: [number, number, number, number][]) {
  if (f <= keys[0][0]) return { zoom: keys[0][1], cx: keys[0][2], cy: keys[0][3] };
  for (let i = 0; i < keys.length - 1; i++) {
    const [a, za, xa, ya] = keys[i];
    const [b, zb, xb, yb] = keys[i + 1];
    if (f <= b) {
      const t = ease(f, [a, b], [0, 1], TRAVEL);
      return { zoom: za + (zb - za) * t, cx: xa + (xb - xa) * t, cy: ya + (yb - ya) * t };
    }
  }
  const k = keys[keys.length - 1];
  return { zoom: k[1], cx: k[2], cy: k[3] };
}

// ---------------------------------------------------------------- shot clock
/**
 * Shots overlap for their crossfades, so each one starts rendering a few frames
 * before its nominal start. `useF()` is the frame relative to that start
 * (negative during the fade-in); use it instead of useCurrentFrame everywhere.
 */
export const Shift = createContext(0);
export const useF = () => useCurrentFrame() - useContext(Shift);

/** True for the 9:16 composition. */
export const useTall = () => {
  const { width, height } = useVideoConfig();
  return height > width;
};

// ---------------------------------------------------------------- backdrop
const inOut = Easing.bezier(0.42, 0, 0.58, 1); // CSS ease-in-out
/** ambient-drift: 28 s ease-in-out, infinite alternate; returns 0..1. */
function drift(sec: number) {
  const c = ((sec % 56) + 56) % 56;
  return inOut(c < 28 ? c / 28 : (56 - c) / 28);
}

/**
 * `.app-backdrop` / `.ambient-backdrop`, exactly: two 70vmax circles blurred
 * 80px, a radial gradient from the colour to transparent at 65%; blue top-left
 * (top -30vmax, left -10vmax), rust bottom-right (bottom -35vmax, right -20vmax),
 * drifting 6vmax/4vmax and scale 1.12 over 28 s, the second 14 s ahead.
 */
export const Backdrop: React.FC<{ dark?: boolean; style?: CSSProperties }> = ({ dark, style }) => {
  const f = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const vmax = Math.max(width, height) / 100;
  const t = f / fps;
  const circle = (e: number, pos: CSSProperties, color: string): CSSProperties => ({
    position: "absolute",
    width: 70 * vmax,
    height: 70 * vmax,
    borderRadius: "50%",
    filter: "blur(80px)",
    background: `radial-gradient(circle, ${color}, transparent 65%)`,
    transform: `translate3d(${6 * vmax * e}px, ${4 * vmax * e}px, 0) scale(${1 + 0.12 * e})`,
    ...pos,
  });
  return (
    <AbsoluteFill style={{ background: dark ? C.bgDark : C.bg, overflow: "hidden", ...style }}>
      <div style={circle(drift(t), { top: -30 * vmax, left: -10 * vmax }, dark ? C.aDark : C.aLight)} />
      <div style={circle(drift(t + 14), { bottom: -35 * vmax, right: -20 * vmax }, dark ? C.bDark : C.bLight)} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- the mark
/** B1 lens, as the intro draws it: four dots, top-left in focus, clockwise. */
const DOTS = [
  { x: -1, y: -1, a: 1, from: [-0.48, -0.42] },
  { x: 1, y: -1, a: 0.5, from: [0.5, -0.46] },
  { x: 1, y: 1, a: 0.26, from: [0.46, 0.5] },
  { x: -1, y: 1, a: 0.38, from: [-0.5, 0.44] },
];
const OUT_EXPO = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * The intro's orb (src/intro/Intro.tsx) at scale `k` (1 = 17px dots, gap 14).
 * `at`: frame the dots start assembling from blurred, far-off positions.
 * `spin`: once settled, how fast the focus travels clockwise (turns per second).
 */
export const LensOrb: React.FC<{ k?: number; at?: number; color?: string; spin?: number; glow?: number; bloomAt?: number; style?: CSSProperties }> = ({
  k = 1,
  at,
  color = "#fafafa",
  spin = 0,
  glow = 0.22,
  bloomAt,
  style,
}) => {
  const f = useF();
  const { width, height, fps } = useVideoConfig();
  const DOT = 17 * k;
  const GAP = 14 * k;
  const box = GAP * 2 + DOT;
  const bloom =
    bloomAt === undefined
      ? 0
      : interpolate(f, [bloomAt, bloomAt + 0.7 * fps, bloomAt + 1.4 * fps], [0, 0.9, 0.35], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bloomS = bloomAt === undefined ? 1 : interpolate(f, [bloomAt, bloomAt + 0.7 * fps, bloomAt + 1.4 * fps], [0.3, 1.6, 1.2], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "relative", width: box, height: box, flex: "none", ...style }}>
      {bloomAt !== undefined && (
        <div
          style={{
            position: "absolute",
            inset: "-60%",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,0.55) 0%, rgba(150,170,220,0.18) 40%, transparent 70%)",
            filter: `blur(${18 * k}px)`,
            opacity: bloom,
            transform: `scale(${bloomS})`,
          }}
        />
      )}
      {DOTS.map((d, i) => {
        const start = at === undefined ? -1e4 : at + (0.25 + i * 0.07) * fps;
        const p = OUT_EXPO(Math.min(1, Math.max(0, (f - start) / (1.15 * fps))));
        const po = Math.min(1, Math.max(0, (f - start) / (1.6 * fps)));
        let a = po < 0.55 ? po / 0.55 : 1 + (d.a - 1) * ((po - 0.55) / 0.45);
        if (spin) {
          // let the focus travel clockwise: each dot takes the next one's opacity
          const ph = ((f / fps) * spin * 4 + 4 - i) % 4;
          const lo = Math.floor(ph);
          const fr = SOFT(ph - lo);
          const A = DOTS.map((x) => x.a);
          const cur = A[lo % 4] + (A[(lo + 1) % 4] - A[lo % 4]) * fr;
          a = po >= 1 ? cur : a;
        }
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: GAP + d.x * GAP,
              top: GAP + d.y * GAP,
              width: DOT,
              height: DOT,
              borderRadius: "50%",
              background: color,
              boxShadow: glow ? `0 0 ${16 * k}px rgba(255,255,255,${glow})` : undefined,
              opacity: a,
              filter: p < 1 ? `blur(${(1 - p) * 14}px)` : undefined,
              transform: `translate(${(1 - p) * d.from[0] * width}px, ${(1 - p) * d.from[1] * height}px) scale(${2.4 - 1.4 * p})`,
            }}
          />
        );
      })}
    </div>
  );
};

/**
 * The intro lockup: orb, an 18px gap, "ambient" in Geist 300, -0.04em, line
 * height 1. `size` is the wordmark's font size (the intro's 60px on a 1440×900
 * screen is 72px at 1080p; never bigger).
 */
export const Lockup: React.FC<{ size: number; at?: number; wordAt?: number; color?: string; spin?: number; bloomAt?: number; style?: CSSProperties }> = ({
  size,
  at,
  wordAt,
  color = "#fafafa",
  spin,
  bloomAt,
  style,
}) => {
  const f = useF();
  const { fps } = useVideoConfig();
  const k = size / 60;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 * k, color, fontFamily: FONT, ...style }}>
      <LensOrb k={k} at={at} color={color} spin={spin} bloomAt={bloomAt} glow={color === "#fafafa" ? 0.22 : 0} />
      <span style={{ display: "inline-flex", fontSize: size, fontWeight: 300, letterSpacing: "-0.04em", lineHeight: 1 }}>
        {Array.from("ambient").map((ch, i) => {
          const p = wordAt === undefined ? 1 : ARRIVE(Math.min(1, Math.max(0, (f - wordAt - i * 0.05 * fps) / (0.6 * fps))));
          return (
            <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${(1 - p) * 18 * k}px)`, filter: p < 1 ? `blur(${(1 - p) * 8 * k}px)` : undefined }}>
              {ch}
            </span>
          );
        })}
      </span>
    </div>
  );
};

/**
 * The small animated B1 orb used inside the HUD (AICSS "Lens"): four circles,
 * focus travelling clockwise over 4s.
 */
type K = { at: number; o: number; b: number; s: number };
const FOCUS: K[] = [
  { at: 0, o: 0.05, b: 2, s: 1.12 },
  { at: 0.12, o: 1, b: 0, s: 1 },
  { at: 0.22, o: 1, b: 0, s: 1 },
  { at: 0.38, o: 0.3, b: 1.2, s: 1.06 },
  { at: 0.58, o: 0.1, b: 1.8, s: 1.1 },
  { at: 0.82, o: 0.05, b: 2, s: 1.12 },
  { at: 1, o: 0.05, b: 2, s: 1.12 },
];
function focusAt(p: number) {
  for (let i = 0; i < FOCUS.length - 1; i++) {
    const a = FOCUS[i];
    const b = FOCUS[i + 1];
    if (p >= a.at && p <= b.at) {
      const t = SOFT((p - a.at) / (b.at - a.at || 1));
      return { o: a.o + (b.o - a.o) * t, b: a.b + (b.b - a.b) * t, s: a.s + (b.s - a.s) * t };
    }
  }
  return FOCUS[0];
}
export const Orb: React.FC<{ size: number; color?: string; floor?: number; speed?: number; style?: CSSProperties }> = ({
  size,
  color = C.fg,
  floor = 0.15,
  speed = 1,
  style,
}) => {
  const f = useCurrentFrame();
  const k = size / 28;
  const t = ((f / 30) * speed) / 4;
  const pos = [
    [-4.5, -4.5, 0],
    [4.5, -4.5, 0.75],
    [4.5, 4.5, 0.5],
    [-4.5, 4.5, 0.25],
  ];
  return (
    <div style={{ width: size, height: size, position: "relative", flex: "none", ...style }}>
      {pos.map(([x, y, off], i) => {
        const v = focusAt((((t + off) % 1) + 1) % 1);
        const d = 6 * k;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: size / 2 + x * k - d / 2,
              top: size / 2 + y * k - d / 2,
              width: d,
              height: d,
              borderRadius: "50%",
              background: color,
              opacity: floor + (1 - floor) * v.o,
              filter: `blur(${v.b * k * 0.9}px)`,
              transform: `scale(${v.s})`,
            }}
          />
        );
      })}
    </div>
  );
};

/** The C2 ring orb ("Listening"): eight dots, a lit head travelling round. */
export const RingOrb: React.FC<{ size: number; color?: string; period?: number }> = ({ size, color = C.fg, period = 2 }) => {
  const f = useCurrentFrame();
  const k = size / 28;
  const head = (f / 30 / period) % 1;
  return (
    <div style={{ width: size, height: size, position: "relative", flex: "none" }}>
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const ph = (((head - i / 8) % 1) + 1) % 1;
        const lit = Math.max(0, 1 - ph / 0.44);
        const d = 3.4 * k;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: size / 2 + Math.cos(a) * 9 * k - d / 2,
              top: size / 2 + Math.sin(a) * 9 * k - d / 2,
              width: d,
              height: d,
              borderRadius: "50%",
              background: color,
              opacity: 0.22 + 0.78 * lit,
              transform: `scale(${1 + lit * 0.25})`,
            }}
          />
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------- text
/**
 * Display line: words drift up out of a soft blur, one after another. Light
 * weight (300) by default; wraps only where the container makes it.
 */
export const Soft: React.FC<{
  text: string;
  at: number;
  size: number;
  weight?: number;
  color?: string;
  out?: number;
  stagger?: number;
  align?: "left" | "center";
  style?: CSSProperties;
}> = ({ text, at, size, weight = 300, color, out, stagger = 5, align = "left", style }) => {
  const f = useF();
  const o = out === undefined ? 1 : ease(f, [out, out + 14], [1, 0]);
  return (
    <div
      style={{
        fontFamily: FONT,
        fontSize: size,
        fontWeight: weight,
        letterSpacing: "-0.035em",
        lineHeight: 1.08,
        color,
        opacity: o,
        textAlign: align,
        textWrap: "balance",
        filter: o < 1 ? `blur(${(1 - o) * 8}px)` : undefined,
        ...style,
      }}
    >
      {text.split(" ").map((w, i, all) => {
        const p = ARRIVE(Math.min(1, Math.max(0, (f - at - i * stagger) / 22)));
        return (
          <React.Fragment key={i}>
            <span style={{ display: "inline-block", opacity: p, transform: `translateY(${(1 - p) * 0.22}em)`, filter: p < 1 ? `blur(${(1 - p) * 10}px)` : undefined }}>{w}</span>
            {i < all.length - 1 ? " " : ""}
          </React.Fragment>
        );
      })}
    </div>
  );
};

/** Text revealed word by word between two frames, each word fading up. */
export const Stream: React.FC<{ text: string; from: number; to: number; style?: CSSProperties }> = ({ text, from, to, style }) => {
  const f = useF();
  const words = text.split(" ");
  return (
    <span style={style}>
      {words.map((w, i) => {
        const at = from + ((to - from) * i) / Math.max(1, words.length);
        const o = ease(f, [at, at + 6], [0, 1], ARRIVE);
        return (
          <span key={i} style={{ opacity: o, filter: o < 1 ? `blur(${(1 - o) * 2}px)` : undefined }}>
            {w}
            {i < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </span>
  );
};

/** Characters typed one by one. */
export function typed(f: number, text: string, from: number, cps = 30) {
  const n = Math.max(0, Math.min(text.length, Math.floor(((f - from) / 30) * cps)));
  return text.slice(0, n);
}

export const Caret: React.FC<{ color?: string; h?: number }> = ({ color = C.fg, h = 15 }) => {
  const f = useF();
  const on = Math.floor(f / 16) % 2 === 0;
  return <span style={{ display: "inline-block", width: 1.5, height: h, background: color, marginLeft: 1, verticalAlign: "-2px", opacity: on ? 1 : 0.15 }} />;
};

// ---------------------------------------------------------------- chrome
/** A macOS window: glass-white (or dark) panel with a title bar. Sized by its parent's numbers. */
export const MacWindow: React.FC<{
  w: number;
  h: number;
  title?: string;
  dark?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}> = ({ w, h, title, dark, children, style }) => (
  <div
    style={{
      position: "absolute",
      width: w,
      height: h,
      borderRadius: 12,
      background: dark ? "rgba(30,30,34,0.86)" : "rgba(255,255,255,0.78)",
      backdropFilter: "blur(28px) saturate(180%)",
      boxShadow: dark
        ? "0 0 0 0.5px rgba(255,255,255,0.12), 0 24px 60px -12px rgba(0,0,0,0.5)"
        : "0 0 0 0.5px rgba(0,0,0,0.1), inset 0 0.5px 0 rgba(255,255,255,0.9), 0 24px 60px -18px rgba(20,24,40,0.25)",
      overflow: "hidden",
      fontFamily: FONT,
      ...style,
    }}
  >
    <div
      style={{
        height: 32,
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        gap: 8,
        borderBottom: `0.5px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
        position: "relative",
      }}
    >
      {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
        <div key={c} style={{ width: 11, height: 11, borderRadius: 6, background: c, boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.12)" }} />
      ))}
      {title && (
        <div style={{ position: "absolute", left: 0, right: 0, textAlign: "center", fontSize: 12, fontWeight: 500, color: dark ? "rgba(255,255,255,0.55)" : "#6b6b70", whiteSpace: "nowrap" }}>
          {title}
        </div>
      )}
    </div>
    <div style={{ position: "relative", height: h - 32 }}>{children}</div>
  </div>
);

/** A placeholder text line. */
export const Bar: React.FC<{ w: number | string; h?: number; o?: number; dark?: boolean; style?: CSSProperties }> = ({ w, h = 6, o = 1, dark, style }) => (
  <div style={{ width: w, height: h, borderRadius: h / 2, background: dark ? `rgba(255,255,255,${0.1 * o})` : `rgba(0,0,0,${0.07 * o})`, ...style }} />
);

// ---------------------------------------------------------------- HUD (src/hud)
export const hudCard: CSSProperties = {
  position: "absolute",
  boxSizing: "border-box",
  padding: "12px 14px",
  borderRadius: 14,
  background: C.hSurface,
  backdropFilter: "blur(24px) saturate(160%)",
  boxShadow: "inset 0 0 0 0.5px rgba(255,255,255,0.14), inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 30px rgba(0,0,0,0.25)",
  color: C.hInk,
  fontFamily: FONT,
  fontWeight: 400,
};

export const HudButton: React.FC<{ label: string; kbd?: string; primary?: boolean; press?: number }> = ({ label, kbd, primary, press = 0 }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      height: 26,
      padding: "0 10px",
      borderRadius: 8,
      background: primary ? C.hInk : C.hRaise,
      color: primary ? "#111" : C.hInk,
      fontSize: 12,
      fontWeight: 500,
      transform: `scale(${1 - press * 0.06})`,
      whiteSpace: "nowrap",
      flex: "none",
    }}
  >
    {label}
    {kbd && <span style={{ fontSize: 10, opacity: 0.55 }}>{kbd}</span>}
  </div>
);

/** A 0→1→0 press curve around frame `at`. */
export const press = (f: number, at?: number) => (at === undefined ? 0 : Math.sin(ease(f, [at, at + 8], [0, 1], Easing.linear) * Math.PI));

/** The suggestion pill: orb, one line (never truncated), accept ⏎ / not now esc, a draining timer. */
export const Suggestion: React.FC<{
  title: string;
  accept?: string;
  at: number;
  out?: number;
  pressAccept?: number;
  style?: CSSProperties;
}> = ({ title, accept = "Yes", at, out, pressAccept, style }) => {
  const f = useF();
  const { fps } = useVideoConfig();
  const s = springAt(f, fps, at);
  const o = out === undefined ? 1 : ease(f, [out, out + 12], [1, 0]);
  const drain = ease(f, [at, at + 8 * 30], [1, 0], Easing.linear);
  return (
    <div
      style={{
        ...hudCard,
        overflow: "hidden",
        whiteSpace: "nowrap",
        opacity: Math.min(1, s * 1.3) * o,
        transform: `translateY(${(1 - s) * -8}px) scale(${0.98 + 0.02 * s})`,
        filter: s < 0.98 ? `blur(${(1 - s) * 4}px)` : undefined,
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <RingOrb size={18} color={C.hInk} />
        <span style={{ fontSize: 13, marginRight: 6 }}>{title}</span>
        <HudButton label={accept} kbd="⏎" primary press={press(f, pressAccept)} />
        <HudButton label="Not now" kbd="esc" />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1.5, background: "rgba(255,255,255,0.35)", transformOrigin: "left", transform: `scaleX(${drain})` }} />
    </div>
  );
};

export const Check: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = C.success }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flex: "none" }}>
    <path d="M3.5 8.5l3 3 6-7" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Something arriving softly at `at` (opacity, rise, blur) and optionally leaving at `out`. */
export function appear(f: number, at: number, out?: number, dist = 14, dur = 20): CSSProperties {
  const i = ease(f, [at, at + dur], [0, 1], ARRIVE);
  const o = out === undefined ? 1 : ease(f, [out, out + 14], [1, 0]);
  const v = i * o;
  return { opacity: v, transform: `translateY(${(1 - i) * dist}px)`, filter: v < 0.99 ? `blur(${(1 - v) * 6}px)` : undefined };
}
