import { htmlResponse, previewGuard } from "@/lib/email/preview-guard";
import { isSampleName, samples } from "@/lib/email/templates";

/** One email with sample data. `?format=text` shows the plain-text part. */
export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const denied = await previewGuard();
  if (denied) return denied;
  const { name } = await ctx.params;
  if (!isSampleName(name)) return new Response("Not found", { status: 404 });
  const email = samples[name]({ assetBase: new URL(req.url).origin });
  if (new URL(req.url).searchParams.get("format") === "text") {
    return new Response(`Subject: ${email.subject}\n\n${email.text}`, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }
  return htmlResponse(email.html);
}
