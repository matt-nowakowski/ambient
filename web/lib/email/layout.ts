// The Ambient email shell. Plain template literals (no React, no new deps) so
// the same code renders in route handlers, `after()` callbacks and bun scripts.
//
// Anatomy (top to bottom): the app's lockup (intro orb + light wordmark, scaled
// from src/intro: dot 17 / half-pitch 14 / gap 18 / wordmark 60) and a quiet label; a card
// that opens with a full-bleed aurora hero (per email), an eyebrow in the
// accent, a large light headline, then blocks (paragraphs, the app-style
// sign-in card, icon feature rows, one primary button, secondary links); the
// sign-off; a footer with the mark, site links, address and, for marketing,
// unsubscribe.
//
// Email-client rules this follows on purpose:
// - table layout, 600px max, every style inline; the <style> block only adds
//   dark mode, the dark orb swap, one Apple Mail fade-in and mobile padding.
// - images are artwork only (hero, icons, mark), all 2x, with alt text and a
//   solid bgcolor behind them, so the email reads fine with images off.
//   Heroes are dark aurora on purpose: they look the same in light and dark.
// - real text, no tracking pixels, no click-tracking redirects.
// - every email also has a plain-text part, built from the same blocks.
import { brand, company, emails, siteUrl } from "../brand";

/** Inline text: plain, bold, or a link. */
export type Seg = string | { b: string } | { href: string; label: string };
export type Rich = Seg | Seg[];

export type IconName = "key" | "sparkle" | "mic" | "ask" | "wave" | "calendar" | "shield" | "refresh" | "heart" | "download" | "mail" | "book";
export type HeroName = "welcome" | "plan" | "cancel" | "ended" | "confirm" | "winback" | "ask" | "meetings" | "note";

export type Block =
  | { t: "h"; text: string }
  | { t: "p"; text: Rich; size?: "lead" }
  | { t: "button"; href: string; label: string }
  /** The app's license card (LicenseCard.tsx), static: who signs in, plan, renewal. */
  | { t: "signin"; email: string; plan: string; renews?: string }
  /** A one-time code, large and spaced. */
  | { t: "code"; code: string }
  | { t: "steps"; title?: string; items: Rich[] }
  /** Icon + title + text rows. */
  | { t: "features"; title?: string; items: { icon: IconName; k: string; v: Rich }[] }
  | { t: "tips"; title?: string; items: { k: string; v: Rich }[] }
  /** A soft callout box. */
  | { t: "callout"; icon?: IconName; k: string; v: Rich }
  | { t: "links"; items: { href: string; label: string }[] }
  | { t: "note"; text: Rich }
  | { t: "rule" }
  /** Sign-off; `line` overrides the role under the name. */
  | { t: "sign"; line?: string };

export type EmailKind = "transactional" | "marketing";

export type Rendered = {
  subject: string;
  html: string;
  text: string;
  kind: EmailKind;
  /** Resend tag value (category), [a-z0-9_-] only. */
  category: string;
};

export type ShellOptions = {
  subject: string;
  /** Inbox preview line, hidden in the body. */
  preheader: string;
  /** Which banner opens the card (light and dark variants); none for short emails. */
  hero?: HeroName;
  /** Accent label above the headline, e.g. "Ambient Pro". */
  eyebrow: string;
  blocks: Block[];
  kind: EmailKind;
  category: string;
  /** Why this person got this email (footer). */
  reason: string;
  /** Marketing only: where "Unsubscribe" goes. */
  unsubscribeUrl?: string;
  /** Base URL for images; defaults to the site. "" makes them relative (previews). */
  assetBase?: string;
};

/** The sign-off on every email. A person, because replies reach one. */
export const signoff = { name: "Matt", line: `Cofounder, ${brand.name}` } as const;

/** The site's stack (app/globals.css --font-sans) in email-safe form: SF Pro on Apple
 *  clients, Inter if installed, then Segoe UI / Roboto / Helvetica / Arial. No webfonts.
 *  Scale and weights follow brand/TYPOGRAPHY.md: headings 300, body 400, labels and
 *  buttons 500, never heavier. */
const FONT = `-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
const DISPLAY = `-apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
/** One accent: the periwinkle of the site's backdrop light, deepened for text contrast. */
const C = {
  page: "#f5f5f7",
  card: "#ffffff",
  ink: "#0a0a0a",
  muted: "#55555b",
  subtle: "#8b8b92",
  hair: "#e7e7ec",
  well: "#f6f6f9",
  accent: "#4f5fb0",
  accentWash: "#eef0fa",
  night: "#0e0e14",
} as const;

export function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const segs = (r: Rich): Seg[] => (Array.isArray(r) ? r : [r]);

function richHtml(r: Rich) {
  return segs(r)
    .map((s) => {
      if (typeof s === "string") return esc(s);
      if ("b" in s) return `<strong class="ink" style="font-weight:500;color:${C.ink};">${esc(s.b)}</strong>`;
      return `<a href="${esc(s.href)}" class="link" style="color:${C.accent};text-decoration:underline;text-decoration-color:#c5cbeb;text-underline-offset:3px;">${esc(s.label)}</a>`;
    })
    .join("");
}

function richText(r: Rich) {
  return segs(r)
    .map((s) => (typeof s === "string" ? s : "b" in s ? s.b : `${s.label} (${s.href})`))
    .join("");
}

type Ctx = { asset: string };

const P = `margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.625;font-weight:400;letter-spacing:-0.006em;color:${C.muted};`;
const sectionTitle = (t?: string) =>
  t ? `<p class="ink" style="margin:10px 0 14px;font-family:${DISPLAY};font-size:22px;line-height:1.25;font-weight:300;letter-spacing:-0.03em;color:${C.ink};">${esc(t)}</p>` : "";

/** One icon style everywhere: a 34px quiet glass tile with a lucide glyph (scripts/email-icons.mjs). */
const ICON = 34;
const iconImg = (ctx: Ctx, name: IconName) => swap(ctx, `icon-${name}`, ICON, "", 9, "", false);

/** A light-scheme image with its dark twin, swapped by prefers-color-scheme (as the heroes are). */
const swap = (ctx: Ctx, base: string, size: number, alt: string, radius: number, extra = "", solid = true) => {
  // Solid tiles (the mark) get a matching background so nothing flashes while
  // images load; the icon tiles are near-transparent glass and must not.
  const img = (cls: string, file: string, bg: string) =>
    `<img${cls ? ` class="${cls}"` : ""} src="${ctx.asset}/email/${file}.png" width="${size}" height="${size}" alt="${esc(alt)}" style="display:block;width:${size}px;height:${size}px;border:0;border-radius:${radius}px;${solid ? `background:${bg};` : ""}${extra}">`;
  return `${img("orb-light", base, C.well)}<div class="orb-dark">${img("", `${base}-dark`, C.night)}</div>`;
};

function blockHtml(b: Block, ctx: Ctx): string {
  switch (b.t) {
    case "h":
      return `<h1 class="ink rise" style="margin:0 0 16px;font-family:${DISPLAY};font-size:30px;line-height:1.1;font-weight:300;letter-spacing:-0.035em;color:${C.ink};">${esc(b.text)}</h1>`;
    case "p":
      return b.size === "lead"
        ? `<p class="ink2" style="margin:0 0 24px;font-family:${FONT};font-size:17px;line-height:1.5;font-weight:300;letter-spacing:-0.01em;color:#2c2c31;">${richHtml(b.text)}</p>`
        : `<p class="muted" style="${P}">${richHtml(b.text)}</p>`;
    case "button":
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 28px;"><tr><td class="btn" bgcolor="${C.ink}" style="border-radius:999px;background:${C.ink};box-shadow:0 1px 2px rgba(0,0,0,0.12);">
<a href="${esc(b.href)}" class="btn-text" style="display:inline-block;padding:15px 24px;font-family:${FONT};font-size:13px;line-height:1;font-weight:500;letter-spacing:-0.005em;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(b.label)} &rarr;</a>
</td></tr></table>`;
    case "signin": {
      // Mirrors the app's card: glass-strong face (frosted, faint foil, glare),
      // 16px radius, hairline rim, orb top-left, a meta label and a
      // light display line, holder/renewal row at the bottom.
      const meta = (t: string) => `<div class="subtle" style="font-family:${FONT};font-size:11px;line-height:15px;font-weight:400;color:#8f8f8f;">${esc(t)}</div>`;
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 28px;border-collapse:separate;"><tr>
<td class="lic" bgcolor="#ffffff" background="${ctx.asset}/email/card.jpg" style="background-color:#ffffff;background-image:url('${ctx.asset}/email/card.jpg');background-size:cover;background-position:top left;border:1px solid #e9e9ee;border-radius:16px;padding:22px 24px 22px;box-shadow:0 12px 40px -12px rgba(0,0,0,0.22),0 2px 6px rgba(0,0,0,0.05);">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="font-family:${FONT};font-size:13px;line-height:19px;"><img class="orb-light" src="${ctx.asset}/email/orb.png" width="16" height="16" alt="" style="display:inline-block;width:16px;height:16px;border:0;vertical-align:-3px;"><span class="orb-dark"><img src="${ctx.asset}/email/orb-dark.png" width="16" height="16" alt="" style="display:inline-block;width:16px;height:16px;border:0;vertical-align:-3px;"></span></td>
<td valign="middle" align="right">${meta("Account")}</td>
</tr></table>
<div style="height:34px;line-height:34px;font-size:0;">&nbsp;</div>
${meta("Sign in with")}
<div class="ink" style="font-family:${DISPLAY};font-size:24px;line-height:30px;font-weight:300;letter-spacing:-0.03em;color:${C.ink};margin:2px 0 0;word-break:break-all;">${esc(b.email)}</div>
<div style="height:28px;line-height:28px;font-size:0;">&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="bottom">${meta("Plan")}<div class="ink" style="font-family:${FONT};font-size:12px;line-height:17px;color:${C.ink};">${esc(b.plan)}</div></td>
${b.renews ? `<td valign="bottom" align="right">${meta("Renews")}<div class="ink" style="font-family:${FONT};font-size:12px;line-height:17px;color:${C.ink};">${esc(b.renews)}</div></td>` : ""}
</tr></table>
</td></tr></table>`;
    }
    case "code":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 24px;border-collapse:separate;"><tr>
<td class="lic" align="center" bgcolor="#ffffff" background="${ctx.asset}/email/card.jpg" style="background-color:#ffffff;background-image:url('${ctx.asset}/email/card.jpg');background-size:cover;border:1px solid #e9e9ee;border-radius:16px;padding:26px 16px;box-shadow:0 12px 40px -12px rgba(0,0,0,0.18),0 2px 6px rgba(0,0,0,0.04);">
<div class="ink" style="font-family:${DISPLAY};font-size:42px;line-height:48px;font-weight:300;letter-spacing:0.32em;padding-left:0.32em;color:${C.ink};-webkit-user-select:all;user-select:all;font-variant-numeric:tabular-nums;">${esc(b.code)}</div>
</td></tr></table>`;
    case "steps":
      return `${sectionTitle(b.title)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">${b.items
        .map(
          (it, i) => `<tr>
<td valign="top" style="width:38px;padding:0 0 12px;"><div class="step" style="width:26px;height:26px;border-radius:13px;background:${C.accentWash};color:${C.accent};font-family:${FONT};font-size:13px;line-height:26px;font-weight:500;text-align:center;">${i + 1}</div></td>
<td valign="top" class="muted" style="padding:3px 0 12px;font-family:${FONT};font-size:15px;line-height:1.5;color:${C.muted};">${richHtml(it)}</td>
</tr>`,
        )
        .join("")}</table>`;
    case "features":
      return `${sectionTitle(b.title)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">${b.items
        .map(
          (it) => `<tr>
<td valign="top" style="width:50px;padding:0 0 22px;">${iconImg(ctx, it.icon)}</td>
<td valign="top" style="padding:0 0 22px;">
<div class="ink" style="font-family:${FONT};font-size:15px;line-height:1.35;font-weight:400;letter-spacing:-0.01em;color:${C.ink};margin:1px 0 3px;">${esc(it.k)}</div>
<div class="muted" style="font-family:${FONT};font-size:14px;line-height:1.625;color:${C.muted};">${richHtml(it.v)}</div>
</td></tr>`,
        )
        .join("")}</table>`;
    case "tips":
      return `${sectionTitle(b.title)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">${b.items
        .map(
          (it) => `<tr><td class="hair" style="padding:14px 0;border-top:1px solid ${C.hair};">
<div class="ink" style="font-family:${FONT};font-size:15px;line-height:1.45;font-weight:400;letter-spacing:-0.01em;color:${C.ink};margin:0 0 4px;">${esc(it.k)}</div>
<div class="muted" style="font-family:${FONT};font-size:15px;line-height:1.6;color:${C.muted};">${richHtml(it.v)}</div>
</td></tr>`,
        )
        .join("")}</table>`;
    case "callout":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 26px;"><tr><td class="well" bgcolor="${C.accentWash}" style="background:${C.accentWash};border-radius:16px;padding:18px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
${b.icon ? `<td valign="top" style="width:50px;">${iconImg(ctx, b.icon)}</td>` : ""}
<td valign="top">
<div class="ink" style="font-family:${FONT};font-size:15px;line-height:1.4;font-weight:400;letter-spacing:-0.01em;color:${C.ink};margin:0 0 4px;">${esc(b.k)}</div>
<div class="muted" style="font-family:${FONT};font-size:15px;line-height:1.6;color:${C.muted};">${richHtml(b.v)}</div>
</td></tr></table>
</td></tr></table>`;
    case "links":
      return `<p style="margin:-10px 0 26px;font-family:${FONT};font-size:13px;line-height:1.6;letter-spacing:-0.005em;">${b.items
        .map((l) => `<a href="${esc(l.href)}" class="link" style="color:${C.accent};text-decoration:none;font-weight:500;">${esc(l.label)}</a>`)
        .join(`<span class="subtle" style="color:${C.subtle};">&nbsp;&nbsp;·&nbsp;&nbsp;</span>`)}</p>`;
    case "note":
      return `<p class="subtle" style="margin:0 0 16px;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.subtle};">${richHtml(b.text)}</p>`;
    case "rule":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 26px;"><tr><td class="hair" style="border-top:1px solid ${C.hair};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>`;
    case "sign":
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;"><tr>
<td valign="middle" style="font-family:${FONT};font-size:15px;line-height:1.35;"><span class="ink" style="color:${C.ink};font-weight:500;">${esc(signoff.name)}</span><br><span class="subtle" style="color:${C.subtle};font-size:13px;">${esc(b.line ?? signoff.line)}</span></td>
</tr></table>`;
  }
}

function blockText(b: Block): string {
  switch (b.t) {
    case "h":
      return b.text;
    case "p":
    case "note":
      return richText(b.text);
    case "button":
      return `${b.label}: ${b.href}`;
    case "signin":
      return `Sign in with: ${b.email}\nPlan: ${b.plan}${b.renews ? `\nRenews: ${b.renews}` : ""}`;
    case "code":
      return `    ${b.code}`;
    case "steps":
      return `${b.title ? `${b.title}\n\n` : ""}${b.items.map((it, i) => `${i + 1}. ${richText(it)}`).join("\n")}`;
    case "features":
    case "tips":
      return `${b.title ? `${b.title}\n\n` : ""}${b.items.map((it) => `- ${it.k}\n  ${richText(it.v)}`).join("\n\n")}`;
    case "callout":
      return `${b.k}\n${richText(b.v)}`;
    case "links":
      return b.items.map((l) => `${l.label}: ${l.href}`).join("\n");
    case "rule":
      return "---";
    case "sign":
      return `${signoff.name}\n${b.line ?? signoff.line}`;
  }
}

const darkCss = (asset: string) => `
:root{color-scheme:light dark;supported-color-schemes:light dark;}
.orb-dark{display:none;max-height:0;overflow:hidden;mso-hide:all;}
span.orb-dark{display:none;}
@media (prefers-color-scheme: dark){
  .page{background:#0b0b0d !important;}
  .card{background:#141418 !important;border-color:#25252c !important;}
  .ink{color:#f0f0f2 !important;}
  .ink2{color:#d6d6db !important;}
  .muted{color:#a9a9b1 !important;}
  .subtle{color:#7a7a83 !important;}
  .hair{border-color:#25252c !important;}
  .well{background:#1b1d29 !important;}
  .link{color:#a9b5f0 !important;}
  .eyebrow{color:#a9b5f0 !important;}
  .step{background:#1f2235 !important;color:#a9b5f0 !important;}
  .btn{background:#f0f0f2 !important;}
  .btn-text{color:#0a0a0a !important;}
  .lic{background-color:#242428 !important;background-image:url('${asset}/email/card-dark.jpg') !important;border-color:#2f2f36 !important;box-shadow:0 16px 48px -12px rgba(0,0,0,0.75) !important;}
  .hero-cell{background:#0b0b0d !important;}
  .orb-light{display:none !important;}
  .orb-dark{display:block !important;max-height:none !important;overflow:visible !important;}
  span.orb-dark{display:inline !important;}
}
[data-ogsc] .page{background:#0b0b0d !important;}
[data-ogsc] .card{background:#141418 !important;}
[data-ogsc] .ink{color:#f0f0f2 !important;}
[data-ogsc] .lic,[data-ogsb] .lic{background-color:#242428 !important;background-image:url('${asset}/email/card-dark.jpg') !important;border-color:#2f2f36 !important;}
[data-ogsc] .muted{color:#a9a9b1 !important;}
[data-ogsc] .link,[data-ogsc] .eyebrow{color:#a9b5f0 !important;}
[data-ogsc] .btn-text{color:#0a0a0a !important;}
[data-ogsb] .btn{background:#f0f0f2 !important;}
@media (prefers-reduced-motion: no-preference){
  .rise{animation:rise .8s cubic-bezier(.2,.7,.2,1) both;}
  .hero-img{animation:fade 1.1s ease both;}
  @keyframes rise{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
  @keyframes fade{from{opacity:.4;}to{opacity:1;}}
}
@media (max-width:620px){
  .card-pad{padding:30px 22px 26px !important;}
  .hero-img{height:auto !important;}
}
a{color:inherit;}
`;

export function renderEmail(o: ShellOptions): Rendered {
  const asset = (o.assetBase ?? siteUrl).replace(/\/$/, "");
  const ctx: Ctx = { asset };
  const body = o.blocks.map((b) => blockHtml(b, ctx)).join("\n");
  const site = siteUrl.replace(/^https?:\/\//, "");
  const link = (path: string, label: string) =>
    `<a href="${siteUrl}${path}" class="subtle" style="color:${C.subtle};text-decoration:none;">${label}</a>`;
  const dot = `<span class="subtle" style="color:#c2c2c8;">&nbsp;&nbsp;·&nbsp;&nbsp;</span>`;

  const orb = (cls: string, file: string) =>
    `<img class="${cls}" src="${asset}/email/${file}" width="20" height="20" alt="${esc(brand.name)}" style="display:block;width:20px;height:20px;border:0;outline:none;">`;
  const heroImg = (cls: string, file: string) =>
    `<img class="hero-img ${cls}" src="${asset}/email/${file}" width="600" height="240" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:23px 23px 0 0;">`;

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(o.subject)}</title>
<style>${darkCss(asset)}</style>
</head>
<body class="page" style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(o.preheader)}${"&nbsp;&zwnj;".repeat(40)}</div>
<table role="presentation" class="page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page};">
<tr><td align="center" style="padding:32px 12px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
<tr><td style="padding:0 6px 18px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="width:20px;">${orb("orb-light", "orb.png")}<div class="orb-dark">${orb("", "orb-dark.png")}</div></td>
<td valign="middle" class="ink" style="padding-left:8px;font-family:${DISPLAY};font-size:24px;line-height:24px;font-weight:300;letter-spacing:-0.04em;color:${C.ink};">${esc(brand.slug)}</td>
<td valign="middle" align="right" style="font-family:${FONT};font-size:13px;"><a href="${siteUrl}" class="subtle" style="color:${C.subtle};text-decoration:none;">${esc(site)}</a></td>
</tr></table>
</td></tr>
<tr><td class="card hair" bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.hair};border-radius:24px;overflow:hidden;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${o.hero ? `<tr><td class="hero-cell" bgcolor="${C.page}" style="background:${C.page};border-radius:23px 23px 0 0;line-height:0;font-size:0;">
${heroImg("orb-light", `hero-${o.hero}.jpg`)}<div class="orb-dark">${heroImg("", `hero-${o.hero}-dark.jpg`)}</div>
</td></tr>` : ""}
<tr><td class="card-pad" style="padding:${o.hero ? "38px" : "40px"} 44px 34px;">
<p class="eyebrow" style="margin:0 0 14px;font-family:${FONT};font-size:12px;line-height:1.4;font-weight:500;letter-spacing:-0.003em;color:${C.accent};">${esc(o.eyebrow)}</p>
${body}
</td></tr>
</table>
</td></tr>
<tr><td align="center" style="padding:30px 18px 0;">
<p style="margin:0 0 12px;font-family:${FONT};font-size:13px;line-height:1.6;">${link("/download", "Download")}${dot}${link("/docs/getting-started", "Guide")}${dot}${link("/changelog", "What’s new")}${dot}${link("/privacy", "Privacy")}</p>
<p class="subtle" style="margin:0 0 6px;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.subtle};">${esc(o.reason)} Reply and it reaches a person.</p>
<p class="subtle" style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.subtle};">${o.kind === "marketing" && o.unsubscribeUrl ? `<a href="${esc(o.unsubscribeUrl)}" class="subtle" style="color:${C.subtle};text-decoration:underline;">Unsubscribe</a>${dot}` : ""}${esc(company.legalName)}, Dubai, UAE${dot}<a href="${siteUrl}" class="subtle" style="color:${C.subtle};text-decoration:none;">${esc(site)}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    o.eyebrow,
    o.blocks.map(blockText).join("\n\n"),
    "--",
    `${o.reason} Reply to this email and it reaches a person (${emails.hello}).`,
    o.kind === "marketing" && o.unsubscribeUrl ? `Unsubscribe: ${o.unsubscribeUrl}` : "",
    `${brand.name} · ${site} · ${company.legalName}, Dubai, UAE`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject: o.subject, html, text, kind: o.kind, category: o.category };
}
