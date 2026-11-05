// Campaign scenes: one real screen moment per concept, built from the launch
// video's kit at app scale (13px UI) inside a small logical box. Campaign.tsx
// scales the box into each format. Everything runs on the absolute frame, so
// a still is just a late frame of the same scene.
//
// Every HUD string here is one the app shows (src/i18n/locales/en/translation.json
// hud.*, meetings.*; the meeting nudge's "They asked: …" is the shape
// src-tauri/src/meeting/mod.rs asks the model for).
import React, { type CSSProperties, type ReactNode } from "react";
import { Easing, useCurrentFrame, useVideoConfig } from "remotion";
import { Levels, Request } from "../Ad";
import { ARRIVE, Bar, C, Check, FONT, HudButton, MacWindow, Orb, RingOrb, Stream, Suggestion, appear, ease, hudCard, springAt } from "../kit";

export const DUR = 270; // 9 s at 30 fps
export const LINE_AT = 186; // the closing line lands here; the scene has played out by then

export type SceneProps = { dark: boolean };
type Rect = { x: number; y: number; w: number; h: number };
export type SceneDef = {
  Scene: React.FC<SceneProps>;
  /** The whole scene, in logical (app) px. */
  box: { w: number; h: number };
  /** What a short banner frames: the moment itself. */
  focus: Rect;
  line: string;
  sub?: string;
  /** The scene frame a still shows (the moment itself); the video plays through. */
  stillAt?: number;
};

const ink = (dark: boolean) => (dark ? C.fgDark : C.fg);
const sub = (dark: boolean) => (dark ? C.mutedDark : C.subtle);

const TONES: Record<string, [string, string]> = {
  Ana: ["#8fa9b8", "#c6d4de"],
  Priya: ["#7d93c9", "#b9c8e6"],
  Tom: ["#c99a8a", "#e8d2c8"],
  Sam: ["#9aa3b5", "#d9d4cf"],
  Jonas: ["#9aa8a0", "#d3dbd5"],
  Camille: ["#c4a48f", "#ead9cc"],
  Kenji: ["#8f9cc0", "#cfd6ea"],
};
const Avatar: React.FC<{ name: string; size?: number; square?: boolean }> = ({ name, size = 28, square }) => {
  const [a, b] = TONES[name] ?? TONES.Sam;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: square ? size / 4 : size / 2,
        background: `linear-gradient(135deg, ${a}, ${b})`,
        flex: "none",
        display: "grid",
        placeItems: "center",
        color: "#fff",
        fontSize: size * 0.44,
        fontWeight: 500,
      }}
    >
      {name[0]}
    </div>
  );
};

/** The writing chip (src/hud/WritingChip.tsx): "Written for you · Use my words". */
const WritingChip: React.FC<{ at: number; label?: string; style?: CSSProperties }> = ({ at, label = "Written for you", style }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = springAt(f, fps, at, { damping: 16, stiffness: 320 });
  return (
    <div
      style={{
        ...hudCard,
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
        ...style,
      }}
    >
      <Orb size={14} color="#fff" floor={0.4} speed={1.2} />
      <span>{label}</span>
      <span style={{ color: C.hFaint }}>·</span>
      <div style={{ height: 22, padding: "0 8px", borderRadius: 7, background: C.hRaise, color: C.hInk, display: "grid", placeItems: "center" }}>Use my words</div>
    </div>
  );
};

type Msg = { who: string; time: string; text: string; at?: number };

/** A chat window: the thread, then a message box that fills with what Ambient wrote. */
const ChatWindow: React.FC<{
  dark: boolean;
  title: string;
  msgs: Msg[];
  placeholder: string;
  draft: string;
  draftAt: number;
  draftTo: number;
  w: number;
  h: number;
  style?: CSSProperties;
}> = ({ dark, title, msgs, placeholder, draft, draftAt, draftTo, w, h, style }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lit = f >= draftAt;
  return (
    <MacWindow dark={dark} w={w} h={h} title={title} style={style}>
      <div style={{ padding: "14px 16px 0", display: "grid", gap: 12, color: ink(dark) }}>
        {msgs.map((m, i) => {
          const s = m.at === undefined ? 1 : springAt(f, fps, m.at, { damping: 18, stiffness: 300 });
          return (
            <div key={i} style={{ display: "flex", gap: 10, opacity: Math.min(1, s * 1.5), transform: `translateY(${(1 - s) * 10}px)` }}>
              <Avatar name={m.who} square />
              <div style={{ display: "grid", gap: 3 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>
                  {m.who} <span style={{ color: sub(dark), fontWeight: 400, fontSize: 11 }}>{m.time}</span>
                </div>
                <div style={{ fontSize: 13.5, whiteSpace: "nowrap" }}>{m.text}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: "absolute",
          left: 14,
          right: 14,
          bottom: 14,
          height: 58,
          boxSizing: "border-box",
          borderRadius: 9,
          boxShadow: `inset 0 0 0 ${lit ? 1 : 0.5}px ${dark ? `rgba(255,255,255,${lit ? 0.22 : 0.14})` : `rgba(0,0,0,${lit ? 0.16 : 0.12})`}`,
          padding: "10px 12px",
          fontSize: 13.5,
          lineHeight: 1.5,
          color: ink(dark),
          whiteSpace: "nowrap",
        }}
      >
        {lit ? <Stream text={draft} from={draftAt} to={draftTo} /> : <span style={{ color: sub(dark) }}>{placeholder}</span>}
      </div>
    </MacWindow>
  );
};

/** In and out of a cut: a short slide with blur, like the launch video's whips. */
const cut = (f: number, at: number, out?: number): CSSProperties => {
  const i = ease(f, [at, at + 8], [1, 0], Easing.bezier(0.1, 0.9, 0.2, 1));
  const o = out === undefined ? 0 : ease(f, [out, out + 6], [0, 1], Easing.bezier(0.6, 0, 0.9, 0.4));
  const x = i * 60 - o * 60;
  const b = (i + o) * 14;
  return { opacity: 1 - Math.max(i, o), transform: `translateX(${x}px)`, filter: b > 0.3 ? `blur(${b}px)` : undefined };
};

// ---------------------------------------------------------------- 1. It nudges you
const N1 = { msg2: 12, card: 34, yes: 74, press: 92, out: 98, draft: 104, draftTo: 128, chip: 132 };
const Nudge: React.FC<SceneProps> = ({ dark }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const win = springAt(f, fps, 0, { damping: 20, stiffness: 240 });
  const gone = ease(f, [N1.out, N1.out + 10], [0, 1]);
  return (
    <>
      <ChatWindow
        dark={dark}
        title="Ana Ruiz"
        w={440}
        h={224}
        msgs={[
          { who: "Ana", time: "10:41", text: "Loved the new deck." },
          { who: "Ana", time: "10:42", text: "Can we do Thursday?", at: N1.msg2 },
        ]}
        placeholder="Message Ana"
        draft="Thursday works for me — any time after 3pm."
        draftAt={N1.draft}
        draftTo={N1.draftTo}
        style={{ left: 0, top: Math.round((1 - win) * 20), opacity: Math.min(1, win * 1.6) }}
      />
      <Suggestion title="Reply to Ana?" accept="Reply" at={N1.card} out={N1.out} pressAccept={N1.press} style={{ left: 150, top: 150 }} />
      <div style={{ opacity: 1 - gone }}>
        <Request text="“yes”" at={N1.yes} style={{ left: 150, top: 212 }} />
      </div>
      <WritingChip at={N1.chip} style={{ position: "absolute", left: 14, top: 236 }} />
    </>
  );
};

// ---------------------------------------------------------------- 2. Any language
// Ambient writes in the language of the conversation (src-tauri/src/agent/writing.rs),
// so you speak yours and the reply comes out in theirs.
const LANGS = [
  { name: "Ana", full: "Ana Ruiz", in: "How's the launch looking?", said: "odpisz, że wszystko ok", out: "All good here, on track for Thursday!" },
  { name: "Jonas", full: "Jonas Weber", in: "Passt dir morgen 15 Uhr?", said: "réponds que c'est bon", out: "Passt, morgen um 15 Uhr ist gut!" },
  { name: "Kenji", full: "Kenji Sato", in: "資料、今日送ってもいいですか？", said: "dile que vale", out: "はい、大丈夫です。お願いします！" },
];
const L_EACH = 52;
const L_STACK = 162;
const Language: React.FC<SceneProps> = ({ dark }) => {
  const f = useCurrentFrame();
  const stackIn = ease(f, [L_STACK, L_STACK + 14], [0, 1], ARRIVE);
  return (
    <>
      {LANGS.map((l, i) => {
        const s = i * L_EACH;
        if (f < s - 2 || f > L_STACK + 8) return null;
        const out = i < LANGS.length - 1 ? s + L_EACH - 6 : L_STACK - 4;
        return (
          <div key={l.name} style={{ position: "absolute", inset: 0, ...cut(f, s, out) }}>
            <ChatWindow
              dark={dark}
              title={l.full}
              w={440}
              h={196}
              msgs={[{ who: l.name, time: "9:12", text: l.in }]}
              placeholder={`Message ${l.name}`}
              draft={l.out}
              draftAt={s + 26}
              draftTo={s + 36}
              style={{ left: 0, top: 30 }}
            />
            <div style={{ opacity: ease(f, [s + 24, s + 30], [1, 0]) }}>
              <Request text={`“${l.said}”`} at={s + 4} style={{ left: 40, top: 240 }} />
            </div>
            <WritingChip at={s + 38} style={{ position: "absolute", left: 14, top: 240 }} />
          </div>
        );
      })}
      {/* the payoff: all three at once */}
      {f >= L_STACK - 2 && (
        <div style={{ position: "absolute", inset: 0 }}>
          {LANGS.map((l, i) => {
            const at = L_STACK + i * 5;
            return (
              <div key={l.name} style={{ position: "absolute", left: 0, top: i * 104, width: 440, ...appear(f, at, undefined, 16, 18) }}>
                <div style={{ ...hudCard, position: "relative", display: "inline-flex", alignItems: "center", gap: 8, height: 30, padding: "0 13px 0 9px", borderRadius: 15, fontSize: 12.5, whiteSpace: "nowrap" }}>
                  <RingOrb size={15} color="#fff" period={1.4} />“{l.said}”
                </div>
                <div
                  style={{
                    marginTop: 8,
                    marginLeft: 26,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 12px",
                    borderRadius: 11,
                    background: dark ? "rgba(30,30,34,0.86)" : "rgba(255,255,255,0.86)",
                    boxShadow: dark ? "0 0 0 0.5px rgba(255,255,255,0.12), 0 14px 30px -12px rgba(0,0,0,0.5)" : "0 0 0 0.5px rgba(0,0,0,0.08), 0 14px 30px -14px rgba(20,24,40,0.25)",
                    color: ink(dark),
                    fontSize: 13.5,
                    whiteSpace: "nowrap",
                    width: "fit-content",
                  }}
                >
                  <Avatar name={l.name} size={22} />
                  <span style={{ color: sub(dark), fontSize: 12 }}>To {l.name}</span>
                  <span>{l.out}</span>
                </div>
              </div>
            );
          })}
          <div style={{ opacity: stackIn }} />
        </div>
      )}
    </>
  );
};

// ---------------------------------------------------------------- 3. Ask anything
const THREAD = ["Priya", "Tom", "Ana", "Sam", "Priya", "Tom", "Ana", "Priya", "Sam", "Tom", "Ana", "Priya"];
const ANSWER = ["Offsite moves to Lisbon, 14–16 October.", "Priya books the venue by Friday.", "Budget stays at €18k; Tom signs off."];
const A3 = { pill: 30, card: 52, src: 96, actions: 104 };
const Ask: React.FC<SceneProps> = ({ dark }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const win = springAt(f, fps, 0, { damping: 20, stiffness: 240 });
  const scroll = ease(f, [0, A3.card], [0, 120], Easing.bezier(0.3, 0, 0.3, 1));
  const s = springAt(f, fps, A3.card, { damping: 18, stiffness: 300 });
  const src = springAt(f, fps, A3.src, { damping: 16, stiffness: 400 });
  return (
    <>
      <MacWindow dark={dark} w={400} h={330} title="Inbox" style={{ left: 0, top: 50 + Math.round((1 - win) * 20), opacity: Math.min(1, win * 1.6) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 14px", borderBottom: `0.5px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)"}`, whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: ink(dark) }}>Re: Q3 offsite</span>
          <span style={{ height: 20, padding: "0 8px", borderRadius: 10, background: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: sub(dark), fontSize: 11, display: "grid", placeItems: "center" }}>
            23 messages
          </span>
        </div>
        <div style={{ position: "absolute", top: 36, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
          <div style={{ transform: `translateY(${-Math.round(scroll)}px)`, padding: "6px 14px", display: "grid", gap: 4 }}>
            {THREAD.map((n, i) => (
              <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "6px 0", borderBottom: `0.5px solid ${dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}` }}>
                <Avatar name={n} size={20} />
                <div style={{ display: "grid", gap: 6, paddingTop: 2 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 500, color: ink(dark), lineHeight: 1 }}>{n}</div>
                  <Bar w={[260, 200, 290, 180, 240][i % 5]} o={0.8} dark={dark} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </MacWindow>
      <Request text="“what did they decide?”" at={A3.pill} style={{ left: 20, top: 0 }} />
      <div
        style={{
          ...hudCard,
          left: 196,
          top: 96,
          width: 316,
          opacity: Math.min(1, s * 1.5),
          transform: `translateY(${(1 - s) * -14}px) scale(${0.9 + 0.1 * s})`,
          transformOrigin: "50% 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Orb size={18} color="#fff" speed={1.5} />
          <span style={{ fontSize: 12, color: C.hMuted, whiteSpace: "nowrap" }}>what did they decide?</span>
        </div>
        <div style={{ marginTop: 6 }}>
          {ANSWER.map((a, i) => {
            const t = springAt(f, fps, A3.card + 10 + i * 9, { damping: 18, stiffness: 320 });
            return (
              <div key={a} style={{ display: "flex", alignItems: "baseline", gap: 9, fontSize: 13.5, lineHeight: 1.45, marginTop: 6, opacity: Math.min(1, t * 1.5), transform: `translateX(${(1 - t) * -10}px)` }}>
                <span style={{ width: 4, height: 4, borderRadius: 2, background: C.hMuted, flex: "none", transform: "translateY(-3px)" }} />
                <span>{a}</span>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 11, minHeight: 21 }}>
          <div
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
              opacity: Math.min(1, src * 1.5),
              transform: `scale(${0.7 + 0.3 * src})`,
              transformOrigin: "0 50%",
            }}
          >
            <span style={{ display: "inline-grid", placeItems: "center", width: 15, height: 15, borderRadius: 4, background: C.hHair, fontSize: 10 }}>1</span>
            Re: Q3 offsite · 23 messages
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, paddingTop: 10, borderTop: `0.5px solid ${C.hHair}`, opacity: ease(f, [A3.actions, A3.actions + 8], [0, 1]) }}>
          <HudButton label="Insert" kbd="⏎" primary />
          <HudButton label="Copy" />
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------- 4. Notes for any call
const PEOPLE = [
  { n: "Priya", g: TONES.Priya },
  { n: "Tom", g: TONES.Tom },
  { n: "Ana", g: TONES.Ana },
  { n: "You", g: TONES.Sam },
];
const ROWS = [
  { who: "You", t: "Pricing page is ready for review.", at: -100 },
  { who: "Them", t: "Great. Can you send the Q3 numbers by Friday?", at: 30 },
];
const M4 = { nudge: 74 };
const Notes: React.FC<SceneProps> = ({ dark }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const win = springAt(f, fps, 0, { damping: 20, stiffness: 240 });
  const speaker = f < ROWS[1].at ? 3 : 0;
  const secs = 12 * 60 + 4 + Math.floor(f / 30);
  return (
    <>
      <MacWindow dark w={340} h={236} title="Weekly sync" style={{ left: 0, top: 60, opacity: Math.min(1, win * 1.6) }}>
        {PEOPLE.map((p, i) => (
          <div
            key={p.n}
            style={{
              position: "absolute",
              left: 8 + (i % 2) * 164,
              top: 8 + Math.floor(i / 2) * 98,
              width: 160,
              height: 94,
              borderRadius: 9,
              background: `linear-gradient(135deg, ${p.g[0]}, ${p.g[1]})`,
              boxShadow: i === speaker ? "inset 0 0 0 2px rgba(255,255,255,0.95)" : "none",
              display: "grid",
              placeItems: "center",
            }}
          >
            <div style={{ width: 38, height: 38, borderRadius: 19, background: "rgba(255,255,255,0.35)", display: "grid", placeItems: "center", fontSize: 16, color: "#fff", transform: `scale(${1 + (i === speaker ? 0.08 * (0.5 + 0.5 * Math.sin(f * 0.8)) : 0)})` }}>
              {p.n === "You" ? "M" : p.n[0]}
            </div>
            <div style={{ position: "absolute", left: 6, bottom: 6, fontSize: 10.5, color: "#fff", padding: "1px 6px", borderRadius: 5, background: "rgba(0,0,0,0.28)" }}>{p.n}</div>
          </div>
        ))}
      </MacWindow>
      {/* the notes panel: live, on this computer; nobody joins the call */}
      <div
        style={{
          position: "absolute",
          left: 250,
          top: 128,
          width: 270,
          borderRadius: 14,
          background: dark ? "rgba(30,30,34,0.94)" : "rgba(255,255,255,0.94)",
          boxShadow: dark ? "0 0 0 0.5px rgba(255,255,255,0.12), 0 24px 60px -18px rgba(0,0,0,0.6)" : "0 0 0 0.5px rgba(0,0,0,0.08), 0 24px 60px -18px rgba(20,24,40,0.45)",
          fontFamily: FONT,
          color: ink(dark),
          ...appear(f, 8),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 13px", borderBottom: `0.5px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)"}`, whiteSpace: "nowrap" }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: C.rec, opacity: 0.6 + 0.4 * Math.abs(Math.sin(f * 0.08)) }} />
          <span style={{ fontSize: 12.5, fontWeight: 500 }}>
            Taking notes · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
          </span>
        </div>
        <div style={{ padding: "6px 13px 10px" }}>
          {ROWS.map((r, i) => {
            const t = springAt(f, fps, r.at, { damping: 18, stiffness: 300 });
            return (
              <div key={i} style={{ display: "flex", gap: 10, padding: "6px 0", fontSize: 12.5, lineHeight: 1.45, opacity: Math.min(1, t * 1.5), transform: `translateY(${(1 - t) * 10}px)` }}>
                <span style={{ width: 36, flex: "none", color: r.who === "You" ? ink(dark) : sub(dark), fontWeight: 500 }}>{r.who}</span>
                <span>{r.t}</span>
              </div>
            );
          })}
        </div>
      </div>
      <Suggestion title="They asked: can you send the Q3 numbers?" accept="Find it" at={M4.nudge} style={{ left: 30, top: 0 }} />
    </>
  );
};

// ---------------------------------------------------------------- 5. Remind me
const R5 = { card: 40, press: 90, out: 96, done: 100, list: 114 };
const Remind: React.FC<SceneProps> = ({ dark }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const win = springAt(f, fps, 0, { damping: 20, stiffness: 240 });
  const done = springAt(f, fps, R5.done, { damping: 16, stiffness: 340 });
  const list = springAt(f, fps, R5.list, { damping: 18, stiffness: 260 });
  return (
    <>
      <MacWindow dark={dark} w={430} h={230} title="Re: Board deck" style={{ left: 0, top: Math.round((1 - win) * 20), opacity: Math.min(1, win * 1.6) }}>
        <div style={{ padding: "14px 16px", color: ink(dark) }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar name="Priya" size={30} />
            <div style={{ display: "grid", gap: 2 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Priya Shah</div>
              <div style={{ fontSize: 11.5, color: sub(dark) }}>To: you · 9:05</div>
            </div>
          </div>
          <div style={{ marginTop: 14, fontSize: 13.5, lineHeight: 1.6 }}>
            Hi! The board liked the draft.
            <br />
            Could you{" "}
            <span style={{ borderRadius: 4, padding: "1px 3px", margin: "0 -3px", background: `rgba(236,180,120,${0.38 * ease(f, [R5.card - 8, R5.card + 6], [0, 1])})` }}>send the deck by Friday</span>? Thanks!
          </div>
          <div style={{ display: "grid", gap: 7, marginTop: 14 }}>
            <Bar w={300} o={0.7} dark={dark} />
            <Bar w={220} o={0.7} dark={dark} />
          </div>
        </div>
      </MacWindow>
      <Suggestion title="Due Friday. Want a reminder?" accept="Remind me" at={R5.card} out={R5.out} pressAccept={R5.press} style={{ left: 56, top: 196 }} />
      <div
        style={{
          ...hudCard,
          left: 100,
          top: 196,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          whiteSpace: "nowrap",
          opacity: Math.min(1, done * 1.5),
          transform: `scale(${0.85 + 0.15 * done})`,
          transformOrigin: "0 50%",
        }}
      >
        <Check />
        <span>Reminder added: Send Priya the deck</span>
        <div style={{ marginLeft: 8, height: 24, padding: "0 10px", borderRadius: 7, background: C.hRaise, fontSize: 12, display: "grid", placeItems: "center" }}>Undo</div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 200,
          top: 262,
          width: 270,
          boxSizing: "border-box",
          borderRadius: 12,
          background: dark ? "rgba(30,30,34,0.94)" : "rgba(255,255,255,0.94)",
          boxShadow: dark ? "0 0 0 0.5px rgba(255,255,255,0.12), 0 16px 40px -16px rgba(0,0,0,0.6)" : "0 0 0 0.5px rgba(0,0,0,0.08), 0 16px 40px -16px rgba(20,24,40,0.3)",
          padding: "10px 12px",
          fontFamily: FONT,
          opacity: Math.min(1, list * 1.5),
          transform: `translateY(${(1 - list) * 20}px)`,
        }}
      >
        <div style={{ fontSize: 11, color: sub(dark), marginBottom: 7, fontWeight: 500 }}>Reminders · Friday</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 16, height: 16, borderRadius: 8, border: `1.5px solid ${dark ? "#5a5a60" : "#c7c7cc"}`, flex: "none" }} />
          <div style={{ fontSize: 13, color: ink(dark), flex: 1, whiteSpace: "nowrap" }}>Send Priya the deck</div>
          <div style={{ fontSize: 12, color: C.rec, whiteSpace: "nowrap" }}>9:00 AM</div>
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------- 6. Free, on your computer
const DICTATED = "Pick up the cake at 5, then call Mum about Sunday lunch. Ask Sam if the train tickets came through.";
const F6 = { pill: 10, words: 16, wordsTo: 80, stop: 88, chip: 100 };
/** The recording pill (src/overlay): red dot, nine live levels, timer. */
const RecPill: React.FC<{ at: number; stop: number; style?: CSSProperties }> = ({ at, stop, style }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = springAt(f, fps, at, { damping: 16, stiffness: 300 });
  const gone = ease(f, [stop + 4, stop + 14], [0, 1]);
  const live = f < stop ? 1 : 0;
  return (
    <div
      style={{
        position: "absolute",
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
        transform: `scale(${(0.6 + 0.4 * s) * (1 - 0.1 * gone)})`,
        opacity: Math.min(1, s * 1.5) * (1 - gone),
        fontFamily: FONT,
        ...style,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 4, background: C.rec }} />
      {live ? <Levels /> : <Orb size={16} color="#fff" speed={3} />}
      <span style={{ justifySelf: "end", fontSize: 12, color: C.hFaint, fontVariantNumeric: "tabular-nums" }}>0:0{Math.max(0, Math.min(stop, f) - at) > 0 ? Math.floor((Math.min(stop, f) - at) / 30) : 0}</span>
    </div>
  );
};
const Free: React.FC<SceneProps> = ({ dark }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const win = springAt(f, fps, 0, { damping: 20, stiffness: 240 });
  return (
    <>
      <MacWindow dark={dark} w={440} h={176} title="Notes" style={{ left: 0, top: Math.round((1 - win) * 20), opacity: Math.min(1, win * 1.6) }}>
        <div style={{ padding: "16px 20px", color: ink(dark) }}>
          <div style={{ fontSize: 17, fontWeight: 500, letterSpacing: "-0.01em" }}>Saturday</div>
          <div style={{ fontSize: 11.5, color: sub(dark), marginTop: 3 }}>Today at 9:41</div>
          <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6, minHeight: 66, whiteSpace: "normal" }}>
            {/* typed as you speak */}
            <Stream text={DICTATED} from={F6.words} to={F6.wordsTo} />
            {/* the caret only once the words are in (Stream lays out every word from the start) */}
            <span style={{ display: f >= F6.wordsTo ? "inline-block" : "none", width: 1.5, height: 17, marginLeft: 2, background: ink(dark), verticalAlign: "-3px", opacity: Math.floor(f / 16) % 2 === 0 ? 1 : 0.15 }} />
          </div>
        </div>
      </MacWindow>
      <RecPill at={F6.pill} stop={F6.stop} style={{ left: 128, top: 196 }} />
      <WritingChip at={F6.chip} label="Polished" style={{ position: "absolute", left: 14, top: 190 }} />
    </>
  );
};

export const SCENES: Record<string, SceneDef> = {
  nudge: { Scene: Nudge, box: { w: 440, h: 270 }, focus: { x: 0, y: 0, w: 440, h: 270 }, line: "It nudges you, / like a colleague.", stillAt: 90 },
  language: { Scene: Language, box: { w: 396, h: 300 }, focus: { x: 0, y: 0, w: 396, h: 300 }, line: "Speak your language. / It writes theirs." },
  ask: { Scene: Ask, box: { w: 512, h: 380 }, focus: { x: 0, y: 0, w: 512, h: 380 }, line: "Ask anything. / It answers right where you are." },
  notes: { Scene: Notes, box: { w: 520, h: 300 }, focus: { x: 0, y: 0, w: 520, h: 300 }, line: "Notes for any call. / No bot joins." },
  remind: { Scene: Remind, box: { w: 470, h: 310 }, focus: { x: 0, y: 0, w: 470, h: 310 }, line: "Promise made. / Reminder set." },
  free: { Scene: Free, box: { w: 440, h: 240 }, focus: { x: 0, y: 0, w: 440, h: 240 }, stillAt: 84, line: "Free, on your computer.", sub: "Start free. Go unlimited." },
};
export const CONCEPTS = Object.keys(SCENES);

export const Box: React.FC<{ def: SceneDef; children?: ReactNode }> = ({ def, children }) => (
  <div style={{ position: "relative", width: def.box.w, height: def.box.h, fontFamily: FONT, letterSpacing: "-0.006em", textRendering: "geometricPrecision" }}>{children}</div>
);
