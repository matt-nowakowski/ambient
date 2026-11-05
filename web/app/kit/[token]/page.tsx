import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { MarketingSuite, SECTIONS } from "@/components/marketing/suite";
import { buttonClass } from "@/components/ui";
import { brand, emails, mailto, siteUrl } from "@/lib/brand";
import { kitTokenValid } from "@/lib/marketing/kit";
import { creatorVideos } from "@/lib/marketing/creator";

/**
 * The influencer media kit: /kit/<MEDIA_KIT_TOKEN>. Read-only, unlisted (no
 * links from the site, not in the sitemap), noindex, no-referrer and
 * no-store (next.config.ts headers). Wrong or unset token: a plain 404.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Media kit",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

export default async function MediaKitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!kitTokenValid(token)) notFound();
  const creator = await creatorVideos();

  return (
    <div data-kit-root className="mx-auto max-w-[1200px] px-4 pb-20 pt-6 sm:px-8 sm:pt-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo size="lg" />
          <span className="text-[13px] text-muted">Media kit</span>
        </div>
        <div className="flex gap-2">
          <a href={siteUrl} target="_blank" rel="noreferrer" className={buttonClass("glass", "sm")}>
            Website
          </a>
          <a href={`${siteUrl}/download`} target="_blank" rel="noreferrer" className={buttonClass("primary", "sm")}>
            Download {brand.name}
          </a>
        </div>
      </header>

      <div className="mt-10 max-w-[760px] sm:mt-14">
        <h1 className="text-[40px] font-extralight leading-[1.04] tracking-[-0.05em] text-foreground sm:text-[56px]">{brand.tagline}.</h1>
        <p className="mt-4 text-[15px] leading-[1.625] text-muted">
          Everything you need to make something about {brand.name}: the launch video, logos, ready-sized banners, approved copy and clips to cut with. Thanks for
          helping people meet it.
        </p>
      </div>

      <nav className="mk-nav sticky top-0 z-10 -mx-4 mt-8 flex gap-1 overflow-x-auto px-4 py-2 backdrop-blur-xl sm:mx-0 sm:px-0" aria-label="Sections">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className={buttonClass("glass", "sm", "flex-none")}>
            {s.label}
          </a>
        ))}
      </nav>

      <div className="mt-8">
        <MarketingSuite videos={creator.videos} />
      </div>

      <footer className="mt-16 border-t border-[color-mix(in_srgb,#8f8f8f_20%,transparent)] pt-6 text-[13px] text-muted">
        Questions, or need something else?{" "}
        <a href={mailto(`${brand.name} media kit`)} className="text-foreground underline underline-offset-2">
          {emails.hello}
        </a>
      </footer>
    </div>
  );
}
