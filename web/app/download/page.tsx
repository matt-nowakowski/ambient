import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { DownloadIcon, DownloadPicker } from "@/components/download-picker";
import { RevealLines } from "@/components/hero-copy";
import { Mark } from "@/components/logo";
import { LiftCard, Reveal, Stagger } from "@/components/motion";
import { Container, Eyebrow, Kbd } from "@/components/ui";
import { brand } from "@/lib/brand";
import { RELEASE_VERSION, defaultShortcut, osLabel, releasesByOS, releasesPage, type OS } from "@/lib/releases";

export const metadata: Metadata = pageMetadata({
  title: "Download",
  description: `Download ${brand.name} ${RELEASE_VERSION} for macOS (Apple Silicon, Intel), Windows (x64, ARM64) and Linux (AppImage, .deb, .rpm).`,
  path: "/download",
});

const ORDER: OS[] = ["mac", "windows", "linux"];

export default function DownloadPage() {
  return (
    <>
      <Container className="pt-14 sm:pt-20">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <Reveal>
            <Mark size={64} />
          </Reveal>
          <Eyebrow className="mt-8">Version {RELEASE_VERSION}</Eyebrow>
          <h1 className="mt-4 text-balance text-[44px] font-extralight leading-[1.04] tracking-[-0.05em] sm:text-[64px]">
            <RevealLines lines={[`Download ${brand.name}`]} />
          </h1>
          <Reveal delay={0.15}>
            <p className="mt-5 text-[15px] text-muted">Free to use. Pro unlocks when you sign in — no reinstall.</p>
          </Reveal>
          <Reveal delay={0.25} className="mt-10 w-full">
            <DownloadPicker />
          </Reveal>
        </div>
      </Container>

      <section aria-labelledby="all-downloads">
        <Container className="pt-20 sm:pt-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Every platform</Eyebrow>
              <h2 id="all-downloads" className="mt-4 text-[30px] font-light tracking-[-0.035em] sm:text-[36px]">
                All downloads
              </h2>
            </div>
            <a
              href={releasesPage}
              className="text-[13px] text-muted underline decoration-border-strong underline-offset-4 hover:text-foreground hover:decoration-foreground"
            >
              Release notes
            </a>
          </div>
          <Stagger className="mt-8 grid gap-3 md:grid-cols-3">
            {ORDER.map((os) => (
              <LiftCard key={os} className="glass overflow-hidden rounded-[22px]">
                <h3 className="eyebrow px-5 pb-3 pt-5 !text-foreground">{osLabel[os]}</h3>
                <ul className="divide-y divide-border border-t border-border">
                  {releasesByOS[os].map((r) => (
                    <li key={r.id}>
                      <a
                        href={r.url}
                        className="group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-glass-hover"
                      >
                        <span className="min-w-0">
                          <span className="block text-[14px] text-foreground">{r.short}</span>
                          <span className="mt-0.5 block text-[12px] text-subtle">{r.detail}</span>
                        </span>
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted ring-[0.5px] ring-border-strong transition-[transform,color] duration-200 ease-spring group-hover:text-foreground group-active:scale-[0.94]">
                          <DownloadIcon className="size-3.5" />
                          <span className="sr-only">Download {r.file}</span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </LiftCard>
            ))}
          </Stagger>
        </Container>
      </section>

      <section aria-labelledby="after-install">
        <Container className="pt-24 sm:pt-28">
          <Eyebrow>Setup</Eyebrow>
          <h2 id="after-install" className="mt-4 text-[30px] font-light tracking-[-0.035em] sm:text-[36px]">
            After installing
          </h2>
          <Stagger className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Step n={1} title="Grant permissions">
              {brand.name} asks for the microphone, and on a Mac, Accessibility so it can type.
            </Step>
            <Step n={2} title="Press the shortcut">
              <span className="flex flex-wrap items-center gap-1.5">
                <Kbd>{defaultShortcut.mac.replace("Option", "⌥ Option")}</Kbd>
                <span className="text-subtle">macOS</span>
              </span>
              <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Kbd>{defaultShortcut.windows}</Kbd>
                <span className="text-subtle">elsewhere</span>
              </span>
            </Step>
            <Step n={3} title="Speak">
              Talk naturally, in full sentences. Punctuation comes along with it.
            </Step>
            <Step n={4} title="Release">
              Let go of the keys. Your text appears wherever the cursor is.
            </Step>
          </Stagger>
          <p className="mt-6 text-[13px] text-subtle">
            The shortcut, push-to-talk vs. toggle, and model can be changed in Settings. On Linux, see{" "}
            <Link href="/docs/linux" className="text-foreground underline decoration-border-strong underline-offset-4">
              Linux setup
            </Link>
            .
          </p>
        </Container>
      </section>
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <LiftCard className="glass rounded-[22px] p-6">
      <p className="eyebrow !text-subtle">{String(n).padStart(2, "0")}</p>
      <h3 className="mt-6 text-[15px] font-normal">{title}</h3>
      <div className="mt-2 text-[13px] leading-relaxed text-muted">{children}</div>
    </LiftCard>
  );
}
