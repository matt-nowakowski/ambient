// Email tooling. Run from web/ with bun (reads .env.local automatically).
//
//   bun scripts/emails.ts render [dir]          every email → <dir>/<name>.html + .txt (default ./.emails)
//   bun scripts/emails.ts send <to> [name|all]  send sample(s) to one address, subject prefixed [Test]
//   bun scripts/emails.ts broadcast <name> [customers|newsletter]
//        create a Resend Broadcast DRAFT (never sends) for win-back / highlight-ask /
//        highlight-meetings; review and send it from resend.com → Broadcasts.
//
// Images point at the live site unless ASSET_BASE is set (render uses the
// local public/ folder so files open offline).
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createBroadcastDraft, resendConfigured, sendEmail } from "../lib/email/resend";
import { broadcasts, isSampleName, sampleNames, samples, type BroadcastName } from "../lib/email/templates";

const [cmd, ...args] = process.argv.slice(2);
const RESEND_UNSUB = "{{{RESEND_UNSUBSCRIBE_URL}}}";

async function main() {
  if (cmd === "render") {
    const dir = resolve(args[0] ?? ".emails");
    mkdirSync(dir, { recursive: true });
    const assetBase = process.env.ASSET_BASE ?? pathToFileURL(resolve(fileURLToPath(new URL(".", import.meta.url)), "../public")).href;
    for (const n of sampleNames) {
      const e = samples[n]({ assetBase });
      writeFileSync(`${dir}/${n}.html`, e.html);
      writeFileSync(`${dir}/${n}.txt`, `Subject: ${e.subject}\n\n${e.text}\n`);
      console.log(`${n.padEnd(22)} ${e.kind.padEnd(13)} ${e.subject}`);
    }
    console.log(`\n→ ${dir}`);
    return;
  }

  if (cmd === "send") {
    const [to, which = "all"] = args;
    if (!to?.includes("@")) throw new Error("usage: bun scripts/emails.ts send <to> [name|all]");
    if (!resendConfigured()) throw new Error("RESEND_API_KEY is not set (put it in .env.local)");
    const names = which === "all" ? sampleNames : isSampleName(which) ? [which] : [];
    if (!names.length) throw new Error(`unknown email "${which}". One of: ${sampleNames.join(", ")}`);
    for (const n of names) {
      const e = samples[n]({ assetBase: process.env.ASSET_BASE });
      const unsub = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://tryambient.ai"}/api/email/unsubscribe?t=sample`;
      const r = await sendEmail({ to, email: { ...e, subject: `[Test] ${e.subject}` }, unsubscribePostUrl: unsub, tags: { test: "1" } });
      console.log(`${n}: ${r.ok ? `sent ${r.data.id}` : `failed: ${r.error}`}`);
    }
    return;
  }

  if (cmd === "broadcast") {
    const [name, audience = "customers"] = args;
    if (!(name in broadcasts)) throw new Error(`usage: bun scripts/emails.ts broadcast <${Object.keys(broadcasts).join("|")}> [customers|newsletter]`);
    if (audience !== "customers" && audience !== "newsletter") throw new Error("audience must be customers or newsletter");
    const e = broadcasts[name as BroadcastName]({ audience, unsubscribeUrl: RESEND_UNSUB });
    const r = await createBroadcastDraft(audience, `${name} ${new Date().toISOString().slice(0, 7)}`, e);
    console.log(r.ok ? `Draft broadcast ${r.data.id} created. Review and send it at https://resend.com/broadcasts` : `failed: ${r.error}`);
    return;
  }

  console.log("usage: bun scripts/emails.ts render [dir] | send <to> [name|all] | broadcast <name> [customers|newsletter]");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
