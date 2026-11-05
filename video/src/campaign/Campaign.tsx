// Campaign creative: one scene (scenes.tsx) laid out for each format. Stories
// are vertical with the UI large and the line underneath; the feed post puts
// the line on top; banners put the line on the left and the UI on the right,
// framed on the scene's focus. Stills are the last frame.
import React, { type CSSProperties } from "react";
import { AbsoluteFill, Freeze, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop, C, FONT, FONT_DISPLAY, Lockup, Soft, TRAVEL, appear, ease } from "../kit";
import { Box, DUR, LINE_AT, SCENES, type SceneDef } from "./scenes";

export { DUR };
export type CampaignProps = { concept: string; theme: "light" | "dark"; still?: boolean };

/** Formats: id → size. Story renders as MP4 and a PNG; the rest are PNGs. */
export const FORMATS = {
  story: { w: 1080, h: 1920 },
  feed: { w: 1080, h: 1350 },
  x: { w: 1500, h: 500 },
  linkedin: { w: 1200, h: 627 },
  web: { w: 1920, h: 600 },
  email: { w: 1200, h: 400 },
} as const;
export type FormatId = keyof typeof FORMATS;

const URL = "tryambient.ai";

/** The closing line: " / " marks where it should break; each part may still wrap inside. */
const Line: React.FC<{ text: string; size: number; color: string; align?: "left" | "center"; style?: CSSProperties }> = ({ text, size, color, align, style }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: align === "center" ? "center" : "flex-start", ...style }}>
    {text.split(" / ").map((part, i, all) => (
      <Soft key={i} text={part} at={LINE_AT + all.slice(0, i).join(" ").split(" ").length * 5} size={size} color={color} align={align} />
    ))}
  </div>
);

/** The scene scaled by `s` with its point (fx, fy) placed at (x, y). */
const Placed: React.FC<{ def: SceneDef; dark: boolean; still?: boolean; s: number; x: number; y: number; fx: number; fy: number; style?: CSSProperties }> = ({
  def,
  dark,
  still,
  s,
  x,
  y,
  fx,
  fy,
  style,
}) => (
  <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `translate(${x - fx * s}px, ${y - fy * s}px) scale(${s})`, ...style }}>
    <Box def={def}>
      {still && def.stillAt !== undefined ? (
        <Freeze frame={def.stillAt}>
          <def.Scene dark={dark} />
        </Freeze>
      ) : (
        <def.Scene dark={dark} />
      )}
    </Box>
  </div>
);

export const Campaign: React.FC<CampaignProps> = ({ concept, theme, still }) => {
  const f = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const def = SCENES[concept] ?? SCENES.nudge;
  const dark = theme === "dark";
  const fg = dark ? C.fgDark : C.fg;
  const muted = dark ? C.mutedDark : C.muted;
  const logo = dark ? "#fafafa" : C.fg;
  const { box } = def;

  // ---------------------------------------------------------------- story 9:16
  if (H / W > 1.6) {
    // IG covers ~250px at the top and ~340px at the bottom: everything sits between.
    const area = { x: 90, y: 400, w: 900, h: 800 }; // HUD cards may poke past the scene box: keep ~70px clear each side
    const s = Math.min(area.w / box.w, area.h / box.h);
    // the UI plays large and centred, then eases up into place as the line lands
    const t = ease(f, [LINE_AT - 26, LINE_AT + 4], [0, 1], TRAVEL);
    // never wider than the frame's margins: a slow push to full width, then a settle back
    const push = 0.98 + 0.03 * ease(f, [0, LINE_AT - 26], [0, 1]);
    const k = push + (0.96 - push) * t;
    const cy = 930 + (area.y + area.h / 2 - 930) * t;
    return (
      <AbsoluteFill>
        <Backdrop dark={dark} />
        <Placed def={def} dark={dark} still={still} s={s * k} x={W / 2} y={cy} fx={box.w / 2} fy={box.h / 2} />
        <div style={{ position: "absolute", top: 262, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <Lockup size={46} color={logo} />
        </div>
        <div style={{ position: "absolute", top: 1250, left: 70, right: 70, display: "flex", flexDirection: "column", alignItems: "center", gap: 26 }}>
          <Line text={def.line} size={84} color={fg} align="center" style={{ maxWidth: 940 }} />
          {def.sub && <Soft text={def.sub} at={LINE_AT + 14} size={46} color={muted} align="center" />}
          <div style={{ fontFamily: FONT, fontSize: 32, color: muted, letterSpacing: "-0.01em", ...appear(f, LINE_AT + 22) }}>{URL}</div>
        </div>
      </AbsoluteFill>
    );
  }

  // ---------------------------------------------------------------- feed 4:5
  if (H > W) {
    // rough line count for the 76px headline in a 920px column (Display 300 averages ~0.46em a glyph)
    const lines = def.line.split(" / ").reduce((n, part) => n + Math.ceil((part.length * 88 * 0.46) / 920), 0);
    const top = 100 + lines * 95 + (def.sub ? 70 : 0) + 60;
    const area = { x: 72, y: top, w: 936, h: 1350 - 170 - top };
    const s = Math.min(area.w / box.w, area.h / box.h);
    return (
      <AbsoluteFill>
        <Backdrop dark={dark} />
        <div style={{ position: "absolute", left: 80, top: 100, right: 80 }}>
          <Line text={def.line} size={88} color={fg} style={{ maxWidth: 920 }} />
          {def.sub && <Soft text={def.sub} at={LINE_AT + 14} size={42} color={muted} style={{ marginTop: 20 }} />}
        </div>
        <Placed def={def} dark={dark} still={still} s={s} x={W / 2} y={area.y + area.h / 2} fx={box.w / 2} fy={box.h / 2} />
        <div style={{ position: "absolute", left: 80, right: 80, bottom: 76, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Lockup size={36} color={logo} />
          <div style={{ fontFamily: FONT, fontSize: 28, color: muted, letterSpacing: "-0.01em" }}>{URL}</div>
        </div>
      </AbsoluteFill>
    );
  }

  // ---------------------------------------------------------------- banners
  // X puts the profile photo over the bottom-left: keep the text high there.
  const xHeader = W === 1500 && H === 500;
  const pad = Math.round(H * 0.15);
  const colW = Math.round(W * (W / H > 2.6 ? 0.37 : 0.42));
  const lineSize = Math.round(Math.min(H * 0.105, colW * 0.1));
  const area = { x: colW + pad * 0.2, y: pad * 0.5, w: W - colW - pad * 0.8, h: H - pad };
  const fo = def.focus;
  const s = Math.min(area.w / fo.w, area.h / fo.h);
  return (
    <AbsoluteFill>
      <Backdrop dark={dark} />
      <Placed
        def={def}
        dark={dark}
        still={still}
        s={s}
        x={area.x + area.w / 2}
        y={area.y + area.h / 2}
        fx={fo.x + fo.w / 2}
        fy={fo.y + fo.h / 2}
        style={{}}
      />
      <div
        style={{
          position: "absolute",
          left: Math.round(pad * 0.95),
          top: 0,
          bottom: 0,
          width: colW - pad,
          display: "flex",
          flexDirection: "column",
          justifyContent: xHeader ? "flex-start" : "center",
          paddingTop: xHeader ? Math.round(H * 0.16) : 0,
          gap: Math.round(H * 0.05),
          fontFamily: FONT_DISPLAY,
        }}
      >
        <Lockup size={Math.round(H * 0.058)} color={logo} />
        <div>
          <Line text={def.line} size={lineSize} color={fg} />
          {def.sub && <Soft text={def.sub} at={LINE_AT + 14} size={Math.round(lineSize * 0.56)} color={muted} style={{ marginTop: Math.round(H * 0.025) }} />}
        </div>
        <div style={{ fontFamily: FONT, fontSize: Math.round(Math.max(18, H * 0.042)), color: muted, letterSpacing: "-0.01em" }}>{URL}</div>
      </div>
    </AbsoluteFill>
  );
};
