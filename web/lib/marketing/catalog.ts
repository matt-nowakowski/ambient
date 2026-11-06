// The marketing suite's fixed catalog: launch video files, logo files, banner
// formats and headlines, and approved copy. Shared by the admin Marketing tab
// (app/admin/marketing), the influencer media kit (app/kit/[token]) and the
// image routes under /api/brand, so every surface offers the same set.
//
// Banner and logo URLs only take ids from these lists, so the image routes
// render a finite set of images (no free text) and each one caches forever.
import { brand, freeMeetingsPerMonth, siteUrl } from "../brand";
import { launchVideo, platforms, type VideoPoster } from "../content";

/** Bump to re-render every cached logo, banner and the zip after a design change. */
export const ASSETS_VERSION = "1";

// ---------------------------------------------------------------------------
// Launch video
// ---------------------------------------------------------------------------

export type VideoFile = { id: string; label: string; src: string; poster?: VideoPoster; filename: string; ratio: string };

/** The current launch cut (lib/content.ts launchVideo), as downloadable files. */
export const launchVideos: VideoFile[] = launchVideo
  ? [
      {
        id: "horizontal",
        label: "Horizontal · 16:9",
        src: launchVideo.horizontal.url,
        poster: launchVideo.horizontal.poster,
        filename: launchVideo.horizontal.url.split("/").pop() ?? "launch.mp4",
        ratio: "16 / 9",
      },
      ...(launchVideo.vertical
        ? [
            {
              id: "vertical",
              label: "Vertical · 9:16",
              src: launchVideo.vertical.url,
              poster: launchVideo.vertical.poster,
              filename: launchVideo.vertical.url.split("/").pop() ?? "launch-vertical.mp4",
              ratio: "9 / 16",
            },
          ]
        : []),
    ]
  : [];

// ---------------------------------------------------------------------------
// Logos
// ---------------------------------------------------------------------------

export type LogoTheme = "light" | "dark";
export const LOGO_THEMES: { id: LogoTheme; label: string }[] = [
  { id: "light", label: "For light backgrounds" },
  { id: "dark", label: "For dark backgrounds" },
];

export const LOGOS = [
  { id: "mark", label: "Mark", note: "The orb on its own. Avatars, favicons, small spaces.", aspect: 1 },
  { id: "lockup", label: "Logo", note: "Mark and wordmark together. The default.", aspect: 490 / 133 },
  { id: "wordmark", label: "Wordmark", note: "The name alone, when the mark is already nearby.", aspect: 348.3 / 80.3 },
  { id: "icon", label: "App icon", note: "The mark on a rounded tile, as the app shows it.", aspect: 1 },
] as const;
export type LogoId = (typeof LOGOS)[number]["id"];

/** PNG widths, in pixels. */
export const LOGO_SIZES = [512, 1024, 2048] as const;
export type LogoSize = (typeof LOGO_SIZES)[number];

/** Static SVGs in public/brand (the app icon has no SVG: its tile is rendered). */
export const logoSvg = (id: LogoId, theme: LogoTheme) => (id === "icon" ? null : `/brand/ambient-${id}-${theme}.svg`);
export const logoPngName = (id: LogoId, theme: LogoTheme, size: LogoSize) => `ambient-${id}-${theme}-${size}.png`;
export const logoPng = (id: LogoId, theme: LogoTheme, size: LogoSize) => `/api/brand/logo/${logoPngName(id, theme, size)}?v=${ASSETS_VERSION}`;
export const logosZip = `/api/brand/zip?v=${ASSETS_VERSION}`;

export function parseLogoName(name: string): { id: LogoId; theme: LogoTheme; size: LogoSize } | null {
  const m = /^ambient-([a-z]+)-(light|dark)-(\d+)\.png$/.exec(name);
  if (!m) return null;
  const id = LOGOS.find((l) => l.id === m[1])?.id;
  const size = LOGO_SIZES.find((s) => s === Number(m[3]));
  return id && size ? { id, theme: m[2] as LogoTheme, size } : null;
}

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------

/**
 * `safe` is the box the content keeps to, as [left, top, right, bottom] insets
 * in pixels: platform crops and avatars (X and LinkedIn put the profile photo
 * bottom-left; YouTube only shows the middle of the channel art everywhere).
 */
export const BANNER_FORMATS = [
  { id: "ig-story", group: "Instagram", label: "Story", w: 1080, h: 1920, safe: [72, 260, 72, 340] },
  { id: "ig-post", group: "Instagram", label: "Post, square", w: 1080, h: 1080, safe: [64, 64, 64, 64] },
  { id: "ig-portrait", group: "Instagram", label: "Post, portrait", w: 1080, h: 1350, safe: [64, 64, 64, 64] },
  { id: "x-header", group: "X", label: "Header", w: 1500, h: 500, safe: [520, 60, 80, 60] },
  { id: "linkedin-banner", group: "LinkedIn", label: "Banner", w: 1584, h: 396, safe: [560, 48, 72, 48] },
  { id: "linkedin-post", group: "LinkedIn", label: "Post", w: 1200, h: 627, safe: [48, 48, 48, 48] },
  { id: "youtube-thumb", group: "YouTube", label: "Thumbnail", w: 1280, h: 720, safe: [56, 56, 56, 56] },
  { id: "youtube-banner", group: "YouTube", label: "Channel art", w: 2560, h: 1440, safe: [507, 508, 507, 508] },
  { id: "og", group: "Web", label: "Link preview (OG)", w: 1200, h: 630, safe: [48, 48, 48, 48] },
  { id: "web-hero", group: "Web", label: "Hero banner", w: 1920, h: 600, safe: [96, 64, 96, 64] },
  { id: "email", group: "Email", label: "Header", w: 600, h: 200, safe: [20, 20, 20, 20] },
  { id: "email-2x", group: "Email", label: "Header @2x", w: 1200, h: 400, safe: [40, 40, 40, 40] },
] as const;
export type BannerFormat = (typeof BANNER_FORMATS)[number];
export type BannerFormatId = BannerFormat["id"];

export const HEADLINES = [
  { id: "colleague", text: "Your desktop colleague." },
  { id: "talk", text: "You talk. It writes, answers and acts." },
  { id: "nudge", text: "It nudges you, like a colleague." },
  { id: "free", text: "Start free. Go unlimited." },
] as const;
export type HeadlineId = (typeof HEADLINES)[number]["id"];

export const bannerName = (f: BannerFormatId, h: HeadlineId, t: LogoTheme) => `ambient-${f}-${h}-${t}.png`;
export const bannerUrl = (f: BannerFormatId, h: HeadlineId, t: LogoTheme) => `/api/brand/banner/${bannerName(f, h, t)}?v=${ASSETS_VERSION}`;

export function parseBannerName(name: string): { format: BannerFormat; headline: (typeof HEADLINES)[number]; theme: LogoTheme } | null {
  const m = /^ambient-([a-z0-9-]+)-([a-z]+)-(light|dark)\.png$/.exec(name);
  if (!m) return null;
  const format = BANNER_FORMATS.find((f) => f.id === m[1]);
  const headline = HEADLINES.find((h) => h.id === m[2]);
  return format && headline ? { format, headline, theme: m[3] as LogoTheme } : null;
}

// ---------------------------------------------------------------------------
// Copy for creators
// ---------------------------------------------------------------------------

const domain = brand.domain;

export type Snippet = { label: string; text: string };

export const copySnippets: { title: string; items: Snippet[] }[] = [
  {
    title: "Taglines",
    items: [
      { label: "Tagline", text: `${brand.tagline}.` },
      { label: "One line", text: "A live agent on your desktop. You talk. It writes, answers and acts." },
      { label: "Nudges", text: "It nudges you, like a colleague." },
      { label: "Plans", text: "Start free. Go unlimited." },
    ],
  },
  {
    title: "Descriptions",
    items: [
      {
        label: "Short (≈ 25 words)",
        text: `${brand.name} is your desktop colleague: a live agent on your computer. You talk, and it writes, answers and acts. When it can help, it nudges you on screen.`,
      },
      {
        label: "Medium (≈ 60 words)",
        text: `${brand.name} is a live agent on your desktop, like a colleague. Hold a key and talk: it writes the message, answers the question or does the thing, in any app. It takes notes in your calls with no bot joining, remembers what you saw, and when it notices a moment it can help, it offers once on screen. Free on macOS, Windows and Linux.`,
      },
      {
        label: "Social bio",
        text: `${brand.tagline}. Talk, and it writes, answers and acts. Free for macOS, Windows and Linux. ${domain}`,
      },
    ],
  },
  {
    title: "Key facts",
    items: [
      { label: "Platforms", text: `${platforms.join(", ")}. The agent is in beta on Windows and Linux.` },
      {
        label: "Free plan",
        text: `Free includes every agent feature with weekly limits: ${brand.freePolishPerWeek} AI uses a week, ${brand.freeSuggestionsPerWeek} suggestions a week, ${freeMeetingsPerMonth} meetings a month and 24 hours of recall. Dictation is free and unlimited. No account needed.`,
      },
      {
        label: "Pro",
        text: `Pro removes the limits (fair use) for $${brand.pricing.proMonthly}/month, or $${brand.pricing.proYearlyPerMonth}/month billed yearly. New installs get a ${brand.trialDays}-day Pro trial, no card.`,
      },
      {
        label: "Privacy",
        text: "Speech recognition runs on your computer and your audio is never sent or stored. Passwords and crypto wallets are never read, secrets are removed before anything is sent, and every request is on the record in the app.",
      },
      { label: "Meetings", text: "Notes for any call (Zoom, Meet, Teams, FaceTime, Slack huddles). No bot joins. Audio is never saved." },
      { label: "Screen", text: "It reads the window you’re in to understand you, redacted, never private pages or never-watch apps. Text only, never screenshots. Turn it off in Privacy." },
    ],
  },
  {
    title: "Links",
    items: [
      { label: "Website", text: siteUrl },
      { label: "Download", text: `${siteUrl}/download` },
      { label: "Pricing", text: `${siteUrl}/pricing` },
      { label: "Privacy", text: `${siteUrl}/docs/privacy` },
    ],
  },
];

/** Say this / not that. Short, so creators actually read it. */
export const copyDos = [
  `Call it a desktop colleague, or a live agent on your desktop.`,
  "Say it writes, answers, acts and nudges you on screen.",
  "Say speech recognition runs on your computer.",
  "Say it's free to start, with a Pro plan for no limits.",
  `Write the name as “${brand.name}”, capital A; the logo is lowercase.`,
];
export const copyDonts = [
  "Don't say it speaks, talks back or has a voice. It never talks out loud; it answers on screen.",
  "Don't call it a meeting bot or say it joins calls. No bot joins; notes happen on your computer.",
  "Don't say it reads everything on your screen. It reads the window you’re in, redacted, never private pages or never-watch apps, and you can turn it off in Privacy.",
  "Don't promise features marked “soon”, like using your apps for you.",
  "Don't recolour, stretch or add effects to the logo. Use the light or dark file as given.",
];
