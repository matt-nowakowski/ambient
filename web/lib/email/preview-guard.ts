import "server-only";
import { adminApiGuard } from "../admin/guard";

/** Email previews: open in development; in production only for a signed-in admin (else 404/401). */
export async function previewGuard(): Promise<Response | null> {
  if (process.env.NODE_ENV !== "production") return null;
  return adminApiGuard();
}

export const htmlResponse = (html: string) =>
  new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
