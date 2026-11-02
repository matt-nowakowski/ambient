import { esc } from "@/lib/email/layout";
import { htmlResponse, previewGuard } from "@/lib/email/preview-guard";
import { sampleNames, samples } from "@/lib/email/templates";

/** Index of every email with sample data. Dev, or admin session in production. */
export async function GET() {
  const denied = await previewGuard();
  if (denied) return denied;
  const rows = sampleNames
    .map((n) => {
      const e = samples[n]({});
      return `<li><a href="/emails/preview/${n}">${esc(n)}</a> <small>${e.kind}</small><br><span>${esc(e.subject)}</span> · <a href="/emails/preview/${n}?format=text">text</a></li>`;
    })
    .join("");
  return htmlResponse(
    `<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="light dark"><title>Email previews</title><style>body{font:15px/1.6 -apple-system,system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 16px}li{margin:0 0 14px}small,span{color:#888}a{color:inherit}</style><h1 style="font-weight:300">Email previews</h1><ul>${rows}</ul>`,
  );
}
