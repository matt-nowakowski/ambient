import { countDaily, looksLikeBot, requestCountry } from "@/lib/activity";
import { releases } from "@/lib/releases";

const ORIGIN = process.env.DOWNLOADS_ORIGIN;

type Manifest = { version: string; files: string[] };

/** Stable download link: resolves the current installer from the manifest the
 * Release workflow writes to R2, so the site never needs a redeploy per release.
 * Each download adds one to daily totals by file, version and country (after
 * the redirect is sent; no IP or identifier is kept). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const release = releases[id as keyof typeof releases];
  if (!release) return new Response("Unknown download", { status: 404 });

  const res = await fetch(`${ORIGIN}/releases/manifest.json`, {
    next: { revalidate: 60 },
    // A stalled R2 read falls back to the "unavailable" page instead of
    // holding the function open.
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);
  const manifest = res?.ok ? ((await res.json()) as Manifest) : null;
  const file = manifest?.files.find((f) => f.endsWith(release.suffix));
  if (!manifest || !file) {
    return Response.redirect(new URL("/download?unavailable=1", req.url), 302);
  }
  if (!looksLikeBot(req)) {
    const country = requestCountry(req);
    countDaily([
      ["download", id],
      ["download_version", manifest.version],
      ...(country ? [["download_country", country] as [string, string]] : []),
    ]);
  }
  return Response.redirect(`${ORIGIN}/releases/${manifest.version}/${encodeURIComponent(file)}`, 302);
}
