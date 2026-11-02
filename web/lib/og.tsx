import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { brand } from "./brand";

export const ogSize = { width: 1200, height: 630 };

const font = (file: string) => readFileSync(join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans", file));

/** The static B1 lens mark (public/mark-glyph.svg) as an <img> data URI in a fixed colour. */
function markUri(color: string) {
  const svg = readFileSync(join(process.cwd(), "public", "mark-glyph.svg"), "utf8").replace(/currentColor/g, color);
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * Shared Open Graph / Twitter card: a frosted glass card on the ambient
 * gradient, with the orb + wordmark lockup and the page title in light type.
 * Deliberately minimal: no domain, no platform line.
 */
/** `title` may be a list of lines, to control where it breaks. */
export function ogImage({ title }: { title: string | string[] }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: 56,
          background: "#f5f5f7",
          backgroundImage:
            "radial-gradient(circle at 12% 0%, rgba(186,204,236,0.95) 0%, rgba(186,204,236,0) 55%), radial-gradient(circle at 100% 100%, rgba(236,214,204,0.9) 0%, rgba(236,214,204,0) 55%)",
          fontFamily: "Geist",
          color: "#0a0a0a",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "52px 60px",
            borderRadius: 40,
            background: "rgba(255,255,255,0.62)",
            border: "1px solid rgba(255,255,255,0.9)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 30px 60px -30px rgba(0,0,0,0.18)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* Same lockup ratio as <Logo>: orb ≈ 1.25 × 42px wordmark, 0.14em gap. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse needs a plain img */}
            <img src={markUri("#0a0a0a")} width={52} height={52} alt="" style={{ marginTop: 3 }} />
            <div style={{ fontSize: 42, fontWeight: 400, letterSpacing: "-0.04em" }}>{brand.slug}</div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 96,
              fontWeight: 300,
              letterSpacing: "-0.05em",
              lineHeight: 1.02,
              maxWidth: 960,
            }}
          >
            {(Array.isArray(title) ? title : [title]).map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      ...ogSize,
      fonts: [
        { name: "Geist", data: font("Geist-Light.ttf"), weight: 300, style: "normal" },
        { name: "Geist", data: font("Geist-Regular.ttf"), weight: 400, style: "normal" },
      ],
    },
  );
}
