import { launchMediaFiles } from "@/lib/marketing/catalog";
import { attachment, presign, r2Configured } from "@/lib/marketing/r2";

/**
 * /api/brand/video/<file>: downloads a launch video or poster as a file.
 * `<a download>` is ignored across origins and /media/* redirects to R2, so
 * this redirects to a short-lived presigned R2 URL whose response carries
 * Content-Disposition: attachment. The bytes come straight from R2, never
 * through this function. Without R2 keys it falls back to /media/<file>
 * (plays in the browser; save from there).
 */
export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!launchMediaFiles().includes(file)) return new Response("Not found", { status: 404 });
  const to = r2Configured()
    ? presign("GET", `media/${file}`, { expires: 3600, query: { "response-content-disposition": attachment(file) } })
    : new URL(`/media/${file}`, req.url).toString();
  return new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "private, no-store" } });
}
