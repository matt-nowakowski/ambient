// Ambient launch spot, v2: a calm, music-led cut (see src/beats.ts and script.md).
// One component renders both the 16:9 master and the 9:16 social cut; each shot
// lays itself out for the frame it is given (useTall).
import React, { type CSSProperties, type ReactNode } from "react";
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import {
  Backdrop,
  Bar,
  C,
  Caret,
  Check,
  FONT,
  HudButton,
  LensOrb,
  Lockup,
  MacWindow,
  Orb,
  RingOrb,
  Shift,
  Soft,
  Stream,
  Suggestion,
  appear,
  ease,
  hudCard,
  springAt,
  typed,
  useF,
  useTall,
} from "./kit";
import { END_BEAT, MUSIC_TRIM, SHOTS, TOTAL, VO, beat } from "./beats";
import vo from "./vo";

/** Local frame of a global beat, inside a shot that starts on beat `start`. */
const lb = (start: number, b: number) => beat(b) - beat(start);

type ShotProps = { start: number; len: number };

// ---------------------------------------------------------------- layout
/**
 * Caption + product UI, never overlapping. Landscape: caption in a left column,
 * the UI centred in the right-hand region. Portrait: caption on top, UI below.
 * The UI is built at real app sizes in a w×h box and scaled to fit its region.
 */
const Split: React.FC<{ caption: ReactNode; ui: ReactNode; w: number; h: number; len: number }> = ({ caption, ui, w, h, len }) => {
  const f = useF();
  const tall = useTall();
  const region = tall ? { x: 40, y: 930, w: 1000, h: 880 } : { x: 800, y: 110, w: 1000, h: 860 };
  const s0 = Math.min(tall ? 2.6 : 2.15, region.w / w, region.h / h);
  const s = s0 * (1 + ease(f, [0, len], [0, 0.025], Easing.linear));
  // portrait: the UI hangs just under the caption instead of floating mid-frame
  const top = tall ? region.y + (h * s0 - h) / 2 : region.y + (region.h - h) / 2;
  return (
    <AbsoluteFill>
      <div
        style={
          tall
            ? { position: "absolute", left: 70, right: 70, top: 460, height: 400, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", textAlign: "center" }
            : { position: "absolute", left: 150, width: 600, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center" }
        }
      >
        {caption}
      </div>
      <div
        style={{
          position: "absolute",
          left: region.x + (region.w - w) / 2,
          top,
          width: w,
          height: h,
          transform: `scale(${s})`,
          transformOrigin: "50% 50%",
          fontFamily: FONT,
        }}
      >
        {ui}
      </div>
    </AbsoluteFill>
  );
};

const Caption: React.FC<{ text: string; at: number; sub?: string; subAt?: number }> = ({ text, at, sub, subAt }) => {
  const f = useF();
  const tall = useTall();
  return (
    <>
      <Soft text={text} at={at} size={tall ? 104 : 92} color={C.fg} align={tall ? "center" : "left"} />
      {sub && (
        <div style={{ marginTop: tall ? 28 : 30, fontFamily: FONT, fontSize: tall ? 34 : 30, fontWeight: 400, lineHeight: 1.35, color: C.muted, letterSpacing: "-0.01em", textWrap: "balance", maxWidth: tall ? 900 : 540, ...appear(f, subAt ?? at + 20) }}>
          {sub}
        </div>
      )}
    </>
  );
};

/** A centred column for the full-frame moments. */
const Center: React.FC<{ children: ReactNode; gap?: number; style?: CSSProperties }> = ({ children, gap = 0, style }) => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap, fontFamily: FONT, ...style }}>{children}</AbsoluteFill>
);

// ---------------------------------------------------------------- HUD bits
/** The dark request pill: what you said, with the listening ring. */
const Request: React.FC<{ text: string; at: number; style?: CSSProperties }> = ({ text, at, style }) => {
  const f = useF();
  const { fps } = useVideoConfig();
  const s = springAt(f, fps, at);
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
        fontSize: 14,
        fontWeight: 400,
        whiteSpace: "nowrap",
        opacity: Math.min(1, s * 1.3),
        transform: `translateY(${(1 - s) * 10}px)`,
        filter: s < 0.98 ? `blur(${(1 - s) * 5}px)` : undefined,
        ...style,
      }}
    >
      {f < at + 24 ? <RingOrb size={18} color="#fff" period={1.4} /> : <Orb size={18} color="#fff" speed={1.2} />}
      <Stream text={text} from={at + 2} to={at + 22} />
    </div>
  );
};

/** The glass answer card (src/hud): question, streamed answer, numbered sources. */
const AnswerCard: React.FC<{ q: string; a: string; sources: string[]; at: number; srcAt: number[]; w: number; actionsAt?: number; style?: CSSProperties }> = ({
  q,
  a,
  sources,
  at,
  srcAt,
  w,
  actionsAt,
  style,
}) => {
  const f = useF();
  const { fps } = useVideoConfig();
  const s = springAt(f, fps, at);
  return (
    <div style={{ ...hudCard, width: w, opacity: Math.min(1, s * 1.3), transform: `translateY(${(1 - s) * 12}px)`, filter: s < 0.98 ? `blur(${(1 - s) * 5}px)` : undefined, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Orb size={18} color="#fff" speed={1} />
        <span style={{ fontSize: 12, color: C.hMuted, whiteSpace: "nowrap" }}>{q}</span>
      </div>
      <div style={{ marginTop: 9, fontSize: 13.5, lineHeight: 1.55, fontWeight: 400 }}>
        <Stream text={a} from={at + 6} to={at + 44} />
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        {sources.map((src, i) => (
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
              ...appear(f, srcAt[i], undefined, 6, 14),
            }}
          >
            <span style={{ display: "inline-grid", placeItems: "center", width: 15, height: 15, borderRadius: 4, background: C.hHair, fontSize: 10 }}>{i + 1}</span>
            {src}
          </div>
        ))}
      </div>
      {actionsAt !== undefined && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, paddingTop: 10, borderTop: `0.5px solid ${C.hHair}`, ...appear(f, actionsAt, undefined, 4, 14) }}>
          <HudButton label="Insert" kbd="⏎" primary />
          <HudButton label="Copy" />
        </div>
      )}
    </div>
  );
};

const Levels: React.FC<{ live?: number }> = ({ live = 1 }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, height: 18 }}>
      {Array.from({ length: 9 }).map((_, i) => {
        const env = 1 - Math.abs(i - 4) / 6;
        const v = 0.5 + 0.5 * Math.sin(f * 0.45 + i * 1.7) * Math.sin(f * 0.15 + i * 0.9);
        return <i key={i} style={{ width: 4, height: 3 + live * env * v * 15, borderRadius: 2, background: C.hInk, display: "block" }} />;
      })}
    </div>
  );
};

/** The recording pill (src/overlay): red dot, nine live levels, timer. */
const LivePill: React.FC<{ at: number }> = ({ at }) => {
  const f = useF();
  const { fps } = useVideoConfig();
  const s = springAt(f, fps, at);
  return (
    <div
      style={{
        width: 184,
        height: 40,
        boxSizing: "border-box",
        borderRadius: 24,
        background: "rgba(18,18,22,0.85)",
        boxShadow: "inset 0 0.5px 0 rgba(255,255,255,0.14), 0 12px 30px -10px rgba(0,0,0,0.35)",
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        padding: "0 14px",
        opacity: Math.min(1, s * 1.3),
        transform: `scale(${0.9 + 0.1 * s})`,
        filter: s < 0.98 ? `blur(${(1 - s) * 5}px)` : undefined,
        fontFamily: FONT,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 4, background: C.rec }} />
      <Levels />
      <span style={{ justifySelf: "end", fontSize: 12, color: C.hFaint, fontVariantNumeric: "tabular-nums" }}>0:0{Math.max(0, Math.floor((f - at) / 30))}</span>
    </div>
  );
};

// ---------------------------------------------------------------- shots
const Open: React.FC<ShotProps> = () => {
  const tall = useTall();
  return (
    <Center>
      <LensOrb k={tall ? 1.1 : 1.2} at={0} bloomAt={30} />
    </Center>
  );
};

const Speak: React.FC<ShotProps> = ({ start }) => {
  const f = useF();
  const tall = useTall();
  const word = lb(start, 5) - 4;
  return (
    <Center gap={tall ? 90 : 70}>
      <Soft text="Speak." at={word} size={tall ? 150 : 140} color={C.fg} />
      <div style={{ transform: `scale(${tall ? 1.9 : 1.7})`, height: 40 }}>
        <LivePill at={word + 10} />
      </div>
    </Center>
  );
};

type Tok = { raw: string; drop?: boolean };
const RAW: Tok[] = [
  { raw: "um", drop: true },
  { raw: "so", drop: true },
  { raw: "can" },
  { raw: "we" },
  { raw: "uh", drop: true },
  { raw: "move" },
  { raw: "the" },
  { raw: "sync" },
  { raw: "to" },
  { raw: "like", drop: true },
  { raw: "three thirty" },
  { raw: "on" },
  { raw: "thursday" },
];
const POLISHED = "Can we move the sync to 3:30 on Thursday?";

const Writes: React.FC<ShotProps> = ({ start, len }) => {
  const f = useF();
  const tall = useTall(); // portrait: a narrower window, the raw line may wrap
  const WW = tall ? 440 : 560;
  const say = lb(start, 10);
  const streamFrom = 12;
  const streamTo = 62;
  const strike = 74;
  const swap = 94;
  const pillOut = 114;
  const typeAt = 122;
  const swapP = ease(f, [swap, swap + 14], [0, 1]);
  const n = Math.round(interpolate(f, [streamFrom, streamTo], [0, RAW.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const body = typed(f, POLISHED, typeAt, 38);
  return (
    <Split
      len={len}
      w={WW}
      h={340}
      caption={<Caption text="It writes." at={say - 4} sub="Talk naturally. Ambient cleans it up as you go." subAt={say + 26} />}
      ui={
        <>
          <MacWindow w={WW} h={340} title="New Message" style={{ left: 0, top: 0, ...appear(f, 0, undefined, 10) }}>
            <div style={{ padding: "0 18px", fontSize: 13, color: C.fg }}>
              {[
                ["To:", "Sam Rivera"],
                ["Subject:", "Thursday sync"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: 8, height: 34, alignItems: "center", borderBottom: "0.5px solid rgba(0,0,0,0.07)" }}>
                  <span style={{ color: C.subtle, width: 60 }}>{k}</span>
                  <span>{v}</span>
                </div>
              ))}
              <div style={{ paddingTop: 18, fontSize: 14, lineHeight: 1.6 }}>
                <div style={{ color: C.muted, marginBottom: 6 }}>Hi Sam,</div>
                <div style={{ height: 24, whiteSpace: "nowrap" }}>
                  {body}
                  {f >= typeAt - 6 && <Caret h={16} />}
                </div>
                <div style={{ marginTop: 20, display: "grid", gap: 10 }}>
                  <Bar w={340} />
                  <Bar w={270} />
                </div>
              </div>
            </div>
          </MacWindow>
          {/* the Live pill: raw words stream in, fillers are struck, then the polished line */}
          <div
            style={{
              position: "absolute",
              left: tall ? 16 : 30,
              top: tall ? 176 : 196,
              width: WW - (tall ? 32 : 60),
              boxSizing: "border-box",
              borderRadius: 20,
              background: "rgba(18,18,22,0.86)",
              boxShadow: "inset 0 0.5px 0 rgba(255,255,255,0.14), 0 14px 34px -10px rgba(0,0,0,0.35)",
              color: C.hInk,
              ...appear(f, 6, pillOut, 10),
            }}
          >
            <div style={{ display: "grid", padding: "13px 18px 4px", fontSize: 14, lineHeight: 1.5, whiteSpace: tall ? "normal" : "nowrap" }}>
              <div style={{ gridArea: "1/1", opacity: 1 - swapP, filter: swapP > 0 ? `blur(${swapP * 6}px)` : undefined }}>
                {RAW.map((t, i) => {
                  if (i >= n) return null;
                  const p = ease(f, [strike + i * 0.8, strike + 10 + i * 0.8], [0, 1]);
                  return (
                    <React.Fragment key={i}>
                      <span style={{ position: "relative", display: "inline-block", color: t.drop ? `rgba(255,255,255,${1 - 0.5 * p})` : C.hInk, ...appear(f, streamFrom + (i * (streamTo - streamFrom)) / RAW.length, undefined, 3, 8) }}>
                        {t.raw}
                        {t.drop && <span style={{ position: "absolute", left: -1, top: "54%", height: 1.5, width: `calc(${p * 100}% + 2px)`, background: C.rec, borderRadius: 1 }} />}
                      </span>{" "}
                    </React.Fragment>
                  );
                })}
              </div>
              <div style={{ gridArea: "1/1", opacity: swapP, filter: swapP < 1 ? `blur(${(1 - swapP) * 6}px)` : undefined }}>{POLISHED}</div>
            </div>
            <div style={{ height: 40, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "0 16px" }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: f > strike ? "rgba(255,255,255,0.4)" : C.rec }} />
              {f > strike ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap" }}>
                  {f > swap + 8 ? <Check size={13} /> : <Orb size={14} color="#fff" speed={2} />}
                  {f > swap + 8 ? "Ready" : "Polishing"}
                </div>
              ) : (
                <Levels />
              )}
              <span />
            </div>
          </div>
        </>
      }
    />
  );
};

const Answers: React.FC<ShotProps> = ({ start, len }) => {
  const at = lb(start, 17.5);
  return (
    <Split
      len={len}
      w={390}
      h={290}
      caption={<Caption text="It answers." at={at - 4} sub="Ask anything, wherever you are." subAt={at + 24} />}
      ui={
        <>
          <Request text="What's the UK capital gains rate?" at={6} style={{ left: 0, top: 0 }} />
          <AnswerCard
            at={at}
            w={390}
            style={{ left: 0, top: 54 }}
            q="What's the UK capital gains rate?"
            a="18% if you're a basic-rate taxpayer, 24% above that. The first £3,000 of gains each year is tax-free."
            sources={["gov.uk", "Capital Gains Tax rates", "which.co.uk"]}
            srcAt={[at + 50, at + 58, at + 66]}
            actionsAt={at + 76}
          />
        </>
      }
    />
  );
};

const Acts: React.FC<ShotProps> = ({ start, len }) => {
  const f = useF();
  const at = lb(start, 24.5);
  return (
    <Split
      len={len}
      w={360}
      h={200}
      caption={<Caption text="It acts." at={at - 4} sub="Say it once. It’s done." subAt={at + 22} />}
      ui={
        <>
          <Request text="Remind me at 5 to call Sam" at={4} style={{ left: 0, top: 0 }} />
          <div style={{ ...hudCard, left: 0, top: 56, width: 360, display: "flex", alignItems: "center", gap: 8, fontSize: 13, whiteSpace: "nowrap", ...appear(f, at + 2, undefined, 8, 16) }}>
            <Check />
            <span style={{ color: C.success }}>Reminder added</span>
            <span style={{ color: C.hMuted }}>· Today, 5:00 PM</span>
            <div style={{ marginLeft: "auto", height: 24, padding: "0 10px", borderRadius: 7, background: C.hRaise, fontSize: 12, display: "grid", placeItems: "center" }}>Undo</div>
          </div>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 116,
              width: 300,
              boxSizing: "border-box",
              borderRadius: 12,
              background: "rgba(255,255,255,0.86)",
              boxShadow: "0 0 0 0.5px rgba(0,0,0,0.08), inset 0 0.5px 0 #fff, 0 16px 40px -16px rgba(20,24,40,0.3)",
              padding: "12px 14px",
              fontFamily: FONT,
              ...appear(f, at + 20, undefined, 14, 22),
            }}
          >
            <div style={{ fontSize: 11, color: C.subtle, marginBottom: 8, fontWeight: 500 }}>Reminders · Today</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 16, height: 16, borderRadius: 8, border: "1.5px solid #c7c7cc", flex: "none" }} />
              <div style={{ fontSize: 13, color: C.fg, flex: 1, whiteSpace: "nowrap" }}>Call Sam</div>
              <div style={{ fontSize: 12, color: C.rec, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>5:00 PM</div>
            </div>
          </div>
        </>
      }
    />
  );
};

const Remembers: React.FC<ShotProps> = ({ start, len }) => {
  const at = lb(start, 29.5);
  return (
    <Split
      len={len}
      w={390}
      h={230}
      caption={<Caption text="It remembers." at={at - 4} sub="Your dictations and meetings, searchable by asking." subAt={at + 24} />}
      ui={
        <>
          <Request text="What did I say about pricing yesterday?" at={4} style={{ left: 0, top: 0 }} />
          <AnswerCard
            at={at}
            w={390}
            style={{ left: 0, top: 54 }}
            q="What did I say about pricing yesterday?"
            a="That Pro stays at $12 a month, $9 billed yearly, and free dictation stays unlimited."
            sources={["Dictation · Yesterday 4:12 PM", "Pricing review · Meeting"]}
            srcAt={[at + 46, at + 54]}
          />
        </>
      }
    />
  );
};

const Hey: React.FC<ShotProps> = ({ start }) => {
  const f = useF();
  const tall = useTall();
  const { fps } = useVideoConfig();
  const wake = lb(start, 35) + Math.round(vo.hey.words[3].start * 30) - 2;
  const w = springAt(f, fps, wake, { damping: 26, stiffness: 60 });
  return (
    <Center gap={0}>
      <div style={{ opacity: 0.32 + 0.68 * w, transform: `scale(${0.94 + 0.06 * w})` }}>
        <LensOrb k={tall ? 1.4 : 1.5} spin={w > 0.5 ? 0.12 : 0} bloomAt={wake} />
      </div>
      <div style={{ height: tall ? 110 : 90 }} />
      <div style={{ display: "grid", justifyItems: "center", alignItems: "center" }}>
        <Soft text="Or just say" at={lb(start, 35) - 2} out={wake - 14} size={tall ? 92 : 84} color={C.mutedDark} style={{ gridArea: "1/1", whiteSpace: "nowrap" }} />
        <Soft text="“Hey Ambient”" at={wake} size={tall ? 92 : 84} color="#fafafa" stagger={6} style={{ gridArea: "1/1", whiteSpace: "nowrap" }} />
      </div>
      <div style={{ marginTop: 26, fontSize: tall ? 34 : 30, fontWeight: 400, color: C.mutedDark, letterSpacing: "-0.01em", ...appear(f, wake + 24) }}>
        Optional. No key at all.
      </div>
    </Center>
  );
};

const PEOPLE = [
  { n: "Priya", i: "P", g: ["#7d93c9", "#b9c8e6"] },
  { n: "Tom", i: "T", g: ["#c99a8a", "#e8d2c8"] },
  { n: "Ana", i: "A", g: ["#8fa9b8", "#c6d4de"] },
  { n: "You", i: "M", g: ["#9aa3b5", "#d9d4cf"] },
];

const Meeting: React.FC<ShotProps> = ({ start, len }) => {
  const f = useF();
  const tall = useTall(); // portrait: a smaller call window, the notes below it
  const tw = tall ? 172 : 210;
  const th = tall ? 96 : 114;
  const say = lb(start, 41);
  const accept = 44;
  const panel = 56;
  const rows = [70, 88, 106];
  const speaker = f < rows[0] ? 0 : f < rows[1] ? 3 : f < rows[2] ? 1 : 2;
  const transcript = [
    { who: "Them", t: "Can you send the Q3 numbers by Friday?" },
    { who: "You", t: "Sure, I'll pull them today." },
    { who: "Them", t: "And let's move the launch to the 14th." },
  ];
  return (
    <Split
      len={len}
      w={tall ? 420 : 540}
      h={tall ? 400 : 350}
      caption={<Caption text="Notes for every call." at={say - 4} sub="Your mic and the call's audio. You and Them." subAt={say + 30} />}
      ui={
        <>
          <MacWindow dark w={tw * 2 + 20} h={th * 2 + 52} title="Weekly sync" style={{ left: 0, top: tall ? 40 : 0, ...appear(f, -6, undefined, 8) }}>
            {PEOPLE.map((p, i) => (
              <div
                key={p.n}
                style={{
                  position: "absolute",
                  left: 8 + (i % 2) * (tw + 4),
                  top: 8 + Math.floor(i / 2) * (th + 4),
                  width: tw,
                  height: th,
                  borderRadius: 9,
                  background: `linear-gradient(135deg, ${p.g[0]}, ${p.g[1]})`,
                  boxShadow: i === speaker ? "inset 0 0 0 2px rgba(255,255,255,0.9)" : "none",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 22, background: "rgba(255,255,255,0.3)", display: "grid", placeItems: "center", fontSize: 18, fontWeight: 400, color: "#fff" }}>{p.i}</div>
                <div style={{ position: "absolute", left: 7, bottom: 6, fontSize: 10.5, color: "#fff", padding: "2px 7px", borderRadius: 6, background: "rgba(0,0,0,0.28)", whiteSpace: "nowrap" }}>{p.n}</div>
              </div>
            ))}
          </MacWindow>
          <Suggestion title="Take notes for this call?" accept="Take notes" at={12} out={accept + 8} pressAccept={accept} style={tall ? { left: 0, top: 0 } : { left: 24, top: 46 }} />
          <div
            style={{
              position: "absolute",
              left: tall ? 70 : 190,
              top: tall ? 190 : 150,
              width: 350,
              minHeight: 200,
              boxSizing: "border-box",
              borderRadius: 14,
              background: "rgba(255,255,255,0.9)",
              backdropFilter: "blur(28px) saturate(180%)",
              boxShadow: "0 0 0 0.5px rgba(0,0,0,0.08), inset 0 0.5px 0 #fff, 0 24px 60px -18px rgba(20,24,40,0.4)",
              ...appear(f, panel, undefined, 16, 22),
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderBottom: "0.5px solid rgba(0,0,0,0.07)", whiteSpace: "nowrap" }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: C.rec }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: C.fg }}>Weekly sync</span>
              <span style={{ fontSize: 12, color: C.subtle }}>· Live notes</span>
            </div>
            <div style={{ padding: "6px 14px" }}>
              {transcript.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "6px 0", fontSize: 12.5, lineHeight: 1.45, color: C.fg, ...appear(f, rows[i], undefined, 8, 16) }}>
                  <span style={{ width: 38, flex: "none", color: r.who === "You" ? C.fg : C.subtle, fontWeight: 500 }}>{r.who}</span>
                  <span>{r.t}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      }
    />
  );
};

const NoBot: React.FC<ShotProps> = ({ start }) => {
  const f = useF();
  const tall = useTall();
  const at = lb(start, 46.5) - 2;
  return (
    <Center>
      <Soft text="No bot." at={at} size={tall ? 150 : 140} color="#fafafa" />
      <div style={{ marginTop: 34, fontSize: tall ? 36 : 32, fontWeight: 400, color: C.mutedDark, letterSpacing: "-0.01em", ...appear(f, at + 22) }}>Nothing joins your call.</div>
    </Center>
  );
};

const Suggest: React.FC<ShotProps> = ({ len }) => {
  const f = useF();
  const tall = useTall(); // portrait: a narrower chat and a shorter prompt
  const pill = 26;
  const accept = 84;
  const done = accept + 12;
  return (
    <Split
      len={len}
      w={tall ? 470 : 580}
      h={350}
      caption={<Caption text="It notices." at={4} sub="Suggestions are decided on your Mac. Nothing is sent unless you accept." subAt={26} />}
      ui={
        <>
          <MacWindow w={tall ? 450 : 560} h={300} title="#launch" style={{ left: 10, top: 50, ...appear(f, -6, undefined, 8) }}>
            <div style={{ padding: "26px 22px 0", display: "grid", gap: 20, fontSize: 14, color: C.fg }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ display: "flex", gap: 12 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 7, background: ["#8fa9b8", "#c99a8a", "#7d93c9"][i], flex: "none" }} />
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{["Ana", "Tom", "Priya"][i]}</div>
                    {i === 1 ? (
                      <div style={{ whiteSpace: "nowrap" }}>
                        Dry run on{" "}
                        <span style={{ background: "rgba(64,84,140,0.12)", borderBottom: "1.5px solid rgba(64,84,140,0.55)", borderRadius: 3, padding: "0 2px" }}>Thursday at 3pm</span>?
                      </div>
                    ) : (
                      <Bar w={[320, 0, 250][i]} style={{ marginTop: 6 }} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </MacWindow>
          <Suggestion title={tall ? "Add Thursday 3pm to your calendar?" : "There's a date in this. Add it to your calendar?"} accept="Add" at={pill} out={accept + 8} pressAccept={accept} style={{ left: 0, top: 0 }} />
          <div style={{ ...hudCard, left: 0, top: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 13, whiteSpace: "nowrap", ...appear(f, done, undefined, -8, 16) }}>
            <Check />
            <span>Added to Calendar</span>
            <span style={{ color: C.hMuted }}>· Thu, 3:00 PM</span>
          </div>
        </>
      }
    />
  );
};

export const APPS = ["Slack", "Gmail", "Notion", "Linear", "Cursor", "VS Code", "Google Docs", "Messages", "ChatGPT", "Figma"];
const APP_TINT = ["#7d93c9", "#c99a8a", "#8f8f8f", "#8fa9b8", "#6f6f74", "#7d93c9", "#c99a8a", "#8fa9b8", "#6f6f74", "#9aa3b5"];
export const appChipAt = (i: number) => 24 + i * 6;

const Apps: React.FC<ShotProps> = ({ start }) => {
  const f = useF();
  const tall = useTall();
  const swap = lb(start, 61.5) - 4;
  const head = tall ? 96 : 92;
  return (
    <Center>
      <div style={{ display: "grid", justifyItems: "center", alignItems: "center", height: head * 1.2 }}>
        <Soft text="In any app." at={lb(start, 57.5) - 4} out={swap - 6} size={head} color={C.fg} style={{ gridArea: "1/1" }} />
        <Soft text="Nothing to connect." at={swap} size={head} color={C.fg} style={{ gridArea: "1/1", whiteSpace: "nowrap" }} />
      </div>
      <div style={{ marginTop: tall ? 90 : 76, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: tall ? 20 : 18, maxWidth: tall ? 940 : 1360 }}>
        {APPS.map((a, i) => (
          <div
            key={a}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 14,
              height: tall ? 76 : 68,
              padding: tall ? "0 30px 0 18px" : "0 28px 0 16px",
              boxSizing: "border-box",
              borderRadius: 999,
              whiteSpace: "nowrap",
              flex: "none",
              fontSize: tall ? 32 : 29,
              fontWeight: 400,
              letterSpacing: "-0.01em",
              color: C.fg,
              background: "rgba(255,255,255,0.66)",
              backdropFilter: "blur(28px) saturate(180%)",
              boxShadow: "0 0 0 1px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9), 0 16px 40px -20px rgba(20,24,40,0.25)",
              ...appear(f, appChipAt(i), undefined, 16, 22),
            }}
          >
            <span style={{ width: tall ? 34 : 30, height: tall ? 34 : 30, borderRadius: 9, background: APP_TINT[i], color: "#fff", display: "grid", placeItems: "center", fontSize: tall ? 17 : 15, fontWeight: 500, flex: "none" }}>
              {a[0]}
            </span>
            {a}
          </div>
        ))}
      </div>
    </Center>
  );
};

const PHRASE = ["harbor", "violet", "candle", "mosaic", "ripple", "summit", "lantern", "orbit"];
export const privateCards = (at: number) => [at + 14, at + 50, at + 86];

const Private: React.FC<ShotProps> = ({ start, len }) => {
  const f = useF();
  const at = lb(start, 64.5);
  const cards = privateCards(at);
  const blur = ease(f, [cards[1] + 20, cards[1] + 36], [0, 1]);
  const redact = ease(f, [cards[2] + 22, cards[2] + 34], [0, 1]);
  const card: CSSProperties = {
    position: "absolute",
    left: 0,
    width: 400,
    boxSizing: "border-box",
    borderRadius: 16,
    padding: "14px 16px",
    background: "rgba(255,255,255,0.8)",
    backdropFilter: "blur(28px) saturate(180%)",
    boxShadow: "0 0 0 0.5px rgba(0,0,0,0.08), inset 0 0.5px 0 #fff, 0 20px 50px -24px rgba(20,24,40,0.3)",
    color: C.fg,
    overflow: "hidden",
  };
  const label: CSSProperties = { fontSize: 11.5, color: C.subtle, fontWeight: 500, marginBottom: 10 };
  return (
    <Split
      len={len}
      w={400}
      h={350}
      caption={<Caption text="Private by design." at={at - 4} sub="Off until you turn it on." subAt={at + 26} />}
      ui={
        <>
          <div style={{ ...card, top: 0, ...appear(f, cards[0], undefined, 14, 22) }}>
            <div style={label}>Never watched</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["Passwords", "Keychain", "Private windows", "Messages", "Wallets"].map((c, i) => (
                <div key={c} style={{ height: 26, padding: "0 11px", borderRadius: 13, background: "rgba(0,0,0,0.05)", display: "inline-flex", alignItems: "center", fontSize: 12.5, whiteSpace: "nowrap", ...appear(f, cards[0] + 6 + i * 3, undefined, 4, 12) }}>
                  {c}
                </div>
              ))}
            </div>
          </div>
          <div style={{ ...card, top: 128, height: 112, ...appear(f, cards[1], undefined, 14, 22) }}>
            <div style={label}>Recovery phrase window</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, filter: blur > 0 ? `blur(${blur * 5}px)` : undefined }}>
              {PHRASE.map((w, i) => (
                <div key={w} style={{ height: 24, borderRadius: 6, background: "rgba(0,0,0,0.045)", display: "flex", alignItems: "center", gap: 5, padding: "0 8px", fontSize: 12, whiteSpace: "nowrap" }}>
                  <span style={{ color: C.subtle, fontSize: 10 }}>{i + 1}</span>
                  {w}
                </div>
              ))}
            </div>
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: 62,
                transform: `translate(-50%,-50%) scale(${0.92 + 0.08 * blur})`,
                opacity: blur,
                display: "flex",
                alignItems: "center",
                gap: 8,
                height: 32,
                padding: "0 16px 0 12px",
                borderRadius: 16,
                background: "rgba(18,18,22,0.88)",
                color: "#fff",
                fontSize: 13,
                whiteSpace: "nowrap",
              }}
            >
              <Orb size={16} color="#fff" speed={0} />
              Paused here
            </div>
          </div>
          <div style={{ ...card, top: 254, ...appear(f, cards[2], undefined, 14, 22) }}>
            <div style={label}>Sent</div>
            <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "nowrap" }}>
              Why does deploy fail with{" "}
              <span style={{ display: "inline-grid", verticalAlign: "bottom" }}>
                <span style={{ gridArea: "1/1", opacity: 1 - redact, filter: redact > 0 ? `blur(${redact * 4}px)` : undefined }}>sk_live_51Hq…</span>
                <span style={{ gridArea: "1/1", justifySelf: "start", alignSelf: "center", padding: "1px 8px", borderRadius: 6, background: C.fg, color: "#fff", fontSize: 12, opacity: redact, whiteSpace: "nowrap" }}>key removed</span>
              </span>
            </div>
          </div>
        </>
      }
    />
  );
};

const Logo: React.FC<ShotProps> = ({ start, len }) => {
  const f = useF();
  const tall = useTall();
  const name = Math.round(vo.meet.words[1].start * 30) + lb(start, 73);
  const rise = lb(start, 77) - 6;
  const url = lb(start, 77.5) + Math.round(vo.free.words[2].start * 30) - 6;
  const sub = url + 26;
  const up = ease(f, [rise, rise + 40], [0, 1]);
  const size = tall ? 64 : 72;
  return (
    <Center>
      <div style={{ transform: `translateY(${-up * (tall ? 70 : 60)}px) scale(${1 + ease(f, [0, len], [0, 0.02], Easing.linear)})` }}>
        <Lockup size={size} at={name - 34} wordAt={name - 4} bloomAt={name - 12} />
      </div>
      <div style={{ position: "absolute", top: "50%", marginTop: tall ? 40 : 34, display: "grid", justifyItems: "center", gap: tall ? 22 : 18, textAlign: "center" }}>
        <Soft text="tryambient.ai" at={url} size={tall ? 46 : 40} weight={300} color="#fafafa" style={{ letterSpacing: "-0.02em" }} />
        <div style={{ fontSize: tall ? 27 : 23, fontWeight: 400, color: C.mutedDark, maxWidth: tall ? 760 : undefined, lineHeight: 1.4, ...appear(f, sub) }}>
          Free for Mac, Windows and Linux. Agent on Mac.
        </div>
      </div>
    </Center>
  );
};

const VIEWS: Record<string, React.FC<ShotProps>> = {
  open: Open,
  speak: Speak,
  writes: Writes,
  answers: Answers,
  acts: Acts,
  remembers: Remembers,
  hey: Hey,
  meeting: Meeting,
  nobot: NoBot,
  suggest: Suggest,
  apps: Apps,
  private: Private,
  logo: Logo,
};

// ---------------------------------------------------------------- transitions
/** Half the crossfade: shots overlap by 2·HALF frames. */
const HALF = 10;
const span = (i: number) => {
  const s = beat(SHOTS[i][1]);
  const e = i < SHOTS.length - 1 ? beat(SHOTS[i + 1][1]) : TOTAL;
  const from = Math.max(0, s - HALF);
  const to = i < SHOTS.length - 1 ? e + HALF : TOTAL;
  return { s, e, from, to };
};

/** Soft crossfade: in from a light blur and 1.5% larger, out into a blur and 1% smaller. */
const Fade: React.FC<{ dur: number; first: boolean; last: boolean; children: ReactNode }> = ({ dur, first, last, children }) => {
  const f = useCurrentFrame();
  const inP = first ? 1 : ease(f, [0, 2 * HALF], [0, 1]);
  const outP = last ? ease(f, [dur - 24, dur], [1, 0]) : ease(f, [dur - 2 * HALF, dur], [1, 0]);
  const o = Math.min(inP, outP);
  const blur = (1 - inP) * 10 + (1 - outP) * 10;
  const scale = 1 + (1 - inP) * 0.015 - (1 - outP) * 0.01;
  return <AbsoluteFill style={{ opacity: o, filter: blur > 0.2 ? `blur(${blur}px)` : undefined, transform: `scale(${scale})` }}>{children}</AbsoluteFill>;
};

/** 0 = light backdrop, 1 = dark, eased across each crossfade. */
function darkness(f: number) {
  let d = SHOTS[0][2] ? 1 : 0;
  for (let i = 1; i < SHOTS.length; i++) {
    const s = beat(SHOTS[i][1]);
    const to = SHOTS[i][2] ? 1 : 0;
    if (f >= s - HALF) d = d + (to - d) * ease(f, [s - HALF, s + HALF], [0, 1]);
  }
  return d;
}

const Backdrops: React.FC = () => {
  const f = useCurrentFrame();
  const d = darkness(f);
  return (
    <AbsoluteFill>
      <Backdrop />
      <Backdrop dark style={{ opacity: d }} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- sound
const shotStart = (id: string) => beat(SHOTS.find((s) => s[0] === id)![1]);
/** Sound effects: [file in public/sfx, global frame, volume, frames to play]. */
function sfxList(): [string, number, number, number?][] {
  const at = (id: string, local: number) => shotStart(id) + local;
  const L: [string, number, number, number?][] = [];
  L.push(["chime", at("open", 12), 0.32]);
  const sp = lb(4, 5) - 4 + 10;
  L.push(["tap", at("speak", sp), 0.5]);
  L.push(["typing", at("writes", 122), 0.38, 36]);
  L.push(["pop", at("writes", 102), 0.22]);
  L.push(["tap", at("answers", 4), 0.4]);
  L.push(["pop", at("answers", lb(16, 17.5)), 0.22]);
  L.push(["tap", at("acts", 2), 0.4]);
  L.push(["pop", at("acts", lb(23, 24.5) + 2), 0.22]);
  L.push(["swish", at("acts", lb(23, 24.5) + 20), 0.14]);
  L.push(["tap", at("remembers", 2), 0.4]);
  L.push(["pop", at("remembers", lb(28, 29.5)), 0.22]);
  L.push(["chime", at("hey", lb(34, 35) + Math.round(vo.hey.words[3].start * 30) - 2), 0.42]);
  L.push(["pop", at("meeting", 12), 0.2]);
  L.push(["click", at("meeting", 44), 0.6]);
  L.push(["swish", at("meeting", 56), 0.14]);
  L.push(["pop", at("suggest", 26), 0.2]);
  L.push(["click", at("suggest", 84), 0.6]);
  L.push(["pop", at("suggest", 96), 0.22]);
  APPS.forEach((_, i) => L.push(["tap", at("apps", appChipAt(i)), 0.2]));
  privateCards(lb(64, 64.5)).forEach((c) => L.push(["swish", at("private", c), 0.12]));
  L.push(["pop", at("private", privateCards(lb(64, 64.5))[2] + 22), 0.18]);
  L.push(["logo", at("logo", Math.round(vo.meet.words[1].start * 30) + lb(72, 73) - 20), 0.45]);
  // soft whooshes under the crossfades (the logo has its own sound)
  SHOTS.slice(1, -1).forEach(([, b]) => L.push(["whoosh", beat(b) - HALF - 4, 0.1]));
  return L;
}
const SFX = sfxList();

const voWindows = VO.map(([id, b]) => [beat(b), beat(b) + Math.round(vo[id].duration * 30)] as const);
function musicVolume(f: number) {
  let dist = Infinity;
  for (const [a, b2] of voWindows) dist = Math.min(dist, f < a ? a - f : f > b2 ? f - b2 : 0);
  const duck = interpolate(dist, [0, 10], [1, 0], { extrapolateRight: "clamp" });
  const fadeIn = interpolate(f, [0, 20], [0.4, 1], { extrapolateRight: "clamp" });
  // the bed builds through its second half; keep it under the voice there
  const build = interpolate(f, [beat(36), beat(60)], [1, 0.72], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (0.8 - 0.46 * duck) * fadeIn * build;
}

export const Ad: React.FC = () => (
  <AbsoluteFill style={{ background: C.bgDark }}>
    <Backdrops />
    {SHOTS.map(([id, b], i) => {
      const { s, from, to } = span(i);
      const View = VIEWS[id];
      return (
        <Sequence key={id} from={from} durationInFrames={to - from} name={id}>
          <Shift.Provider value={s - from}>
            <Fade dur={to - from} first={i === 0} last={i === SHOTS.length - 1}>
              <View start={b} len={span(i).e - s} />
            </Fade>
          </Shift.Provider>
        </Sequence>
      );
    })}
    {VO.map(([id, b]) => (
      <Sequence key={`vo-${id}`} from={beat(b)} name={`vo ${id}`}>
        <Audio src={staticFile(`vo/${id}.mp3`)} volume={1} />
      </Sequence>
    ))}
    {SFX.map(([id, f, v, dur], i) => (
      <Sequence key={`sfx-${i}`} from={f} durationInFrames={dur ?? 90} name={`sfx ${id}`}>
        <Audio src={staticFile(`sfx/${id}.mp3`)} volume={dur ? (x) => v * interpolate(x, [dur - 8, dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : v} />
      </Sequence>
    ))}
    <Audio src={staticFile("music/bed.mp3")} trimBefore={MUSIC_TRIM} volume={musicVolume} />
  </AbsoluteFill>
);

export const AD_FRAMES = beat(END_BEAT);

// ---------------------------------------------------------------- posters
export type PosterProps = { theme: "light" | "dark" };
/**
 * The embed's poster: the end-card lockup, settled, on the app's backdrop in
 * the page's theme, so a dark page never flashes a light square (or the reverse).
 */
export const Poster: React.FC<PosterProps> = ({ theme }) => {
  const tall = useTall();
  const dark = theme === "dark";
  const ink = dark ? "#fafafa" : C.fg;
  return (
    <AbsoluteFill>
      <Backdrop dark={dark} />
      <Center>
        <div style={{ transform: `translateY(${tall ? -70 : -60}px)` }}>
          <Lockup size={tall ? 64 : 72} color={ink} />
        </div>
        <div style={{ position: "absolute", top: "50%", marginTop: tall ? 40 : 34, display: "grid", justifyItems: "center", gap: tall ? 22 : 18, textAlign: "center" }}>
          <div style={{ fontSize: tall ? 46 : 40, fontWeight: 300, letterSpacing: "-0.02em", color: ink }}>tryambient.ai</div>
          <div style={{ fontSize: tall ? 27 : 23, fontWeight: 400, color: dark ? C.mutedDark : C.muted, maxWidth: tall ? 760 : undefined, lineHeight: 1.4 }}>
            Free for Mac, Windows and Linux. Agent on Mac.
          </div>
        </div>
      </Center>
    </AbsoluteFill>
  );
};
