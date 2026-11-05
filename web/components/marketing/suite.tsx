import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui";
import {
  LOGOS,
  LOGO_SIZES,
  LOGO_THEMES,
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
import { BannerGallery, CopyText } from "./client";
import "./marketing.css";

export const SECTIONS = [
  { id: "video", label: "Launch video" },
  { id: "logos", label: "Logos" },
  { id: "campaign", label: "Campaign" },
  { id: "banners", label: "Simple banners" },
  { id: "copy", label: "Copy" },
  { id: "creator", label: "Creator videos" },
] as const;

/**
 * The marketing suite, shared by the admin Marketing tab and the influencer
 * media kit. Read-only in both: everything links to public files. The admin
 * passes notes on adding creator videos and campaign creative in
 * `creatorNote` and `campaignNote`.
 */
export function MarketingSuite({
  videos,
  campaign = [],
  creatorNote,
  campaignNote,
}: {
  videos: CreatorVideo[];
  campaign?: CampaignAsset[];
  creatorNote?: ReactNode;
  campaignNote?: ReactNode;
}) {
  const concepts = groupCampaign(campaign);
  return (
    <div className="space-y-14">
      <Section id="video" title="Launch video" sub="The current cut, horizontal and vertical, as MP4, with posters for light and dark.">
        {launchVideos.length ? (
          <div className="grid items-start gap-4 md:grid-cols-[2.6fr_1fr]">
            {launchVideos.map((v) => (
              <div key={v.id} className="mk-card">
                <video
                  controls
                  playsInline
                  preload="none"
                  poster={v.poster?.light}
                  src={v.src}
                  className="block w-full bg-black"
                  style={{ aspectRatio: v.ratio }}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-3">
                  <div className="text-[13px]">{v.label}</div>
                  <div className="flex flex-wrap gap-1.5">
                    <a href={v.src} download={v.filename} className={buttonClass("primary", "sm")}>
                      Download MP4
                    </a>
                    {(["light", "dark"] as const).map((t) =>
                      v.poster?.[t] ? (
                        <a key={t} href={v.poster[t]} download={v.poster[t]!.split("/").pop()} className={buttonClass("glass", "sm")}>
                          Poster, {t}
                        </a>
                      ) : null,
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No launch video is published right now.</Empty>
        )}
      </Section>

      <Section
        id="logos"
        title="Logos"
        sub="Transparent backgrounds. “Light” is dark ink for light backgrounds; “Dark” is light ink for dark ones. Use SVG where you can."
        action={
          <a href={logosZip} download className={buttonClass("primary", "sm")}>
            Download all (.zip)
          </a>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          {LOGOS.map((logo) => (
            <div key={logo.id} className="mk-card">
              <div className="grid grid-cols-2">
                {LOGO_THEMES.map((t) => (
                  <div key={t.id} className={`flex h-36 items-center justify-center p-6 ${t.id === "light" ? "mk-swatch-light" : "mk-swatch-dark"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- the downloadable file itself */}
                    <img
                      src={logoSvg(logo.id, t.id) ?? logoPng(logo.id, t.id, 512)}
                      alt={`${logo.label}, ${t.label.toLowerCase()}`}
                      className={logo.aspect > 1 ? "h-auto w-[78%] max-w-[220px]" : "h-[88px] w-[88px]"}
                    />
                  </div>
                ))}
              </div>
              <div className="px-3.5 py-3">
                <div className="text-[13px] text-foreground">{logo.label}</div>
                <div className="text-[12px] text-muted">{logo.note}</div>
                <div className="mt-2.5 grid gap-1.5">
                  {LOGO_THEMES.map((t) => {
                    const svg = logoSvg(logo.id, t.id);
                    return (
                      <div key={t.id} className="flex flex-wrap items-center gap-1.5">
                        <span className="w-12 text-[12px] text-muted">{t.id === "light" ? "Light" : "Dark"}</span>
                        {svg ? (
                          <a href={svg} download={svg.split("/").pop()} className={buttonClass("glass", "sm", "!h-7 !px-2.5")}>
                            SVG
                          </a>
                        ) : null}
                        {LOGO_SIZES.map((s) => (
                          <a key={s} href={logoPng(logo.id, t.id, s)} download={logoPngName(logo.id, t.id, s)} className={buttonClass("glass", "sm", "!h-7 !px-2.5")}>
                            PNG {s}
                          </a>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="campaign" title="Campaign" sub="Real screen moments in the app's own UI, laid out for each platform: stories as MP4 and PNG, posts and banners as PNG.">
        {concepts.length ? (
          <div className="space-y-8">
            {concepts.map((c) => (
              <div key={c.id}>
                <div className="mb-3 flex items-baseline gap-2">
                  <h3 className="text-[15px] font-normal tracking-[-0.01em] text-foreground">{c.label}</h3>
                  <span className="text-[12px] text-muted">
                    {c.assets.length} file{c.assets.length === 1 ? "" : "s"} · {bytes(c.assets.reduce((n, a) => n + a.bytes, 0))}
                  </span>
                </div>
                <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {c.assets.map((a) => (
                    <div key={a.id} className="mk-card flex flex-col">
                      <div className="mk-preview relative overflow-hidden" style={{ aspectRatio: "4 / 3" }}>
                        {a.isVideo ? (
                          <video
                            controls
                            playsInline
                            muted
                            loop
                            preload={a.poster ? "none" : "metadata"}
                            poster={a.poster ?? undefined}
                            src={a.src}
                            className="absolute inset-0 h-full w-full object-contain"
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element -- the downloadable file itself
                          <img src={a.src} alt={a.title} loading="lazy" className="absolute inset-0 h-full w-full object-contain" />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col px-3 py-2.5">
                        <div className="text-[13px] text-foreground">
                          {a.formatLabel}
                          {a.isVideo ? ", MP4" : ""}
                        </div>
                        <div className="text-[12px] text-muted">
                          {[a.width && a.height ? `${a.width}×${a.height}` : null, a.theme === "dark" ? "Dark" : "Light", bytes(a.bytes)].filter(Boolean).join(" · ")}
                        </div>
                        <div className="mt-auto pt-2.5">
                          <a href={a.src} download={a.src.split("/").pop()} className={buttonClass("glass", "sm", "!h-7 !px-2.5")}>
                            Download {a.isVideo ? "MP4" : "PNG"}
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No campaign creative yet.</Empty>
        )}
        {campaignNote}
      </Section>

      <Section id="banners" title="Simple banners" sub="A headline on the brand backdrop, sized for each platform's safe area. Pick a headline and a theme.">
        <BannerGallery />
      </Section>

      <Section id="copy" title="Copy" sub="Approved words to use as they are, or to put in your own voice.">
        <div className="grid gap-4 lg:grid-cols-2">
          {copySnippets.map((group) => (
            <div key={group.title} className="mk-card p-4">
              <div className="text-[13px] font-medium text-foreground">{group.title}</div>
              <ul className="mt-2 divide-y divide-[color-mix(in_srgb,#8f8f8f_18%,transparent)]">
                {group.items.map((s) => (
                  <li key={s.label} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-[12px] text-muted">{s.label}</div>
                      <div className="mt-0.5 break-words text-[13.5px] leading-[1.5] text-foreground">{s.text}</div>
                    </div>
                    <CopyText value={s.text} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="mk-card p-4">
            <div className="text-[13px] font-medium text-foreground">Do</div>
            <ul className="mt-2 space-y-1.5 text-[13.5px] leading-[1.5]">
              {copyDos.map((d) => (
                <li key={d} className="flex gap-2">
                  <span aria-hidden className="text-muted">
                    +
                  </span>
                  {d}
                </li>
              ))}
            </ul>
          </div>
          <div className="mk-card p-4">
            <div className="text-[13px] font-medium text-foreground">Don&apos;t</div>
            <ul className="mt-2 space-y-1.5 text-[13.5px] leading-[1.5]">
              {copyDonts.map((d) => (
                <li key={d} className="flex gap-2">
                  <span aria-hidden className="text-muted">
                    –
                  </span>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section id="creator" title="Creator videos" sub="Clips, b-roll and screen recordings to cut with.">
        {creatorNote}
        {videos.length ? (
          <div className={`grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 ${creatorNote ? "mt-5" : ""}`}>
            {videos.map((v) => (
              <div key={v.id} className="mk-card flex flex-col">
                <div className="mk-preview relative overflow-hidden" style={{ aspectRatio: "16 / 10" }}>
                  {v.isVideo ? (
                    <video
                      controls
                      playsInline
                      preload={v.poster ? "none" : "metadata"}
                      poster={v.poster ?? undefined}
                      src={v.src}
                      className="absolute inset-0 h-full w-full object-contain"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- the downloadable file itself
                    <img src={v.src} alt={v.title} loading="lazy" className="absolute inset-0 h-full w-full object-contain" />
                  )}
                </div>
                <div className="flex flex-1 flex-col px-3.5 py-3">
                  <div className="text-[13px] text-foreground">{v.title}</div>
                  <div className="text-[12px] text-muted">
                    {[
                      KINDS.find((k) => k.id === v.kind)?.label,
                      ORIENTATIONS.find((o) => o.id === v.orientation)?.label,
                      v.durationS ? duration(v.durationS) : null,
                      bytes(v.bytes),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  {v.notes ? <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-[1.5] text-muted">{v.notes}</p> : null}
                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                    <a href={v.src} download={v.src.split("/").pop()} className={buttonClass("glass", "sm")}>
                      Download
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No creator videos yet.</Empty>
        )}
      </Section>
    </div>
  );
}

function Section({ id, title, sub, action, children }: { id: string; title: string; sub?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="mk-section">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-[720px]">
          <h2 className="text-[22px] font-light tracking-[-0.025em] text-foreground">{title}</h2>
          {sub ? <p className="mt-1 text-[13.5px] leading-[1.55] text-muted">{sub}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="mk-card px-4 py-6 text-center text-[13px] text-muted">{children}</div>;
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
