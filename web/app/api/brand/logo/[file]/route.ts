import { logoPngName, parseLogoName } from "@/lib/marketing/catalog";
import { logoImage } from "@/lib/marketing/render";

/**
 * /api/brand/logo/ambient-<mark|lockup|wordmark|icon>-<light|dark>-<512|1024|2048>.png
 * Transparent PNGs rendered from public/brand/*.svg. Public (they're logos),
 * a fixed set of names, cached for a year at the edge.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const parsed = parseLogoName((await params).file);
  if (!parsed) return new Response("Not found", { status: 404 });
  return logoImage(parsed.id, parsed.theme, parsed.size, logoPngName(parsed.id, parsed.theme, parsed.size));
}
