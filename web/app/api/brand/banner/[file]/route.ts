import { bannerName, parseBannerName } from "@/lib/marketing/catalog";
import { bannerImage } from "@/lib/marketing/render";

/**
 * /api/brand/banner/ambient-<format>-<headline>-<light|dark>.png
 * Social, web and email banners, rendered on demand. Only catalog ids are
 * accepted (no free text), so the set is finite and each one is cached for a
 * year at the edge: after the first view a banner costs nothing.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const parsed = parseBannerName((await params).file);
  if (!parsed) return new Response("Not found", { status: 404 });
  const { format, headline, theme } = parsed;
  return bannerImage(format, headline.text, theme, bannerName(format.id, headline.id, theme));
}
