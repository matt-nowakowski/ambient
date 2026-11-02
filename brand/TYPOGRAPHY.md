# Typography

The website is the source of truth (`web/app/globals.css`, `web/components/ui.tsx`,
`page-header.tsx`, the pages). The app, intro, emails and video follow it.

## Family

One family, the platform's own UI font. No webfonts outside the site, no monospace.

| Where | Stack |
| --- | --- |
| Site (`--font-sans`) | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", Geist (webfont), "Helvetica Neue", system-ui, sans-serif` |
| App UI (`--font-ui`) | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", "Inter Variable", "Geist", "Segoe UI Variable Text", "Segoe UI", "Helvetica Neue", system-ui, Roboto, "Noto Sans", sans-serif` |
| App display (`--font-display`), intro | same, with `"SF Pro Display"` / `"Segoe UI Variable Display"` first in their pair |
| App CJK | `"Ambient CJK Subset"` first (Windows/Linux), then the UI stack; macOS uses `--font-ui` |
| Email | `-apple-system, BlinkMacSystemFont, 'SF Pro Text' / 'SF Pro Display', Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif` |
| Video | `-apple-system, BlinkMacSystemFont, "SF Pro Text" / "SF Pro Display", "Inter", "Geist", "Helvetica Neue", system-ui, sans-serif` |

Result: SF Pro on Apple; Inter or Geist if installed; else Segoe UI (Windows) or the desktop
font (Linux). The site alone also ships Geist as a webfont, so on Windows/Linux the site shows
Geist while the app shows Segoe UI. That is the one intended difference: the app uses system fonts.

## Scale (site)

Sizes are `mobile / ≥640px`. Line-height `relaxed` = 1.625. All sentence case.

| Role | Size | Weight | Tracking | Line-height | Colour | Used for |
| --- | --- | --- | --- | --- | --- | --- |
| Display / hero | 46 / 76px | 200 | -0.05em | 1.02 | foreground | home H1 |
| H1 (page) | 42–44 / 60–64px | 200 | -0.05em | 1.04 | foreground | `PageHeader`, pricing, download |
| Display CTA | 38 / 56px | 200 | -0.045em | 1.05 | foreground | closing CTA |
| H2 (section) | 30 / 36–40px | 300 | -0.035em | 1.1 | foreground | `SectionHeading` |
| H2 small / card title | 30–32px | 300 | -0.04em | normal | foreground | checkout, confirm pages |
| H3 | 22–26px | 300 | -0.03em | normal | foreground | card headings, changelog |
| H3 small | 18–20px | 300 | -0.02 / -0.025em | normal | foreground | legal, docs |
| Lead (large) | 17px | 300 | -0.01em | 1.375 | foreground | pull lead |
| Title (item) | 15px | 400 | -0.01em | normal | foreground | feature/step titles |
| Lead / body | 15px | 400 | -0.006em | 1.625 | muted | intros, `sub`, body default |
| Body small | 13.5–14.5px | 400 | -0.006em | 1.625 | muted | card bodies, lists |
| Small | 13px | 400 | -0.006em | 1.625 | muted / subtle | footer links, notes |
| Button | 13px (`md`,`lg`), 12px (`sm`) | 500 | -0.005em | 1 | — | pills 40/44/32px tall |
| Eyebrow / label | 12px | 500 | -0.003em | 1.4 | muted | `.eyebrow`, column heads, H3 lists |
| Caption | 11.5–12px | 400 | -0.006em | normal | subtle | demo captions, legal lines |
| Micro label | 11px | 500 | +0.01em | normal | subtle | docs nav groups, chips |

Numbers (stats, prices): 200 weight, -0.05em, `tabular-nums`.

## Rules

1. **Weights: 200, 300, 400, 500. Nothing heavier.** `b`, `strong`, `th` are 500.
   - 200: display (≥38px) and big numbers.
   - 300: headings from 18px to 36px, and the 17px lead.
   - 400: body and item titles (14–15px).
   - 500: only small UI text (≤13px): eyebrows, labels, buttons, chips.
2. **Tracking gets tighter as size grows:** ≥38px -0.045/-0.05em · 26–36px -0.035/-0.04em ·
   20–24px -0.025/-0.03em · 15–18px -0.01em · 12–14px -0.003/-0.006em · ≤11px 0 to +0.01em.
3. **Eyebrow:** 12px / 500 / -0.003em / 1.4, sentence case, muted colour (an accent in email).
   12–16px above the heading. Never all caps; no wide tracking.
4. **Hierarchy:** eyebrow → heading (light) → body (15px muted). Headings are big and thin
   and never bold; emphasis comes from size and colour.
5. **Spacing:** eyebrow → heading 16px (`mt-4`); heading → body 16–20px; title → body 6px.
6. **No monospace**, even for `kbd`/`code` on the site.

## App mapping (`src/App.css`)

The app runs a 13px root. Weight tokens match Tailwind/the site: `font-extralight` 200,
`font-light` 300, `font-normal` 400, `font-medium` 500, and `font-semibold`/`font-bold` capped at 500.
Root tracking -0.006em.

| Token | Size / line | Weight | Tracking | Site role |
| --- | --- | --- | --- | --- |
| `text-display` | 28 / 34px | 200 | -0.035em | numbers |
| `text-greeting` | 24 / 30px | 300 | -0.03em | H3 |
| `text-title` | 22 / 28px | 300 | -0.03em | H3 (page titles) |
| `text-heading` | 15 / 21px | 400 | -0.01em | item title |
| `text-row` | 14.5px | 400 | -0.01em | item title |
| `text-cta` | 14px | 500 | root | button |
| `text-ui`, `text-body` | 13 / 19px | 400 (500 for row labels/buttons) | -0.006em | small / button |
| `text-small` | 12 / 17px | 400 (500 for sm buttons) | root | button sm / caption |
| `text-section` | 12 / 16px | 500 | -0.003em | eyebrow |
| `text-label`, `text-meta` | 11 / 15px | 400–500 | root | micro label |
| `text-tag` | 10px | 500 | root | chips |

Intro wordmark: 60px, 300, -0.04em, line-height 1. Logo wordmark: 400, -0.04em (as the site's `Wordmark`).

## Email (`web/lib/email/layout.ts`)

| Role | Size | Weight | Tracking | Line-height |
| --- | --- | --- | --- | --- |
| Headline (site H2) | 30px | 300 | -0.035em | 1.1 |
| Section title (site H3) | 22px | 300 | -0.03em | 1.25 |
| Sign-in email line | 24px | 300 | -0.03em | 30px |
| Lead (large) | 17px | 300 | -0.01em | 1.5 |
| Body | 15px | 400 | -0.006em | 1.625 |
| Item title (features, tips, callout) | 15px | 400 | -0.01em | 1.35–1.45 |
| Item body | 14–15px | 400 | inherit | 1.6 |
| Button | 13px | 500 | -0.005em | 1 (44px pill) |
| Links row | 13px | 500 | -0.005em | 1.6 |
| Eyebrow | 12px | 500 | -0.003em | 1.4 (accent colour) |
| Note | 13px | 400 | — | 1.6 |
| Footer | 12–13px | 400 | — | 1.6 |
| Wordmark | 24px | 300 | -0.04em | 1 |

## Video (`video/`, 1920×1080 and 1080×1920)

The site's scale multiplied for a 1080p frame (≈2.5× the 15px body). Family: `FONT` /
`FONT_DISPLAY` above.

| Role | 16:9 | 9:16 | Weight | Tracking | Line-height |
| --- | --- | --- | --- | --- | --- |
| Slam word (hero) | 260–280px | 210–240px | 200 | -0.05em | 1.02 |
| Headline (site H1) | 100–112px | 96–104px | 200 | -0.045em | 1.05 |
| Display line (site H2) | 64–80px | 64–72px | 300 | -0.035em | 1.08 |
| Lead / supporting line | 30–34px | 34–36px | 300 | -0.01em | 1.35 |
| Eyebrow / label | 24px | 26px | 500 | -0.003em | 1.4, muted, sentence case |
| Caption | 26px | 28px | 400 | -0.006em | 1.35 |
| Lockup wordmark | as set | as set | 300 | -0.04em | 1 |
| UI mock-ups (HUD, cards) | app scale: 13px text, 12px small, 11px meta | same | 400 text, 500 labels/buttons | -0.006em | app tokens |
