import type { ReactNode } from "react";
import {
  BANNER_FORMATS,
  HEADLINES,
  LOGOS,
  LOGO_SIZES,
  bannerName,
  bannerUrl,
  copyDonts,
  copyDos,
  copySnippets,
  launchVideos,
  logoPng,
  logoPngName,
  logoSvg,
  logosZip,
} from "@/lib/marketing/catalog";
import { KINDS, ORIENTATIONS, groupCampaign, type CampaignAsset, type CreatorVideo } from "@/lib/marketing/creator";
import { MarketingBrowser, type Asset, type FileVariant, type Folder, type FolderId, type Preview, type Theme } from "./browser";
import "./marketing.css";

const THEMES: Theme[] = ["light", "dark"];
const fileName = (src: string) => src.split("?")[0].split("/").pop() ?? "download";

/**
 * The marketing suite, shared by the admin Marketing tab and the influencer
 * media kit: folders of assets, one card per asset. Read-only in both;
 * everything links to public files. The admin adds notes (how to upload)
 * under a folder with `notes`.
 */
export function MarketingSuite({ videos, campaign = [], notes }: { videos: CreatorVideo[]; campaign?: CampaignAsset[]; notes?: Partial<Record<FolderId, ReactNode>> }) {
  const folders: Folder[] = [
    {
      id: "videos",
      label: "Videos",
      sub: "The launch cut, horizontal and vertical, and clips, b-roll and screen recordings to cut with.",
      assets: [...launchAssets(), ...videos.map(creatorAsset)],
      empty: "No videos are published right now.",
    },
    {
      id: "campaign",
      label: "Campaign",
      sub: "Real screen moments in the app's own UI, one concept per card, laid out for each platform: the story as MP4 and PNG, posts and banners as PNG.",
      assets: groupCampaign(campaign).map(campaignAsset),
      empty: "No campaign creative yet.",
    },
    {
      id: "logos",
      label: "Logos",
      sub: "Transparent backgrounds: the Light theme is dark ink for light backgrounds, Dark is light ink for dark ones. Use SVG where you can.",
      assets: LOGOS.map(logoAsset),
      empty: "",
      action: { label: "All logos (.zip)", href: logosZip },
    },
    {
      id: "banners",
      label: "Simple banners",
      sub: "A headline on the brand backdrop, in every platform's size and safe area.",
      assets: HEADLINES.map(bannerAsset),
      empty: "",
    },
  ];
  return <MarketingBrowser folders={folders} copy={copySnippets} dos={copyDos} donts={copyDonts} notes={notes} />;
}

function launchAssets(): Asset[] {
  if (!launchVideos.length) return [];
  const main = launchVideos[0];
  const files: FileVariant[] = launchVideos.map((v) => ({ key: `mp4-${v.id}`, label: v.label, href: v.src, filename: v.filename, section: "Video" }));
  for (const v of launchVideos)
    for (const t of THEMES) {
      const p = v.poster?.[t];
      if (p) files.push({ key: `poster-${v.id}`, theme: t, label: `Poster, ${v.id}`, meta: t, href: p, filename: fileName(p), section: "Poster" });
    }
  return [
    {
      id: "launch",
      name: "Launch video",
      note: launchVideos.map((v) => v.label).join(" and "),
      previews: THEMES.map((t) => ({ kind: "video", src: main.src, poster: main.poster?.[t] ?? main.poster?.light, theme: t })),
      files,
    },
  ];
}

function creatorAsset(v: CreatorVideo): Asset {
  const files: FileVariant[] = [{ key: "file", label: v.isVideo ? "Video" : "Image", meta: bytes(v.bytes), href: v.src, filename: fileName(v.src) }];
  if (v.poster) files.push({ key: "poster", label: "Poster", href: v.poster, filename: fileName(v.poster) });
  return {
    id: `creator-${v.id}`,
    name: v.title,
    note:
      [KINDS.find((k) => k.id === v.kind)?.label, ORIENTATIONS.find((o) => o.id === v.orientation)?.label, v.durationS ? duration(v.durationS) : null]
        .filter(Boolean)
        .join(" · ") + (v.notes ? `. ${v.notes}` : ""),
    previews: [v.isVideo ? { kind: "video", src: v.src, poster: v.poster ?? undefined } : { kind: "image", src: v.src }],
    files,
  };
}

function campaignAsset(group: ReturnType<typeof groupCampaign>[number]): Asset {
  const stills = group.assets.filter((a) => !a.isVideo);
  // The feed post shows a concept best (big UI, room for the line); then the story.
  const shown = ["feed", "story", ...new Set(stills.map((a) => a.format))].find((f) => stills.some((a) => a.format === f));
  const previews: Preview[] = stills
    .filter((a) => a.format === shown)
    .map((a) => ({ kind: "image", src: a.src, theme: a.theme, lang: a.lang }));
  if (!previews.length) previews.push(...group.assets.map((a): Preview => ({ kind: "video", src: a.src, poster: a.poster ?? undefined, theme: a.theme, lang: a.lang })));
  const formats = new Set(group.assets.map((a) => a.format)).size;
  const hasVideo = group.assets.some((a) => a.isVideo);
  return {
    id: `campaign-${group.id}`,
    name: group.label,
    note: [hasVideo ? "Story video" : null, `${formats} format${formats === 1 ? "" : "s"}`].filter(Boolean).join(" · "),
    previews,
    files: group.assets.map((a) => ({
      key: `${a.format}-${a.isVideo ? "mp4" : "png"}`,
      theme: a.theme,
      lang: a.lang,
      label: `${a.formatLabel}${a.isVideo ? ", MP4" : ""}`,
      meta: [a.width && a.height ? `${a.width}×${a.height}` : null, bytes(a.bytes)].filter(Boolean).join(" · "),
      href: a.src,
      filename: fileName(a.src),
      section: a.isVideo ? "Video" : "PNG",
    })),
  };
}

function logoAsset(logo: (typeof LOGOS)[number]): Asset {
  const files: FileVariant[] = [];
  for (const t of THEMES) {
    const svg = logoSvg(logo.id, t);
    if (svg) files.push({ key: "svg", theme: t, label: "SVG", meta: "vector", href: svg, filename: fileName(svg), section: "Vector" });
  }
  for (const s of LOGO_SIZES)
    for (const t of THEMES) files.push({ key: `png-${s}`, theme: t, label: `PNG ${s}`, meta: `${s} px wide`, href: logoPng(logo.id, t, s), filename: logoPngName(logo.id, t, s), section: "PNG" });
  return {
    id: `logo-${logo.id}`,
    name: logo.label,
    note: logo.note,
    previews: THEMES.map((t) => ({ kind: "image", src: logoSvg(logo.id, t) ?? logoPng(logo.id, t, 512), theme: t, swatch: true })),
    files,
  };
}

function bannerAsset(h: (typeof HEADLINES)[number]): Asset {
  return {
    id: `banner-${h.id}`,
    name: h.text,
    note: `${BANNER_FORMATS.length} sizes for Instagram, X, LinkedIn, YouTube, the web and email`,
    previews: THEMES.map((t) => ({ kind: "image", src: bannerUrl("linkedin-post", h.id, t), theme: t })),
    files: BANNER_FORMATS.flatMap((f) =>
      THEMES.map((t) => ({ key: f.id, theme: t, label: `${f.group} · ${f.label}`, meta: `${f.w}×${f.h}`, href: bannerUrl(f.id, h.id, t), filename: bannerName(f.id, h.id, t), section: f.group })),
    ),
  };
}

export function bytes(n: number) {
  if (n <= 0) return "0 MB";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(n / 1e3))} KB`;
}

function duration(s: number) {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
