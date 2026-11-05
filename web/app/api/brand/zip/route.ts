import { readFileSync } from "node:fs";
import { join } from "node:path";
import { brand } from "@/lib/brand";
import { LOGOS, LOGO_SIZES, LOGO_THEMES, copyDonts, logoPngName, logoSvg } from "@/lib/marketing/catalog";
import { IMMUTABLE, logoImage } from "@/lib/marketing/render";
import { zip } from "@/lib/marketing/zip";

export const maxDuration = 60;

/**
 * /api/brand/zip: every logo as SVG and as transparent PNG at each size, in
 * one stored zip (about 2 MB). Rendered once, then cached for a year at the
 * edge; ASSETS_VERSION in the link moves it to a fresh URL after a change.
 */
export async function GET() {
  const files: { name: string; data: Uint8Array }[] = [];
  const dir = `${brand.slug}-logos`;
  for (const logo of LOGOS) {
    for (const theme of LOGO_THEMES) {
      const svg = logoSvg(logo.id, theme.id);
      if (svg) files.push({ name: `${dir}/svg/${svg.split("/").pop()}`, data: readFileSync(join(process.cwd(), "public", svg)) });
    }
  }
  const renders = LOGOS.flatMap((logo) =>
    LOGO_THEMES.flatMap((theme) =>
      LOGO_SIZES.map(async (size) => {
        const name = logoPngName(logo.id, theme.id, size);
        const data = new Uint8Array(await logoImage(logo.id, theme.id, size, name).arrayBuffer());
        return { name: `${dir}/png/${size}/${name}`, data };
      }),
    ),
  );
  files.push(...(await Promise.all(renders)));
  const readme = [
    `${brand.name} logos`,
    "",
    "light = dark ink, for light backgrounds. dark = light ink, for dark backgrounds.",
    "PNGs are transparent; sizes are widths in pixels. Use the SVGs wherever they're accepted.",
    "",
    "Please don't:",
    ...copyDonts.filter((d) => d.includes("logo")).map((d) => `- ${d}`),
    "",
    `Questions: ${brand.supportEmail}`,
    "",
  ].join("\n");
  files.unshift({ name: `${dir}/README.txt`, data: new TextEncoder().encode(readme) });

  return new Response(Buffer.from(zip(files)), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${dir}.zip"`,
      "Cache-Control": IMMUTABLE,
    },
  });
}
