import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { brand } from "../brand";
import { LOGOS, type BannerFormat, type LogoId, type LogoSize, type LogoTheme } from "./catalog";

/**
 * Renders the marketing logos and banners with next/og (Satori + resvg, no
 * extra dependency). Same look as lib/og.tsx: the site's two backdrop lights,
 * a frosted card, the lockup, a headline in Geist Light. The fonts and SVGs
 * are read from disk, so next.config.ts traces them into these routes.
 */

/** Long-lived and shared: every URL is a fixed id plus ASSETS_VERSION. */
export const IMMUTABLE = "public, max-age=31536000, s-maxage=31536000, immutable";

const fontFile = (file: string) => readFileSync(join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans", file));
let fontCache: { name: string; data: Buffer; weight: 300 | 400; style: "normal" }[] | null = null;
function fonts() {
  fontCache ??= [
    { name: "Geist", data: fontFile("Geist-Light.ttf"), weight: 300, style: "normal" },
    { name: "Geist", data: fontFile("Geist-Regular.ttf"), weight: 400, style: "normal" },
  ];
  return fontCache;
}

const svgCache = new Map<string, string>();
/** public/brand/<file> as a data URI. */
function brandSvg(file: string) {
  let uri = svgCache.get(file);
  if (!uri) {
    uri = `data:image/svg+xml;base64,${readFileSync(join(process.cwd(), "public/brand", file)).toString("base64")}`;
    svgCache.set(file, uri);
  }
  return uri;
}

export const ink = { light: "#0a0a0a", dark: "#f5f5f5" } as const;

// ---------------------------------------------------------------------------
// Logos
// ---------------------------------------------------------------------------

export function logoDimensions(id: LogoId, size: LogoSize) {
  const aspect = LOGOS.find((l) => l.id === id)!.aspect;
  return { width: size, height: Math.round(size / aspect) };
}

/** A logo PNG on a transparent background, `size` pixels wide. */
export function logoImage(id: LogoId, theme: LogoTheme, size: LogoSize, filename: string) {
  const { width, height } = logoDimensions(id, size);
  let el;
  if (id === "icon") {
    // The app tile: a rounded square (macOS-like 22.4% corners), the mark at 62%.
    const tile =
      theme === "light"
        ? { bg: "linear-gradient(180deg, #ffffff 0%, #f1f1f4 100%)", edge: "rgba(0,0,0,0.08)", mark: "light" }
        : { bg: "linear-gradient(180deg, #2a2a2f 0%, #131316 100%)", edge: "rgba(255,255,255,0.10)", mark: "dark" };
    const inset = Math.round(size * 0.1); // room for the tile's shadow-free margin, like Apple's grid
    const side = size - inset * 2;
    el = (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width: side,
            height: side,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: side * 0.224,
            backgroundImage: tile.bg,
            border: `${Math.max(1, Math.round(size / 512))}px solid ${tile.edge}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse needs a plain img */}
          <img src={brandSvg(`ambient-mark-${tile.mark}.svg`)} width={side * 0.62} height={side * 0.62} alt="" />
        </div>
      </div>
    );
  } else {
    el = (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse needs a plain img */}
        <img src={brandSvg(`ambient-${id}-${theme}.svg`)} width={width} height={height} alt="" />
      </div>
    );
  }
  return new ImageResponse(el, {
    width,
    height,
    headers: { "Cache-Control": IMMUTABLE, "Content-Disposition": `inline; filename="${filename}"` },
  });
}

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------

const THEME = {
  light: {
    bg: "#f5f5f7",
    lights:
      "radial-gradient(circle at 12% 0%, rgba(186,204,236,0.95) 0%, rgba(186,204,236,0) 55%), radial-gradient(circle at 100% 100%, rgba(236,214,204,0.9) 0%, rgba(236,214,204,0) 55%)",
    card: "rgba(255,255,255,0.62)",
    edge: "rgba(255,255,255,0.9)",
    shadow: "0 1px 2px rgba(0,0,0,0.04), 0 30px 60px -30px rgba(0,0,0,0.18)",
    fg: "#0a0a0a",
    muted: "#666666",
  },
  dark: {
    bg: "#0b0b0d",
    lights:
      "radial-gradient(circle at 12% 0%, rgba(64,84,140,0.85) 0%, rgba(64,84,140,0) 55%), radial-gradient(circle at 100% 100%, rgba(120,72,64,0.7) 0%, rgba(120,72,64,0) 55%)",
    card: "rgba(30,30,34,0.55)",
    edge: "rgba(255,255,255,0.14)",
    shadow: "0 1px 2px rgba(0,0,0,0.3), 0 30px 60px -30px rgba(0,0,0,0.6)",
    fg: "#ededed",
    muted: "#a1a1a1",
  },
} as const;

/** Rough Geist Light advance at -0.05em tracking, per em, with slack for wide letters. */
const CHAR_EM = 0.47;

function wrap(text: string, perLine: number) {
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(" ")) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > perLine && cur) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** The biggest headline size that fits `w` × `h`, with its lines. */
function fitHeadline(text: string, w: number, h: number) {
  let fs = Math.min(h / 1.05, w / (CHAR_EM * 7));
  for (; fs > 8; fs *= 0.96) {
    const lines = wrap(text, Math.max(1, Math.floor(w / (CHAR_EM * fs))));
    const longest = Math.max(...lines.map((l) => l.length));
    if (lines.length * fs * 1.06 <= h && longest * CHAR_EM * fs <= w) return { fs: Math.floor(fs), lines };
  }
  return { fs: 8, lines: [text] };
}

export function bannerImage(format: BannerFormat, headline: string, theme: LogoTheme, filename: string) {
  const t = THEME[theme];
  const { w, h } = format;
  const [sl, st, sr, sb] = format.safe;
  const cw = w - sl - sr;
  const ch = h - st - sb;
  const short = Math.min(cw, ch);
  const wide = cw / ch > 2.4;
  const pad = Math.round(short * (wide ? 0.14 : 0.085));
  const radius = Math.round(Math.min(short * 0.09, 48 * (short / 500) + 8));
  const logoFs = Math.round(Math.max(13, Math.min(short * (wide ? 0.11 : 0.055), 64)));
  const orb = Math.round(logoFs * 1.25);
  const innerW = cw - pad * 2;
  const innerH = ch - pad * 2 - orb * (wide ? 1.4 : 2);
  // A sub line when there's room: tall and square formats, not the strips.
  const sub = !wide && ch >= 520 ? "A live agent on your desktop." : null;
  const { fs, lines } = fitHeadline(headline, innerW, sub ? innerH * 0.8 : innerH);
  const headSize = Math.min(fs, Math.round(short * (wide ? 0.34 : 0.16)));
  const subFs = Math.max(14, Math.round(headSize * 0.26));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: `${st}px ${sr}px ${sb}px ${sl}px`,
          background: t.bg,
          backgroundImage: t.lights,
          fontFamily: "Geist",
          color: t.fg,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: pad,
            borderRadius: radius,
            background: t.card,
            border: `${w >= 1500 ? 2 : 1}px solid ${t.edge}`,
            boxShadow: t.shadow,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: Math.round(logoFs * 0.14) }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse needs a plain img */}
              <img src={brandSvg(`ambient-mark-${theme}.svg`)} width={orb} height={orb} alt="" style={{ marginTop: Math.round(logoFs * 0.08) }} />
              <div style={{ fontSize: logoFs, fontWeight: 400, letterSpacing: "-0.04em" }}>{brand.slug}</div>
            </div>
            <div style={{ fontSize: Math.round(logoFs * 0.62), fontWeight: 400, letterSpacing: "-0.01em", color: t.muted }}>{brand.domain}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", flexDirection: "column", fontSize: headSize, fontWeight: 300, letterSpacing: "-0.05em", lineHeight: 1.04 }}>
              {lines.map((line) => (
                <div key={line} style={{ whiteSpace: "nowrap" }}>
                  {line}
                </div>
              ))}
            </div>
            {sub ? (
              <div style={{ marginTop: Math.round(subFs * 1.1), fontSize: subFs, fontWeight: 400, letterSpacing: "-0.01em", color: t.muted }}>{sub}</div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    {
      width: w,
      height: h,
      fonts: fonts(),
      headers: { "Cache-Control": IMMUTABLE, "Content-Disposition": `inline; filename="${filename}"` },
    },
  );
}
