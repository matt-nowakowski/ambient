// Ambient launch spot, v3: v1's music-led cut (kinetic type, real screens, camera
// moves, whips) on a 100 BPM bed, held about 1.4× longer, with v2's polish: the
// app's backdrop, the launch-screen lockup, light Geist weights, sound effects,
// and layouts where nothing collides or clips. One component renders both the
// 16:9 master and the 9:16 cut (useTall); see src/beats.ts and script.md.
// v5: Ambient as a desktop colleague. A new opening, a smart-writing beat, the
// suggestions moved up and held on one long example, the brand line as tagline.
import React, { type CSSProperties, type ReactNode } from "react";
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import {
  ARRIVE,
  Backdrop,
  Bar,
  C,
  Check,
  FONT,
  FONT_DISPLAY,
  HudButton,
  LensOrb,
  Lockup,
  MacWindow,
  Orb,
  RingOrb,
  Stage,
  Stream,
  Suggestion,
  camera,
  ease,
  hudCard,
  press,
  settle,
  springAt,
  useTall,
} from "./kit";
import { FB, FPS, FIRST_BEAT, MUSIC_SPLICES, SHOTS, TOTAL, VO, beat } from "./beats";
import vo from "./vo";

// ---------------------------------------------------------------- motion helpers
/** 1 on the beat frame, decaying over ~k frames; the max over all hits. */
function pulse(f: number, hits: number[], k = 6) {
  let p = 0;
  for (const h of hits) if (f >= h) p = Math.max(p, Math.exp(-(f - h) / k));
  return p;
}

/** Local frame of v1 beat `b` inside a shot that started on v1 beat `start` (beats are 0.6 s now). */
const lb = (start: number, b: number) => Math.round((b - start) * FB);

/**
 * Kinetic type: each word rises out of a mask with a spring and lands with a
 * small scale punch. Light weight; the mask is padded so no glyph is clipped.
 */
const Slam: React.FC<{
  words: { t: string; at: number; color?: string }[];
  size: number;
  weight?: number;
  gap?: number;
  style?: CSSProperties;
  out?: number;
  color?: string;
  fast?: boolean;
}> = ({ words, size, weight, gap = 0.26, style, out, color = C.fg, fast }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = out === undefined ? 1 : ease(f, [out, out + 6], [1, 0]);
  // brand/TYPOGRAPHY.md (Video): slam word ≥200px 200/-0.05em/1.02; headline 100–199px
  // 200/-0.045em/1.05; display line below that 300/-0.035em/1.08.
  const role = size >= 200 ? { w: 200, t: "-0.05em", lh: 1.02 } : size >= 100 ? { w: 200, t: "-0.045em", lh: 1.05 } : { w: 300, t: "-0.035em", lh: 1.08 };
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        columnGap: `${gap}em`,
        fontFamily: FONT_DISPLAY,
        fontSize: size,
        fontWeight: weight ?? role.w,
        letterSpacing: role.t,
        lineHeight: role.lh,
        color,
        opacity: o,
        ...style,
      }}
    >
      {words.map((w, i) => {
        const s = settle(spring({ frame: f - w.at, fps, config: fast ? { damping: 26, stiffness: 700, mass: 0.5 } : { damping: 20, stiffness: 260, mass: 0.7 } }));
        const punch = 1 + 0.05 * pulse(f, [w.at + 3], 5);
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", padding: "0.08em 0.12em 0.16em", margin: "-0.08em -0.12em -0.16em", whiteSpace: "nowrap" }}>
            <span
              style={{
                display: "inline-block",
                transform: `translateY(${(1 - s) * 105}%) scale(${punch})`,
                transformOrigin: "50% 80%",
                color: w.color,
                filter: s < 0.99 ? `blur(${Math.max(0, 1 - s) * 6}px)` : undefined,
              }}
            >
              {w.t}
            </span>
          </span>
        );
      })}
    </div>
  );
};

/** A cut that arrives like a whip: a fast slide with blur over 6 frames. */
const Whip: React.FC<{ children: ReactNode; dir?: 1 | -1; len: number }> = ({ children, dir = 1 }) => {
  const f = useCurrentFrame();
  const i = ease(f, [0, 7], [1, 0], Easing.bezier(0.1, 0.9, 0.2, 1));
  const d = i * 260 * dir;
  const blur = i * 22;
  return <AbsoluteFill style={{ transform: `translateX(${d}px) scale(${1 + i * 0.04})`, filter: blur > 0.3 ? `blur(${blur}px)` : undefined }}>{children}</AbsoluteFill>;
};

/**
 * The product shots' caption. 16:9: a left column that ends before the UI
 * starts (x ≤ 820; the UI begins at x ≥ 900). 9:16: centred above the UI.
 */
const SideWord: React.FC<{ text: string; at: number; light?: boolean }> = ({ text, at, light }) => {
  const tall = useTall();
  const words = text.split(" ").map((t, i) => ({ t, at: at + i * 4 }));
  return tall ? (
    <div style={{ position: "absolute", left: 60, right: 60, top: 330, height: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <Slam words={words} size={104} color={light ? "#fff" : C.fg} style={{ justifyContent: "center" }} />
    </div>
  ) : (
    <div style={{ position: "absolute", left: 120, top: 0, bottom: 0, width: 700, display: "flex", alignItems: "center" }}>
      <Slam words={words} size={100} color={light ? "#fff" : C.fg} />
    </div>
  );
};

/** The dark request pill: what you said, with the listening ring. */
export const Request: React.FC<{ text: string; at: number; style?: CSSProperties }> = ({ text, at, style }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = springAt(f, fps, at, { damping: 20, stiffness: 300 });
  return (
    <div
      style={{
        position: "absolute",
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        height: 40,
        padding: "0 18px 0 12px",
        borderRadius: 20,
        background: "rgba(18,18,22,0.84)",
        boxShadow: "inset 0 0.5px 0 rgba(255,255,255,0.14), 0 12px 30px -10px rgba(0,0,0,0.35)",
        color: C.hInk,
        fontFamily: FONT,
        fontSize: 14,
        fontWeight: 400,
        whiteSpace: "nowrap",
        opacity: Math.min(1, s * 1.6),
        transformOrigin: "0 50%",
        transform: `scale(${0.9 + 0.1 * s}) translateY(${(1 - s) * 12}px)`,
        ...style,
      }}
    >
      {f < at + 16 ? <RingOrb size={18} color="#fff" period={1} /> : <Orb size={18} color="#fff" speed={2} />}
      <Stream text={text} from={at + 1} to={at + 14} />
    </div>
  );
};

/** The glass answer card (src/hud): question, streamed answer, numbered sources popping on beats. Height follows its text. */
const AnswerCard: React.FC<{ q: string; a: string; sources: string[]; at: number; srcAt: number[]; w?: number; actionsAt?: number; style?: CSSProperties }> = ({
  q,
  a,
  sources,
  at,
  srcAt,
  w = 380,
  actionsAt,
  style,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = springAt(f, fps, at, { damping: 18, stiffness: 320 });
  return (
    <div style={{ ...hudCard, width: w, opacity: Math.min(1, s * 1.5), transform: `translateY(${(1 - s) * -14}px) scale(${0.9 + 0.1 * s})`, transformOrigin: "50% 0", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Orb size={18} color="#fff" speed={1.5} />
        <span style={{ fontSize: 12, color: C.hMuted, whiteSpace: "nowrap" }}>{q}</span>
      </div>
      <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.55 }}>
        <Stream text={a} from={at + 3} to={at + 30} />
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", minHeight: 21 }}>
        {sources.map((src, i) => {
          const t = springAt(f, fps, srcAt[i], { damping: 16, stiffness: 400 });
          return (
            <div
              key={src}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 9px 3px 4px",
                borderRadius: 7,
                background: C.hRaise,
                color: C.hMuted,
                fontSize: 11,
                whiteSpace: "nowrap",
                opacity: Math.min(1, t * 1.5),
                transform: `scale(${0.7 + 0.3 * t})`,
              }}
            >
              <span style={{ display: "inline-grid", placeItems: "center", width: 15, height: 15, borderRadius: 4, background: C.hHair, fontSize: 10 }}>{i + 1}</span>
              {src}
            </div>
          );
        })}
      </div>
      {actionsAt !== undefined && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, paddingTop: 10, borderTop: `0.5px solid ${C.hHair}`, opacity: ease(f, [actionsAt, actionsAt + 6], [0, 1]) }}>
          <HudButton label="Insert" kbd="⏎" primary />
          <HudButton label="Copy" />
        </div>
      )}
    </div>
  );
};

const ring = (f: number, at: number, max = 900, color = "rgba(0,0,0,0.35)") => {
  const t = ease(f, [at, at + 22], [0, 1], Easing.out(Easing.cubic));
  if (f < at || t >= 1) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: max,
        height: max,
        marginLeft: -max / 2,
        marginTop: -max / 2,
        borderRadius: "50%",
        border: `${3 * (1 - t) + 0.5}px solid ${color}`,
        transform: `scale(${0.12 + 0.88 * t})`,
        opacity: 1 - t,
      }}
    />
  );
};

const Light: React.FC = () => <Backdrop />;
const Dark: React.FC = () => <Backdrop dark />;

// ---------------------------------------------------------------- shots
type ShotProps = { start: number; len: number };

/** The pointer, drawn at `k`× (a plain arrow: no OS in particular). */
const Cursor: React.FC<{ x: number; y: number; k?: number }> = ({ x, y, k = 2.2 }) => (
  <svg width={22 * k} height={32 * k} viewBox="0 0 22 32" style={{ position: "absolute", left: x, top: y, overflow: "visible", filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.25))" }}>
    <path d="M2 2 L2 25 L7.6 19.8 L11.6 29.2 L15.4 27.6 L11.5 18.6 L19 18.6 Z" fill={C.fg} stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
  </svg>
);

/** The brand line, "Your desktop colleague.": one line in 16:9, two in 9:16 (the tagline). */
const TAG_LINES = (tall: boolean) => (tall ? [[0, 1], [2]] : [[0, 1, 2]]);
const TAG_SIZE = (tall: boolean) => (tall ? 140 : 150);

/** v5's opening: the orb's slide, and the slam line word by word on the voice (public/vo/colleague.json). */
export const OPEN = () => {
  const vAt = beat(VO.find((v) => v[0] === "colleague")![1]);
  return { slide: lb(0, 2.5), land: lb(0, 2.5) + 22, line: vo.colleague.words.map((x) => vAt + Math.round(x.start * 30)) };
};

/**
 * 0:00 an empty desktop, a quiet beat. ~0:02 the orb slides in and settles
 * beside the pointer, like someone pulling up a chair. Then the line.
 */
const Open: React.FC<ShotProps> = ({ len }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tall = useTall();
  const { slide, land, line } = OPEN();
  // the pointer drifts in and comes to rest
  const cur = ease(f, [4, 40], [0, 1], ARRIVE);
  const px = Math.round((tall ? 470 : 905) + (1 - cur) * (tall ? 120 : 180));
  const py = Math.round((tall ? 1230 : 700) + (1 - cur) * 70);
  // the orb: slides in from the right on a low arc and settles beside the pointer
  const s = settle(spring({ frame: f - slide, fps, config: { damping: 15, stiffness: 70, mass: 1 } }));
  const ox = px + 66 + (1 - s) * (tall ? 700 : 1100);
  const oy = py + 50 - Math.sin(Math.min(1, s) * Math.PI) * 26;
  const bump = pulse(f, [land], 6);
  // v6: "Say hi to your new desktop colleague." (two lines; three in 9:16)
  const lines = tall ? [[0, 1, 2], [3, 4, 5], [6]] : [[0, 1, 2, 3, 4], [5, 6]];
  const words = vo.colleague.text.split(" ");
  return (
    <AbsoluteFill>
      <Light />
      <AbsoluteFill style={{ transform: `scale(${1 + ease(f, [line[0], len], [0, 0.035], Easing.linear)})`, transformOrigin: tall ? "50% 60%" : "50% 55%" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: tall ? 470 : 170, display: "grid", justifyItems: "center", rowGap: 4 }}>
          {lines.map((ix, k) => (
            <Slam key={k} words={ix.map((i) => ({ t: words[i], at: line[i] - 2 }))} size={tall ? 124 : 132} style={{ justifyContent: "center" }} />
          ))}
        </div>
        <Cursor x={px} y={py} />
        {f >= slide - 1 && (
          <div style={{ position: "absolute", left: ox, top: oy, transform: `scale(${1 + 0.1 * bump})`, filter: s < 0.9 ? `blur(${(1 - s) * 5}px)` : undefined }}>
            <LensOrb k={1.05} color={C.fg} glow={0} spin={0.35} />
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** "You talk." and the recording pill (v4's "Speak." shot). */
export const TALK = { you: 2, talk: 19, pill: 27 };
const Talk: React.FC<ShotProps> = ({ len }) => {
  const f = useCurrentFrame();
  const tall = useTall();
  return (
    <AbsoluteFill>
      <Light />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `scale(${1 + ease(f, [0, len], [0, 0.06], Easing.linear)})` }}>
        <Slam
          words={[
            { t: "You", at: TALK.you },
            { t: "talk.", at: TALK.talk },
          ]}
          size={tall ? 200 : 260}
          style={{ justifyContent: "center", whiteSpace: "nowrap" }}
        />
      </AbsoluteFill>
      <LivePill at={TALK.pill} y={tall ? 1160 : 780} />
    </AbsoluteFill>
  );
};

/** The recording pill (src/overlay): red dot, nine live levels, timer. */
const LivePill: React.FC<{ at: number; y: number; scale?: number }> = ({ at, y, scale = 2 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = springAt(f, fps, at, { damping: 16, stiffness: 300 });
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: y,
          width: 184,
          height: 40,
          boxSizing: "border-box",
          borderRadius: 24,
          background: "rgba(18,18,22,0.85)",
          boxShadow: "inset 0 0.5px 0 rgba(255,255,255,0.14), 0 12px 30px -10px rgba(0,0,0,0.4)",
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          padding: "0 14px",
          transform: `scale(${scale * (0.6 + 0.4 * s)})`,
          opacity: Math.min(1, s * 1.5),
          fontFamily: FONT,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: 4, background: C.rec }} />
        <Levels />
        <span style={{ justifySelf: "end", fontSize: 12, color: C.hFaint, fontVariantNumeric: "tabular-nums" }}>0:0{Math.max(0, Math.floor((f - at) / 30))}</span>
      </div>
    </AbsoluteFill>
  );
};

export const Levels: React.FC<{ live?: number }> = ({ live = 1 }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, height: 18 }}>
      {Array.from({ length: 9 }).map((_, i) => {
        const env = 1 - Math.abs(i - 4) / 6;
        const v = 0.5 + 0.5 * Math.sin(f * 0.7 + i * 1.7) * Math.sin(f * 0.23 + i * 0.9);
        return <i key={i} style={{ width: 4, height: 3 + live * env * v * 15, borderRadius: 2, background: C.hInk, display: "block" }} />;
      })}
    </div>
  );
};

type Tok = { raw: string; fin?: string; drop?: boolean };
const TOKENS: Tok[] = [
  { raw: "um", drop: true },
  { raw: "so", drop: true },
  { raw: "can", fin: "Can" },
  { raw: "we" },
  { raw: "uh", drop: true },
  { raw: "move" },
  { raw: "the" },
  { raw: "sync" },
  { raw: "to" },
  { raw: "like", drop: true },
  { raw: "three thirty", fin: "3:30" },
  { raw: "on" },
  { raw: "thursday", fin: "Thursday?" },
];
/** Generous width for a token at 14px (only a ceiling for the collapse; never clips). */
const cw = (s: string) => s.length * 8.6 + 10;
export const WRITES = { streamFrom: 2, streamTo: 30, polish: 36, land: lb(7, 10.5) };

const Writes: React.FC<ShotProps> = ({ len }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tall = useTall();
  const { streamFrom, streamTo, polish, land } = WRITES;
  const word = land + 6;
  const win = springAt(f, fps, 0, { damping: 20, stiffness: 200 });
  const cam = camera(
    f,
    tall
      ? [
          [0, 1.25, 610, 300],
          [land - 2, 1.25, 610, 300],
          [land + 14, 1.42, 548, 222],
          [len, 1.42, 548, 222],
        ]
      : [
          [0, 1.5, 640, 330],
          [land - 2, 1.5, 640, 330],
          [land + 14, 1.45, 400, 225],
          [len, 1.45, 400, 225],
        ],
  );
  const flyT = ease(f, [land - 4, land + 6], [0, 1], Easing.bezier(0.3, 0, 0.1, 1));
  const landed = f >= land + 6;
  const typedN = Math.round(interpolate(f, [streamFrom, streamTo], [0, TOKENS.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const WX = 380;
  const WY = 90;
  const pillW = tall ? 400 : 480;
  const veil = ease(f, [word - 4, word + 6], [0, 1]);
  return (
    <AbsoluteFill>
      <Light />
      <Stage {...cam}>
        <MacWindow w={700} h={420} title="New Message" style={{ left: WX, top: WY + Math.round((1 - win) * 30) }}>
          <div style={{ padding: "0 16px", fontSize: 13, color: C.fg }}>
            {[
              ["To:", "Sam Rivera"],
              ["Subject:", "Thursday sync"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 8, height: 34, alignItems: "center", borderBottom: "0.5px solid rgba(0,0,0,0.07)" }}>
                <span style={{ color: C.subtle, width: 56 }}>{k}</span>
                <span>{v}</span>
              </div>
            ))}
            <div style={{ paddingTop: 16, fontSize: 14, lineHeight: 1.6 }}>
              <div style={{ color: C.muted, marginBottom: 6 }}>Hi Sam,</div>
              <div style={{ height: 24, whiteSpace: "nowrap" }}>{landed ? "Can we move the sync to 3:30 on Thursday?" : null}</div>
              <div style={{ marginTop: 22, display: "grid", gap: 9 }}>
                <Bar w={360} />
                <Bar w={290} />
              </div>
            </div>
          </div>
        </MacWindow>
        {/* the Live pill, its words polished in place */}
        <div
          style={{
            position: "absolute",
            left: WX + 30,
            top: WY + 236,
            width: pillW,
            boxSizing: "border-box",
            borderRadius: 22,
            background: "rgba(18,18,22,0.86)",
            boxShadow: "inset 0 0.5px 0 rgba(255,255,255,0.14), 0 12px 32px -8px rgba(0,0,0,0.35)",
            color: C.hInk,
            fontFamily: FONT,
            opacity: Math.min(1, win * 1.5) * (1 - ease(f, [land, land + 8], [0, 1])),
          }}
        >
          <div style={{ padding: "12px 16px 2px", fontSize: 14, lineHeight: 1.5, minHeight: 24, whiteSpace: tall ? "normal" : "nowrap", opacity: 1 - Math.min(1, flyT * 3) }}>
            {TOKENS.map((t, i) => {
              if (i >= typedN) return null;
              const p = ease(f, [polish + i * 0.8, polish + 8 + i * 0.8], [0, 1]);
              const collapse = t.drop ? ease(f, [polish + 6, polish + 14], [0, 1]) : 0;
              const rawW = cw(t.raw);
              const finW = t.fin ? t.fin.length * 7.4 + 5 : rawW; // the polished word's own width (the raw one stays in the grid)
              return (
                <span
                  key={i}
                  style={{
                    display: "inline-block",
                    verticalAlign: "top",
                    maxWidth: t.drop ? rawW * (1 - collapse) : rawW + (finW - rawW) * p,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    position: "relative",
                    opacity: 1 - collapse,
                    color: t.drop ? `rgba(255,255,255,${0.95 - 0.45 * p})` : C.hInk,
                  }}
                >
                  {t.fin ? (
                    <span style={{ display: "inline-grid", justifyItems: "start" }}>
                      <span style={{ gridArea: "1/1", opacity: 1 - p }}>{t.raw}&nbsp;</span>
                      <span style={{ gridArea: "1/1", opacity: p }}>{t.fin}&nbsp;</span>
                    </span>
                  ) : (
                    <>{t.raw}&nbsp;</>
                  )}
                  {t.drop && <span style={{ position: "absolute", left: 0, top: "52%", height: 1.5, width: `${p * 85}%`, background: C.rec }} />}
                </span>
              );
            })}
          </div>
          <div style={{ height: 40, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "0 14px" }}>
            <span style={{ width: 7, height: 7, borderRadius: 4, background: f > polish ? "rgba(255,255,255,0.4)" : C.rec }} />
            {f > polish ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap" }}>
                <Orb size={14} color="#fff" speed={3} />
                Polishing
              </div>
            ) : (
              <Levels />
            )}
            <span />
          </div>
        </div>
        {/* the line flying into the email */}
        {flyT > 0 && !landed && (
          <div
            style={{
              position: "absolute",
              left: interpolate(flyT, [0, 1], [WX + 46, WX + 16]),
              top: interpolate(flyT, [0, 1], [WY + 248, WY + 32 + 68 + 16 + 28]),
              fontSize: 14,
              lineHeight: 1.6,
              fontFamily: FONT,
              whiteSpace: "nowrap",
              color: flyT > 0.5 ? C.fg : "#fff",
            }}
          >
            Can we move the sync to 3:30 on Thursday?
          </div>
        )}
      </Stage>
      {/* a soft veil under the caption so it never sits on top of the window */}
      <AbsoluteFill
        style={{
          background: tall
            ? `linear-gradient(180deg, rgba(245,245,247,${0.95 * veil}) 0%, rgba(245,245,247,${0.95 * veil}) 30%, rgba(245,245,247,0) 44%)`
            : `linear-gradient(90deg, rgba(245,245,247,${0.95 * veil}) 0%, rgba(245,245,247,${0.95 * veil}) 38%, rgba(245,245,247,0) 47%)`,
        }}
      />
      <SideWord text="It writes." at={word} />
    </AbsoluteFill>
  );
};

/**
 * Answers / acts / remembers: the UI (built at stage x 600..600+uiW) is framed
 * so it starts at x ≥ 900 in 16:9 (the caption ends by 820), and sits under the
 * caption in 9:16.
 */
const ProductShot: React.FC<{ word: string; wordAt: number; len: number; uiW: number; tallCy?: number; children: ReactNode }> = ({ word, wordAt, len, uiW, tallCy = 228, children }) => {
  const f = useCurrentFrame();
  const tall = useTall();
  const t = interpolate(f, [0, len], [0, 1], { easing: Easing.out(Easing.quad) });
  const cam = tall ? { zoom: 1.25 + 0.04 * t, cx: 600 + uiW / 2, cy: tallCy } : { zoom: 1.2 + 0.08 * t, cx: 620, cy: 262 };
  return (
    <AbsoluteFill>
      <Light />
      <Stage {...cam}>{children}</Stage>
      <SideWord text={word} at={wordAt} />
    </AbsoluteFill>
  );
};

/**
 * v5, smart writing: an instruction, not words to type. "tell Ana Thursday
 * works, after three" becomes the message itself, with the HUD's chip
 * (hud-chip / hud-undo look): "Written for you · Use my words".
 */
export const SMART = { pill: 2, streamTo: 18, writing: 22, msg: 28, msgTo: 42, chip: 42 };
const INSTRUCTION = "tell Ana Thursday works, after three";
const MESSAGE = "Thursday works for me — any time after 3pm.";

const Smart: React.FC<ShotProps> = ({ len }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { pill, streamTo, writing, msg, msgTo, chip } = SMART;
  const win = springAt(f, fps, 0, { damping: 20, stiffness: 240 });
  const p = springAt(f, fps, pill, { damping: 18, stiffness: 300 });
  const pillOut = ease(f, [msg - 2, msg + 6], [1, 0]);
  const c = springAt(f, fps, chip, { damping: 16, stiffness: 320 });
  return (
    <ProductShot word="It writes." wordAt={-120} len={len} uiW={380}>
      <MacWindow w={380} h={236} title="Ana Lopez" style={{ left: 600, top: 118 + Math.round((1 - win) * 24), opacity: Math.min(1, win * 1.6) }}>
        <div style={{ padding: "14px 16px 0", display: "flex", gap: 10, color: C.fg }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: "#8fa9b8", flex: "none", display: "grid", placeItems: "center", color: "#fff", fontSize: 13, fontWeight: 500 }}>A</div>
          <div style={{ display: "grid", gap: 3 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500 }}>
              Ana <span style={{ color: C.subtle, fontWeight: 400, fontSize: 11 }}>10:42</span>
            </div>
            <div style={{ fontSize: 13, whiteSpace: "nowrap" }}>Does Thursday work for the dry run?</div>
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 14,
            right: 14,
            bottom: 16,
            height: 64,
            boxSizing: "border-box",
            borderRadius: 9,
            boxShadow: `inset 0 0 0 ${f >= msg ? 1 : 0.5}px rgba(0,0,0,${f >= msg ? 0.16 : 0.12})`,
            padding: "10px 12px",
            fontSize: 13,
            lineHeight: 1.5,
            color: C.fg,
            whiteSpace: "nowrap",
          }}
        >
          {f < msg ? <span style={{ color: C.subtle }}>Message Ana</span> : <Stream text={MESSAGE} from={msg} to={msgTo} />}
        </div>
      </MacWindow>
      {/* the Live pill: the instruction, then "Writing" */}
      <div
        style={{
          position: "absolute",
          left: 600,
          top: 368,
          width: 380,
          boxSizing: "border-box",
          borderRadius: 22,
          background: "rgba(18,18,22,0.86)",
          boxShadow: "inset 0 0.5px 0 rgba(255,255,255,0.14), 0 12px 32px -8px rgba(0,0,0,0.35)",
          color: C.hInk,
          fontFamily: FONT,
          opacity: Math.min(1, p * 1.5) * pillOut,
          transform: `translateY(${(1 - p) * 10 - (1 - pillOut) * 12}px)`,
        }}
      >
        <div style={{ padding: "12px 16px 2px", fontSize: 14, lineHeight: 1.5, minHeight: 21, whiteSpace: "nowrap", opacity: f >= writing ? 0.62 : 1 }}>
          <Stream text={INSTRUCTION} from={pill + 1} to={streamTo} />
        </div>
        <div style={{ height: 40, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "0 14px" }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: f >= writing ? "rgba(255,255,255,0.4)" : C.rec }} />
          {f >= writing ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap" }}>
              <Orb size={14} color="#fff" speed={3} />
              Writing
            </div>
          ) : (
            <Levels />
          )}
          <span />
        </div>
      </div>
      {/* the chip, under the message it wrote */}
      <div
        style={{
          ...hudCard,
          left: 614,
          top: 344,
          padding: "0 5px 0 9px",
          height: 32,
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          whiteSpace: "nowrap",
          opacity: Math.min(1, c * 1.5),
          transform: `translateY(${(1 - c) * -8}px) scale(${0.92 + 0.08 * c})`,
          transformOrigin: "0 0",
        }}
      >
        <Orb size={14} color="#fff" floor={0.4} speed={1.2} />
        <span>Written for you</span>
        <span style={{ color: C.hFaint }}>·</span>
        <div style={{ height: 22, padding: "0 8px", borderRadius: 7, background: C.hRaise, color: C.hInk, display: "grid", placeItems: "center" }}>Use my words</div>
      </div>
    </ProductShot>
  );
};

const Answers: React.FC<ShotProps> = ({ len }) => (
  <ProductShot word="It answers." wordAt={0} len={len} uiW={380}>
    <Request text="What's the UK capital gains rate?" at={3} style={{ left: 600, top: 150 }} />
    <AnswerCard
      at={12}
      style={{ left: 600, top: 204 }}
      q="What's the UK capital gains rate?"
      a="18% if you're a basic-rate taxpayer, 24% above that. The first £3,000 of gains each year is tax-free."
      sources={["gov.uk", "Capital Gains Tax rates", "which.co.uk"]}
      srcAt={[48, 56, 64]}
      actionsAt={74}
    />
  </ProductShot>
);

const Acts: React.FC<ShotProps> = ({ start, len }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hit = lb(start, 17);
  const s1 = springAt(f, fps, hit, { damping: 16, stiffness: 340 });
  const s2 = springAt(f, fps, lb(start, 17.5), { damping: 18, stiffness: 260 });
  const roll = ease(f, [lb(start, 18), lb(start, 18) + 10], [0, 1], ARRIVE);
  return (
    <ProductShot word="It acts." wordAt={0} len={len} uiW={340}>
      <Request text="Remind me at 5 to call Sam" at={3} style={{ left: 600, top: 170 }} />
      <div style={{ ...hudCard, left: 600, top: 224, width: 340, display: "flex", alignItems: "center", gap: 8, fontSize: 13, whiteSpace: "nowrap", opacity: Math.min(1, s1 * 1.5), transform: `scale(${0.85 + 0.15 * s1})`, transformOrigin: "0 50%" }}>
        <Check />
        <span style={{ color: C.success }}>Reminder added</span>
        <span style={{ color: C.hMuted }}>· Today</span>
        <div style={{ marginLeft: "auto", height: 24, padding: "0 10px", borderRadius: 7, background: C.hRaise, fontSize: 12, display: "grid", placeItems: "center" }}>Undo</div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 600,
          top: 282,
          width: 300,
          boxSizing: "border-box",
          borderRadius: 12,
          background: "rgba(255,255,255,0.9)",
          boxShadow: "0 0 0 0.5px rgba(0,0,0,0.08), 0 16px 40px -16px rgba(20,24,40,0.3)",
          padding: "10px 12px",
          fontFamily: FONT,
          opacity: Math.min(1, s2 * 1.5),
          transform: `translateY(${(1 - s2) * 20}px)`,
        }}
      >
        <div style={{ fontSize: 11, color: C.subtle, marginBottom: 6, fontWeight: 500 }}>Reminders · Today</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 16, height: 16, borderRadius: 8, border: "1.5px solid #c7c7cc", flex: "none" }} />
          <div style={{ fontSize: 13, color: C.fg, flex: 1 }}>Call Sam</div>
          {/* the time rolls into place */}
          <div style={{ height: 16, overflow: "hidden", fontSize: 12, color: C.rec, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            <div style={{ transform: `translateY(${-16 * roll}px)` }}>
              <div style={{ height: 16 }}>4:59 PM</div>
              <div style={{ height: 16 }}>5:00 PM</div>
            </div>
          </div>
        </div>
      </div>
    </ProductShot>
  );
};

const Remembers: React.FC<ShotProps> = ({ len }) => (
  <ProductShot word="It remembers." wordAt={0} len={len} uiW={380}>
    <Request text="What did I say about pricing yesterday?" at={3} style={{ left: 600, top: 160 }} />
    <AnswerCard
      at={14}
      style={{ left: 600, top: 214 }}
      q="What did I say about pricing yesterday?"
      a="That Pro stays at $12 a month, $9 billed yearly, and free dictation stays unlimited."
      sources={["Dictation · Yesterday 4:12 PM", "Pricing review · Meeting"]}
      srcAt={[48, 58]}
    />
  </ProductShot>
);

/**
 * v5, "It nudges you.": one suggestion held long enough to play out. A
 * 40-message thread, the offer to summarise it, a spoken "yes", the summary.
 */
export const NUDGE = { card: 30, yes: 64, press: 80, out: 84, sum: 92 };
const SUMMARY = ["Launch moves to the 14th", "Priya sends the press kit Friday", "Tom signs off the pricing page"];
const THREAD = ["Priya", "Tom", "Ana", "Sam", "Priya", "Tom", "Ana", "Priya", "Sam", "Tom"];

const Nudge: React.FC<ShotProps> = ({ len }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { card, yes, press: pressAt, out, sum: sumAt } = NUDGE;
  const win = springAt(f, fps, 0, { damping: 20, stiffness: 240 });
  const k = springAt(f, fps, card, { damping: 20, stiffness: 300 });
  const gone = ease(f, [out, out + 10], [0, 1]);
  const sum = springAt(f, fps, sumAt, { damping: 18, stiffness: 260 });
  const scroll = ease(f, [0, sumAt], [0, 150], Easing.linear);
  const drain = ease(f, [card, card + 8 * 30], [1, 0], Easing.linear);
  const g = ["#7d93c9", "#c99a8a", "#8fa9b8", "#9aa3b5"];
  return (
    <ProductShot word="It nudges you." wordAt={0} len={len} uiW={380} tallCy={160}>
      <MacWindow w={380} h={244} title="Inbox" style={{ left: 600, top: 84 + Math.round((1 - win) * 24), opacity: Math.min(1, win * 1.6) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 14px", borderBottom: "0.5px solid rgba(0,0,0,0.07)", whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: C.fg }}>Re: Launch plan</span>
          <span style={{ height: 20, padding: "0 8px", borderRadius: 10, background: "rgba(0,0,0,0.06)", color: C.muted, fontSize: 11, display: "grid", placeItems: "center" }}>40 messages</span>
        </div>
        <div style={{ position: "absolute", top: 36, left: 0, right: 0, bottom: 0, overflow: "hidden", opacity: 1 - 0.35 * sum }}>
          <div style={{ transform: `translateY(${-Math.round(scroll)}px)`, padding: "6px 14px", display: "grid", gap: 6 }}>
            {THREAD.map((n, i) => (
              <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "6px 0", borderBottom: "0.5px solid rgba(0,0,0,0.05)" }}>
                <div style={{ width: 20, height: 20, borderRadius: 10, background: g[i % 4], flex: "none" }} />
                <div style={{ display: "grid", gap: 6, paddingTop: 2 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 500, color: C.fg, lineHeight: 1 }}>{n}</div>
                  <Bar w={[250, 210, 280, 190, 240][i % 5]} o={0.8} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </MacWindow>
      {/* the suggestion: the HUD card, its buttons wrapping under the title as in the app */}
      <div
        style={{
          ...hudCard,
          left: 600,
          top: 300,
          width: 380,
          overflow: "hidden",
          opacity: Math.min(1, k * 1.4) * (1 - gone),
          transform: `translateY(${(1 - k) * -8 - gone * 6}px) scale(${0.98 + 0.02 * k})`,
          filter: k < 0.98 ? `blur(${(1 - k) * 4}px)` : undefined,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
          <RingOrb size={18} color={C.hInk} />
          <span style={{ fontSize: 13 }}>Want me to summarise this 40-message thread?</span>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 10 }}>
          <HudButton label="Summarise" kbd="⏎" primary press={press(f, pressAt)} />
          <HudButton label="Not now" kbd="esc" />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1.5, background: "rgba(255,255,255,0.35)", transformOrigin: "left", transform: `scaleX(${drain})` }} />
      </div>
      {/* the answer, spoken */}
      <div style={{ opacity: 1 - gone }}>
        <Request text="“yes”" at={yes} style={{ left: 600, top: 400 }} />
      </div>
      {/* the summary */}
      <div style={{ ...hudCard, left: 600, top: 300, width: 380, opacity: Math.min(1, sum * 1.5), transform: `translateY(${(1 - sum) * 14}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
          <Orb size={18} color="#fff" speed={1.5} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>Summary</span>
          <span style={{ fontSize: 12, color: C.hMuted }}>· 40 messages</span>
        </div>
        {SUMMARY.map((it, i) => {
          const t = springAt(f, fps, sumAt + 8 + i * 6, { damping: 18, stiffness: 320 });
          return (
            <div key={it} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, marginTop: 9, whiteSpace: "nowrap", opacity: Math.min(1, t * 1.5), transform: `translateX(${(1 - t) * -10}px)` }}>
              <span style={{ width: 4, height: 4, borderRadius: 2, background: C.hMuted, flex: "none" }} />
              {it}
            </div>
          );
        })}
      </div>
    </ProductShot>
  );
};

/** The frame "Hey" is said (v6: "Hands-free, too: Hey Ambient."). */
export const heyAt = () => Math.round(vo.hey.words.find((w) => w.w === "Hey")!.start * 30) - 2;

const Hey: React.FC<ShotProps> = () => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const tall = useTall();
  const at = heyAt();
  const wake = springAt(f, fps, at, { damping: 12, stiffness: 140 });
  const cy = tall ? height * 0.36 : 380; // v6: raised, so the dots clear the three lines under it
  const rx = tall ? 400 : 495;
  const ry = tall ? 360 : 210;
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Dark />
      {Array.from({ length: 20 }).map((_, i) => {
        const a = (i / 20) * Math.PI * 2 + f * 0.01;
        const k = 1 - wake * 0.12;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: width / 2 + Math.cos(a) * rx * k - 3,
              top: cy + Math.sin(a) * ry * k - 3,
              width: 6,
              height: 6,
              borderRadius: 3,
              background: "#fff",
              opacity: ease(f, [i, i + 8], [0, 1]) * (0.25 + 0.5 * wake * (0.5 + 0.5 * Math.sin(i + f * 0.2))),
            }}
          />
        );
      })}
      <div style={{ position: "absolute", left: 0, right: 0, top: cy, height: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {ring(f, at, 900, "rgba(255,255,255,0.45)")}
        <div style={{ transform: `scale(${(0.8 + 0.3 * wake) * (1 + 0.04 * Math.sin(f * 0.21))})`, opacity: ease(f, [0, 8], [0, 0.55]) + 0.45 * Math.min(1, wake) }}>
          <Orb size={170} color="#fff" floor={0.14} speed={0.6 + wake * 1.4} />
        </div>
      </div>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: tall ? 560 : 200 }}>
        {/* v6: an also, not an either/or: "Hands-free, too:" on the voice, then the phrase */}
        <Slam
          words={vo.hey.words.slice(0, 2).map((w) => ({ t: w.w, at: Math.round(w.start * 30) + 2 }))}
          size={tall ? 46 : 44}
          color="rgba(255,255,255,0.78)"
          style={{ marginBottom: 22 }}
        />
        <Slam words={[{ t: "“Hey", at }, { t: "Ambient”", at: at + 5 }]} size={tall ? 100 : 108} color="#fff" />
        <div style={{ marginTop: 28, fontSize: tall ? 34 : 32, fontWeight: 300, letterSpacing: "-0.01em", lineHeight: 1.35, color: C.mutedDark, opacity: ease(f, [at + 10, at + 18], [0, 1]) }}>Optional, and off until you turn it on.</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const PEOPLE = [
  { n: "Priya", i: "P", g: ["#7d93c9", "#b9c8e6"] },
  { n: "Tom", i: "T", g: ["#c99a8a", "#e8d2c8"] },
  { n: "Ana", i: "A", g: ["#8fa9b8", "#c6d4de"] },
  { n: "You", i: "M", g: ["#9aa3b5", "#d9d4cf"] },
];

export const MEETING = (start: number) => ({ suggest: lb(start, 32.5), accept: lb(start, 33.5), panel: lb(start, 34) });

const Meeting: React.FC<ShotProps> = ({ start, len }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tall = useTall();
  const { suggest, accept, panel: panelAt } = MEETING(start);
  const panel = springAt(f, fps, panelAt, { damping: 18, stiffness: 220 });
  const rows = [lb(start, 34.5), lb(start, 35), lb(start, 35.5)];
  const cam = camera(
    f,
    tall
      ? [
          [0, 0.85, 340, 280],
          [accept, 0.95, 340, 262],
          [panelAt + 8, 1.4, 750, 200],
          [len, 1.45, 750, 196],
        ]
      : [
          [0, 1.35, 400, 270],
          [accept, 1.45, 430, 250],
          [panelAt + 8, 1.45, 620, 270],
          [len, 1.5, 632, 270],
        ],
  );
  const speaker = f < rows[0] ? 0 : f < rows[1] ? 3 : 1;
  const transcript = [
    { who: "Them", t: "Can you send the Q3 numbers by Friday?" },
    { who: "You", t: "Sure, I'll pull them today." },
    { who: "Them", t: "And let's move the launch to the 14th." },
  ];
  return (
    <AbsoluteFill>
      <Light />
      <Stage {...cam}>
        <MacWindow dark w={560} h={340} title="Weekly sync" style={{ left: 60, top: 110 }}>
          {PEOPLE.map((p, i) => (
            <div
              key={p.n}
              style={{
                position: "absolute",
                left: 10 + (i % 2) * 272,
                top: 10 + Math.floor(i / 2) * 150,
                width: 266,
                height: 144,
                borderRadius: 10,
                background: `linear-gradient(135deg, ${p.g[0]}, ${p.g[1]})`,
                boxShadow: i === speaker ? "inset 0 0 0 2px rgba(255,255,255,0.95)" : "none",
                display: "grid",
                placeItems: "center",
                transform: `scale(${1 - 0.04 * ease(f, [i * 2, i * 2 + 8], [1, 0], ARRIVE)})`,
              }}
            >
              <div style={{ width: 54, height: 54, borderRadius: 27, background: "rgba(255,255,255,0.35)", display: "grid", placeItems: "center", fontSize: 22, fontWeight: 400, color: "#fff", transform: `scale(${1 + (i === speaker ? 0.08 * (0.5 + 0.5 * Math.sin(f * 0.8)) : 0)})` }}>{p.i}</div>
              <div style={{ position: "absolute", left: 8, bottom: 7, fontSize: 11, color: "#fff", padding: "2px 7px", borderRadius: 6, background: "rgba(0,0,0,0.28)", whiteSpace: "nowrap" }}>{p.n}</div>
            </div>
          ))}
        </MacWindow>
        <Suggestion title="Take notes for this call?" accept="Take notes" at={suggest} out={accept + 8} pressAccept={accept} style={{ left: 140, top: 150 }} />
        <div
          style={{
            position: "absolute",
            left: 580 + (1 - panel) * 80,
            top: 100,
            width: 340,
            minHeight: 186,
            borderRadius: 14,
            background: "rgba(255,255,255,0.93)",
            boxShadow: "0 0 0 0.5px rgba(0,0,0,0.08), 0 24px 60px -18px rgba(20,24,40,0.45)",
            opacity: Math.min(1, panel * 1.5),
            fontFamily: FONT,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderBottom: "0.5px solid rgba(0,0,0,0.07)", whiteSpace: "nowrap" }}>
            <span style={{ width: 7, height: 7, borderRadius: 4, background: C.rec }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: C.fg }}>Weekly sync</span>
            <span style={{ fontSize: 12, color: C.subtle }}>· Live notes</span>
          </div>
          <div style={{ padding: "8px 14px" }}>
            {transcript.map((r, i) => {
              const t = springAt(f, fps, rows[i], { damping: 18, stiffness: 300 });
              return (
                <div key={i} style={{ display: "flex", gap: 10, padding: "6px 0", fontSize: 12.5, lineHeight: 1.45, color: C.fg, opacity: Math.min(1, t * 1.5), transform: `translateY(${(1 - t) * 12}px)` }}>
                  <span style={{ width: 38, flex: "none", color: r.who === "You" ? C.fg : C.subtle, fontWeight: 500 }}>{r.who}</span>
                  <span>{r.t}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Stage>
    </AbsoluteFill>
  );
};

export const NOBOT = (start: number) => ({ press: lb(start, 37), sum: lb(start, 38), word: lb(start, 40) });

const NoBot: React.FC<ShotProps> = ({ start }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tall = useTall();
  const { press, sum: sumAt, word } = NOBOT(start);
  const nudge = springAt(f, fps, 0, { damping: 16, stiffness: 320 });
  const sum = springAt(f, fps, sumAt, { damping: 18, stiffness: 260 });
  const toWord = ease(f, [word - 2, word + 4], [0, 1]);
  return (
    <AbsoluteFill>
      <Dark />
      <AbsoluteFill style={{ opacity: 1 - toWord, transform: `scale(${1 + toWord * 0.1})` }}>
        <Stage zoom={(tall ? 1.35 : 1.7) + ease(f, [0, word], [0, 0.15])} cx={480} cy={250}>
          <div style={{ ...hudCard, left: 300, top: 120, width: 360, display: "flex", alignItems: "center", gap: 8, opacity: Math.min(1, nudge * 1.5), transform: `scale(${0.85 + 0.15 * nudge})` }}>
            <Orb size={18} color="#fff" />
            <span style={{ fontSize: 13, flex: 1, whiteSpace: "nowrap" }}>
              They asked: <span style={{ color: C.hMuted }}>Q3 numbers</span>
            </span>
            <HudButton label="Find it" kbd="⏎" primary press={pulse(f, [press], 3)} />
          </div>
          <div
            style={{
              position: "absolute",
              left: 300,
              top: 178,
              width: 360,
              boxSizing: "border-box",
              borderRadius: 14,
              background: "rgba(255,255,255,0.95)",
              boxShadow: "0 0 0 0.5px rgba(0,0,0,0.08), 0 24px 60px -20px rgba(0,0,0,0.5)",
              padding: "14px 16px",
              fontFamily: FONT,
              color: C.fg,
              opacity: Math.min(1, sum * 1.5),
              transform: `translateY(${(1 - sum) * 18}px)`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Orb size={16} floor={0.15} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>Summary</span>
              <span style={{ fontSize: 12, color: C.subtle }}>· Weekly sync</span>
            </div>
            {["Send the Q3 numbers to Priya by Friday", "Draft the follow-up email"].map((it, i) => {
              const t = springAt(f, fps, lb(start, 38.5 + i * 0.25), { damping: 18, stiffness: 320 });
              return (
                <div key={it} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, marginTop: 9, whiteSpace: "nowrap", opacity: Math.min(1, t * 1.5), transform: `translateX(${(1 - t) * -10}px)` }}>
                  <div style={{ width: 12, height: 12, borderRadius: 4, border: "1.5px solid #c7c7cc", flex: "none" }} />
                  {it}
                </div>
              );
            })}
          </div>
        </Stage>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `rgba(11,11,13,${0.85 * toWord})`, alignItems: "center", justifyContent: "center" }}>
        <Slam words={[{ t: "No", at: word }, { t: "bot.", at: word + 5 }]} size={tall ? 220 : 260} color="#fff" />
        <div style={{ position: "absolute", bottom: tall ? 700 : 220, fontFamily: FONT_DISPLAY, fontSize: tall ? 36 : 32, fontWeight: 300, letterSpacing: "-0.01em", color: C.mutedDark, opacity: ease(f, [word + 12, word + 20], [0, 1]) }}>
          Nothing joins your call.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** v5: after the long one, two quick suggestions, three beats each (v4 had four). */
export const SUGGEST_EACH = 3;
export const SUGGEST_N = 2;
const Suggest: React.FC<ShotProps> = () => {
  const f = useCurrentFrame();
  const tall = useTall();
  const shots: { title: string; short: string; accept: string; ctx: ReactNode }[] = [
    { title: "There's a date in this. Add it to your calendar?", short: "Add Thursday 3pm to your calendar?", accept: "Add", ctx: <ChatCtx /> },
    { title: "Explain this error?", short: "Explain this error?", accept: "Explain", ctx: <TermCtx /> },
  ];
  const each = Math.round(SUGGEST_EACH * FB);
  const i = Math.min(SUGGEST_N - 1, Math.max(0, Math.floor(f / each)));
  const at = i * each;
  const s = shots[i];
  const z = (tall ? 1.0 : 1.45) + ease(f, [at, at + each], [0, tall ? 0.08 : 0.15], Easing.out(Easing.quad));
  return (
    <AbsoluteFill>
      <Light />
      <Whip len={each} dir={i % 2 ? -1 : 1} key={i}>
        <Stage zoom={z} cx={480 + (tall ? 0 : i % 2 ? -20 : 20)} cy={tall ? 250 : 230}>
          {s.ctx}
          <div style={{ position: "absolute", left: 0, top: 140, width: 960, display: "flex", justifyContent: "center" }}>
            <Suggestion title={tall ? s.short : s.title} accept={s.accept} at={at + 4} pressAccept={at + 30} style={{ position: "relative" }} />
          </div>
        </Stage>
      </Whip>
    </AbsoluteFill>
  );
};

const ChatCtx: React.FC = () => (
  <MacWindow w={620} h={420} title="#launch" style={{ left: 170, top: 90 }}>
    <div style={{ padding: "90px 22px 0", display: "grid", gap: 18, color: C.fg }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ display: "flex", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, background: ["#8fa9b8", "#c99a8a", "#7d93c9"][i], flex: "none" }} />
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{["Ana", "Tom", "Priya"][i]}</div>
            {i === 1 ? (
              <div style={{ fontSize: 14, whiteSpace: "nowrap" }}>
                Dry run on <span style={{ background: "rgba(64,84,140,0.12)", borderBottom: "1.5px solid rgba(64,84,140,0.55)", borderRadius: 3, padding: "0 2px" }}>Thursday at 3pm</span>?
              </div>
            ) : (
              <Bar w={[320, 0, 260][i]} />
            )}
          </div>
        </div>
      ))}
    </div>
  </MacWindow>
);

const TermCtx: React.FC = () => (
  <MacWindow dark w={620} h={420} title="zsh" style={{ left: 170, top: 90 }}>
    <div style={{ padding: "90px 18px 0", fontSize: 13, lineHeight: 1.75, color: "rgba(255,255,255,0.82)", fontFamily: "Menlo, monospace", whiteSpace: "nowrap" }}>
      <div>$ npm test</div>
      <div>
        <span style={{ background: "#f87171", color: "#1b1b1f", padding: "0 4px", borderRadius: 3 }}>FAIL</span> src/billing.test.ts
      </div>
      <div style={{ color: "#fca5a5" }}>TypeError: Cannot read properties of undefined (reading 'plan')</div>
      <div style={{ color: "rgba(255,255,255,0.45)" }}> at renew (src/billing.ts:42:18)</div>
    </div>
  </MacWindow>
);

export const APPS = ["Slack", "Gmail", "Notion", "Linear", "Cursor", "VS Code", "Google Docs", "Messages", "ChatGPT", "Figma"];
/** One app per beat (v4: twice v3's dwell) after a beat of "In any app." */
export const appAt = (i: number) => Math.round(FB + i * FB);

const Apps: React.FC<ShotProps> = () => {
  const f = useCurrentFrame();
  const tall = useTall();
  let i = -1;
  for (let k = 0; k < APPS.length; k++) if (f >= appAt(k)) i = k;
  const dark = i >= 0 && i % 2 === 0;
  const fg = dark ? "#fff" : C.fg;
  const at = i < 0 ? 0 : appAt(i);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      {dark ? <Dark /> : <Light />}
      <Slam
        words={[
          { t: "In", at: 0 },
          { t: "any", at: 4 },
          { t: "app.", at: 8 },
        ]}
        size={i < 0 ? (tall ? 170 : 260) : 64}
        color={fg}
        style={{ position: "absolute", top: i < 0 ? (tall ? 850 : 400) : tall ? 690 : 260, opacity: i < 0 ? 1 : 0.7, whiteSpace: "nowrap" }}
      />
      {i >= 0 && (
        <div style={{ transform: `scale(${1 + 0.06 * pulse(f, [at], 5)})` }}>
          <Slam key={i} words={[{ t: APPS[i], at }]} size={tall ? 150 : 240} color={fg} fast />
        </div>
      )}
    </AbsoluteFill>
  );
};

const Connect: React.FC<ShotProps> = ({ start, len }) => {
  const f = useCurrentFrame();
  const tall = useTall();
  const hits = [0, lb(start, 55), lb(start, 56)];
  return (
    <AbsoluteFill>
      <Light />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `scale(${1 + 0.04 * pulse(f, hits, 6) + ease(f, [0, len], [0, 0.05])})` }}>
        <Slam
          words={[
            { t: "Nothing", at: 0 },
            { t: "to", at: 5 },
            { t: "connect.", at: 9 },
          ]}
          size={tall ? 104 : 112}
          style={{ justifyContent: "center", maxWidth: tall ? 960 : 1700 }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const PHRASE = ["harbor", "violet", "candle", "mosaic", "ripple", "summit", "lantern", "orbit"];
export const privateCards = (start: number) => [lb(start, 58), lb(start, 59), lb(start, 60)];

const Private: React.FC<ShotProps> = ({ start, len }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tall = useTall();
  const cards = privateCards(start);
  const cardStyle = (k: number): CSSProperties => {
    const s = springAt(f, fps, cards[k], { damping: 17, stiffness: 280 });
    return {
      position: "relative",
      width: tall ? 820 : 460,
      minHeight: tall ? 0 : 290,
      borderRadius: 26,
      background: "rgba(255,255,255,0.85)",
      boxShadow: "0 0 0 1px rgba(0,0,0,0.06), 0 40px 80px -40px rgba(20,24,40,0.35)",
      padding: tall ? "28px 34px" : 34,
      boxSizing: "border-box",
      overflow: "hidden",
      color: C.fg,
      opacity: Math.min(1, s * 1.5),
      transform: `translateY(${(1 - s) * 80}px) rotate(${(1 - s) * (k - 1) * 4}deg)`,
      fontFamily: FONT,
    };
  };
  const blur = ease(f, [cards[1] + 8, cards[1] + 20], [0, 1]);
  const redact = ease(f, [cards[2] + 8, cards[2] + 18], [0, 1]);
  return (
    <AbsoluteFill>
      <Light />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `scale(${(tall ? 1 : 1.04) + ease(f, [0, len], [0, 0.06])})`, transformOrigin: "50% 60%" }}>
        <Slam
          words={[
            { t: "Private", at: 0 },
            { t: "by", at: 6 },
            { t: "design.", at: 10 },
          ]}
          size={tall ? 104 : 112}
          style={{ justifyContent: "center" }}
        />
        <div style={{ display: "flex", flexDirection: tall ? "column" : "row", gap: tall ? 24 : 28, marginTop: tall ? 60 : 70 }}>
          <div style={cardStyle(0)}>
            <div style={{ fontSize: tall ? 26 : 24, fontWeight: 500, letterSpacing: "-0.003em", color: C.muted }}>Never watched</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 22 }}>
              {["Passwords", "Keychain", "Private windows", "Messages", "Wallets"].map((c, i) => {
                const t = springAt(f, fps, cards[0] + 3 + i * 2, { damping: 16, stiffness: 360 });
                return (
                  <div key={c} style={{ height: 50, padding: "0 20px", borderRadius: 25, background: "rgba(0,0,0,0.05)", display: "grid", placeItems: "center", fontSize: 22, whiteSpace: "nowrap", transform: `scale(${t})` }}>
                    {c}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={cardStyle(1)}>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${tall ? 4 : 2}, 1fr)`, gap: 12, filter: blur > 0 ? `blur(${blur * 9}px)` : undefined }}>
              {PHRASE.map((w, i) => (
                <div key={w} style={{ height: 44, borderRadius: 10, background: "rgba(0,0,0,0.045)", display: "flex", alignItems: "center", gap: 10, padding: "0 14px", fontSize: 20, whiteSpace: "nowrap" }}>
                  <span style={{ color: C.subtle, fontSize: 16 }}>{i + 1}</span>
                  {w}
                </div>
              ))}
            </div>
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: `translate(-50%,-50%) scale(${0.8 + 0.2 * blur})`,
                opacity: blur,
                display: "flex",
                alignItems: "center",
                gap: 14,
                height: 64,
                padding: "0 28px 0 20px",
                borderRadius: 32,
                background: "rgba(18,18,22,0.88)",
                color: "#fff",
                fontSize: 24,
                whiteSpace: "nowrap",
              }}
            >
              <Orb size={28} color="#fff" speed={0} />
              Paused here
            </div>
          </div>
          <div style={cardStyle(2)}>
            <div style={{ fontSize: tall ? 26 : 24, fontWeight: 500, letterSpacing: "-0.003em", color: C.muted }}>Sent</div>
            <div style={{ fontSize: 26, lineHeight: 1.5, marginTop: 18 }}>
              Why does deploy fail with{" "}
              <span style={{ display: "inline-grid", verticalAlign: "bottom" }}>
                <span style={{ gridArea: "1/1", opacity: 1 - redact, filter: redact > 0 ? `blur(${redact * 6}px)` : undefined, whiteSpace: "nowrap" }}>sk_live_51Hq…</span>
                <span style={{ gridArea: "1/1", justifySelf: "start", alignSelf: "center", whiteSpace: "nowrap", padding: "0 12px", borderRadius: 8, background: C.fg, color: "#fff", fontSize: 21, opacity: redact, transform: `scale(${0.8 + 0.2 * redact})` }}>
                  key removed
                </span>
              </span>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** The break: everything is pulled into the orb. */
const Gather: React.FC<ShotProps> = ({ len }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = ease(f, [0, len], [0, 1], Easing.in(Easing.cubic));
  return (
    <AbsoluteFill>
      <Dark />
      {Array.from({ length: 40 }).map((_, i) => {
        const a = i * 2.39996;
        const r0 = 500 + (i % 7) * 90;
        const r = r0 * (1 - t);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: width / 2 + Math.cos(a) * r * (width > height ? 1.4 : 0.9) - 4,
              top: height / 2 + Math.sin(a) * r * (width > height ? 1 : 1.5) - 4,
              width: 8,
              height: 8,
              borderRadius: 4,
              background: "#fff",
              opacity: 0.3 + 0.6 * t,
            }}
          />
        );
      })}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ transform: `scale(${0.6 + t * 0.7})` }}>
          <Orb size={150} color="#fff" floor={0.14} speed={1 + t * 4} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const revealName = () => Math.round(vo.meet.words[1].start * 30);

const Reveal: React.FC<ShotProps> = ({ start, len }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tall = useTall();
  const name = revealName();
  const hits = [0, lb(start, 66), lb(start, 68), lb(start, 70)];
  const burst = springAt(f, fps, 0, { damping: 14, stiffness: 180 });
  const flash = ease(f, [0, 8], [0.55, 0]);
  return (
    <AbsoluteFill>
      <Dark />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        {hits.map((h) => (
          <React.Fragment key={h}>{ring(f, h, 1300, "rgba(255,255,255,0.3)")}</React.Fragment>
        ))}
        <div style={{ transform: `scale(${(0.85 + 0.15 * burst) * (1 + 0.03 * pulse(f, hits.slice(1), 6)) * (1 + ease(f, [0, len], [0, 0.05]))})` }}>
          <Lockup size={tall ? 64 : 72} at={-6} wordAt={name - 6} bloomAt={name - 14} />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
};

const Tagline: React.FC<ShotProps> = ({ start }) => {
  const f = useCurrentFrame();
  const tall = useTall();
  // v5: the opening line again, in two steps on the beats, then all of it at once
  const g = [0, lb(start, 74)];
  const ws = [
    { t: "Your", at: g[0], k: 0 },
    { t: "desktop", at: g[0] + 4, k: 0 },
    { t: "colleague.", at: g[1], k: 1 },
  ];
  const all = lb(start, 76);
  const latest = g.filter((x) => f >= x).length - 1;
  return (
    <AbsoluteFill>
      <Light />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", rowGap: 4, transform: `scale(${1 + 0.03 * pulse(f, [...g, all], 6)})` }}>
        {/* broken where the opening broke it */}
        {TAG_LINES(tall).map((ix, k) => (
          <Slam
            key={k}
            words={ix.map((i) => ws[i]).map((w) => ({ t: w.t, at: w.at, color: w.k === latest || f >= all ? C.fg : "#b5b5bb" }))}
            size={TAG_SIZE(tall)}
            style={{ justifyContent: "center" }}
          />
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const ENDCARD = (start: number) => {
  const url = Math.round(vo.free.words[2].start * 30) + lb(start, 81) - 4;
  return { url, hit: lb(start, 86) };
};

const EndCard: React.FC<ShotProps> = ({ start, len }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tall = useTall();
  const { url, hit } = ENDCARD(start);
  const s = springAt(f, fps, 0, { damping: 16, stiffness: 200 });
  const hitP = pulse(f, [hit], 8);
  const out = ease(f, [len - 14, len], [1, 0]);
  return (
    <AbsoluteFill>
      <Light />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out }}>
        {ring(f, hit, 1400, "rgba(0,0,0,0.25)")}
        <div style={{ display: "grid", justifyItems: "center", transform: `scale(${(0.94 + 0.06 * s) * (1 + 0.03 * hitP) * (1 + ease(f, [0, len], [0, 0.03]))})` }}>
          <Lockup size={tall ? 64 : 72} color={C.fg} />
          <Slam words={[{ t: "tryambient.ai", at: url }]} size={64} style={{ marginTop: tall ? 56 : 48 }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const VIEWS: Record<string, React.FC<ShotProps>> = {
  open: Open,
  talk: Talk,
  writes: Writes,
  smart: Smart,
  answers: Answers,
  acts: Acts,
  remembers: Remembers,
  nudge: Nudge,
  suggest: Suggest,
  hey: Hey,
  meeting: Meeting,
  nobot: NoBot,
  apps: Apps,
  connect: Connect,
  private: Private,
  gather: Gather,
  reveal: Reveal,
  tagline: Tagline,
  endcard: EndCard,
};

// The shots that arrive with a whip (the rest are hard cuts on the beat).
const WHIPS = new Set(["answers", "acts", "remembers", "nudge", "meeting", "connect"]);

// ---------------------------------------------------------------- sound
const shot = (id: string) => SHOTS.find((s) => s[0] === id)!;
const at = (id: string, local: number) => beat(shot(id)[1]) + local;
const v1 = (id: string) => shot(id)[2];

/** Sound effects: [file in public/sfx, global frame, volume, frames to play]. */
function sfxList(): [string, number, number, number?][] {
  // v4 levels, so they read plainly over the bed: taps and clicks ×3.2 (+10 dB)
  // over v3 (and click.mp3 regenerated ~20 dB hotter), whooshes 0.16 → 0.75 (+13 dB).
  const TAP = 3.2;
  const WHOOSH = 0.75;
  const L: [string, number, number, number?][] = [];
  // v5 opening: quiet; a swish as the orb slides in, a soft tap as it settles,
  // the chime under the line's first word, a tap as the pill appears
  const o = OPEN();
  L.push(["swish", at("open", o.slide - 2), 0.3]);
  L.push(["tap", at("open", o.land), 0.35 * TAP]);
  L.push(["chime", at("open", o.line[0] - 2), 0.2]);
  L.push(["tap", at("talk", TALK.pill - 2), 0.45 * TAP]);
  L.push(["typing", at("writes", WRITES.streamFrom), 0.32, WRITES.streamTo - WRITES.streamFrom + 6]);
  L.push(["click", at("writes", WRITES.polish), 0.35 * TAP]);
  L.push(["swish", at("writes", WRITES.land - 4), 0.22]);
  L.push(["tap", at("smart", SMART.pill), 0.4 * TAP]);
  L.push(["swish", at("smart", SMART.msg - 2), 0.2]);
  L.push(["pop", at("smart", SMART.chip), 0.22]);
  L.push(["tap", at("answers", 3), 0.4 * TAP]);
  L.push(["pop", at("answers", 12), 0.22]);
  L.push(["tap", at("acts", 3), 0.4 * TAP]);
  L.push(["pop", at("acts", lb(v1("acts"), 17)), 0.25]);
  L.push(["swish", at("acts", lb(v1("acts"), 17.5)), 0.18]);
  L.push(["tap", at("remembers", 3), 0.4 * TAP]);
  L.push(["pop", at("remembers", 14), 0.22]);
  L.push(["pop", at("nudge", NUDGE.card), 0.22]);
  L.push(["tap", at("nudge", NUDGE.yes), 0.4 * TAP]);
  L.push(["click", at("nudge", NUDGE.press), 0.55 * TAP]);
  L.push(["swish", at("nudge", NUDGE.sum), 0.2]);
  const each = Math.round(SUGGEST_EACH * FB);
  for (let k = 0; k < SUGGEST_N; k++) {
    // every quick suggestion arrives with a whip
    L.push(["whoosh", at("suggest", k * each - 4), WHOOSH]);
    L.push(["pop", at("suggest", k * each + 4), 0.2]);
    L.push(["click", at("suggest", k * each + 30), 0.55 * TAP]);
  }
  L.push(["chime", at("hey", heyAt()), 0.38]);
  const m = MEETING(v1("meeting"));
  L.push(["pop", at("meeting", m.suggest), 0.22]);
  L.push(["click", at("meeting", m.accept), 0.6 * TAP]);
  L.push(["swish", at("meeting", m.panel), 0.2]);
  const n = NOBOT(v1("nobot"));
  L.push(["pop", at("nobot", 0), 0.22]);
  L.push(["click", at("nobot", n.press), 0.55 * TAP]);
  L.push(["swish", at("nobot", n.sum), 0.18]);
  APPS.forEach((_, k) => L.push(["tap", at("apps", appAt(k)), 0.18 * TAP]));
  privateCards(v1("private")).forEach((c) => L.push(["swish", at("private", c), 0.16]));
  L.push(["pop", at("private", privateCards(v1("private"))[2] + 8), 0.2]);
  L.push(["whoosh", at("gather", 0), WHOOSH]);
  L.push(["logo", at("reveal", revealName() - 18), 0.5]);
  L.push(["chime", at("endcard", ENDCARD(v1("endcard")).hit), 0.25]);
  // a whoosh under every whip, and a softer one under each hard cut
  // (not where the open, the chime, the gather or the logo already mark it)
  SHOTS.forEach(([id, b]) => {
    if (WHIPS.has(id)) L.push(["whoosh", beat(b) - 4, WHOOSH]);
    else if (!["open", "hey", "suggest", "gather", "reveal"].includes(id)) L.push(["whoosh", beat(b) - 4, WHOOSH * 0.6]);
  });
  return L;
}
const SFX = sfxList();

const voWindows = VO.map(([id, b]) => [beat(b), beat(b) + Math.round(vo[id].duration * 30)] as const);
/** The bed a little lower than v1 (0.9 → 0.72), ducking to 0.3 under the voice. */
function musicVolume(f: number) {
  let dist = Infinity;
  for (const [a, b2] of voWindows) dist = Math.min(dist, f < a ? a - f : f > b2 ? f - b2 : 0);
  const duck = interpolate(dist, [0, 8], [1, 0], { extrapolateRight: "clamp" });
  // the bed builds about 7 dB through the cut; ease it back so the late lines stay clear
  // (v5: the same bed beats as v4's 30 and 90, now at video beats 38 and 106)
  const build = interpolate(f, [beat(38), beat(106)], [1, 0.75], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // v5: the first pass of the intro bar, under the empty desktop, sits back
  const quiet = interpolate(f, [0, beat(MUSIC_SPLICES[1][0])], [0.45, 0.8], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (0.72 - 0.42 * duck) * build * (f < beat(MUSIC_SPLICES[1][0]) ? quiet : 1);
}
/** Frame in the bed file of its beat b. */
const musicFrame = (b: number) => Math.round((FIRST_BEAT + (b * 60) / 100) * FPS);
const XF = 3; // a 3-frame crossfade at each splice
/** The bed's segments in frames: [video from, video to, bed frame at `from`]. */
const MUSIC = MUSIC_SPLICES.map(([vb, mb], i) => {
  const from = vb === 0 ? 0 : beat(vb);
  const to = i < MUSIC_SPLICES.length - 1 ? beat(MUSIC_SPLICES[i + 1][0]) : TOTAL;
  return { from, to, src: mb === 0 && vb === 0 ? 0 : musicFrame(mb) - (from - beat(vb)) };
});

export const Ad: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    {SHOTS.map(([id, b, v1Start], i) => {
      const from = beat(b);
      const to = i < SHOTS.length - 1 ? beat(SHOTS[i + 1][1]) : TOTAL;
      const View = VIEWS[id];
      const body = <View start={v1Start} len={to - from} />;
      return (
        <Sequence key={id} from={from} durationInFrames={to - from} name={id}>
          {WHIPS.has(id) ? (
            <Whip len={to - from} dir={i % 2 ? 1 : -1}>
              {body}
            </Whip>
          ) : (
            body
          )}
        </Sequence>
      );
    })}
    {VO.map(([id, b]) => (
      <Sequence key={`vo-${id}`} from={beat(b)} name={`vo ${id}`}>
        <Audio src={staticFile(`vo/${id}.mp3`)} volume={1} />
      </Sequence>
    ))}
    {SFX.map(([id, f, v, dur], i) => (
      <Sequence key={`sfx-${i}`} from={Math.max(0, f)} durationInFrames={dur ?? 90} name={`sfx ${id}`}>
        <Audio src={staticFile(`sfx/${id}.mp3`)} volume={dur ? (x) => v * interpolate(x, [dur - 8, dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : v} />
      </Sequence>
    ))}
    {/* the bed, re-cut on beats (MUSIC_SPLICES in beats.ts), a short crossfade at each joint */}
    {MUSIC.map(({ from, to, src }, i) => {
      const first = i === 0;
      const last = i === MUSIC.length - 1;
      const lead = first ? 0 : Math.min(XF, src); // a segment from the bed's very start can't lead in
      const start = from - lead;
      const end = last ? TOTAL : to + XF;
      return (
        <Sequence key={`music-${i}`} from={start} durationInFrames={end - start} name={`music ${i}`}>
          <Audio
            src={staticFile("music/bed.mp3")}
            trimBefore={src - lead}
            volume={(x) => {
              const g = x + start;
              const fadeIn = first ? 1 : interpolate(g, [start, from + XF], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              const fadeOut = last ? 1 : interpolate(g, [to - XF, to + XF], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              return musicVolume(g) * fadeIn * fadeOut;
            }}
          />
        </Sequence>
      );
    })}
  </AbsoluteFill>
);

// ---------------------------------------------------------------- posters
export type PosterProps = { theme: "light" | "dark" };
/**
 * The embed's poster: the end-card lockup on the app's backdrop in the page's
 * theme. The lockup sits in the upper third and the URL in the lower, so the
 * centre stays clear for the player's play button.
 */
export const Poster: React.FC<PosterProps> = ({ theme }) => {
  const tall = useTall();
  const { height } = useVideoConfig();
  const dark = theme === "dark";
  const ink = dark ? "#fafafa" : C.fg;
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Backdrop dark={dark} />
      <div style={{ position: "absolute", left: 0, right: 0, top: height * (tall ? 0.3 : 0.27), display: "flex", justifyContent: "center", transform: "translateY(-50%)" }}>
        <Lockup size={tall ? 64 : 72} color={ink} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: height * (tall ? 0.66 : 0.7), display: "grid", justifyItems: "center", gap: tall ? 20 : 16, textAlign: "center" }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 64, fontWeight: 300, letterSpacing: "-0.035em", lineHeight: 1.08, color: ink }}>tryambient.ai</div>
      </div>
    </AbsoluteFill>
  );
};
