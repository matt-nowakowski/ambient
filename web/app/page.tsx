import type { Metadata } from "next";
import Link from "next/link";
import { AgentDemo } from "@/components/agent-demo";
import { AmbientPreview } from "@/components/ambient-preview";
import { DownloadButton } from "@/components/download-picker";
import { Faq } from "@/components/faq";
import { RevealLines } from "@/components/hero-copy";
import { HeroAgent } from "@/components/hero-agent";
import { JsonLd } from "@/components/json-ld";
import { LaunchVideo, videoSource } from "@/components/launch-video";
import { Mark } from "@/components/logo";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { type OrbVariant } from "@/components/orb/Orb";
import { OrbIcon } from "@/components/orb-icon";
import { Pricing } from "@/components/pricing";
import { TrustPromises } from "@/components/trust";
import { Arrow, ButtonLink, Container, SectionHeading } from "@/components/ui";
import { WriteDemo } from "@/components/write-demo";
import { brand } from "@/lib/brand";
import {
  agent,
  apps,
  competitors,
  comingSoonChip,
  description,
  heroEyebrow,
  heroSub,
  heroTitle,
  launchVideo,
  meetings,
  suggestions,
  trust,
  writing,
} from "@/lib/content";
import { homeFaqs } from "@/lib/faqs";
import { nothingToConnect } from "@/lib/guide";
import { pageMetadata } from "@/lib/seo";
import { faqPageLd, softwareApplicationLd } from "@/lib/structured-data";

export const metadata: Metadata = pageMetadata({ description, path: "/" });

/** Space above each section. */
const pad = "pt-20 sm:pt-24";
/** A small glass chip: a capability in two to four words. */
const chip = "glass inline-flex h-8 items-center rounded-full px-3.5 text-[12.5px] text-muted";

export default function Home() {
  const video = launchVideo && videoSource(launchVideo.horizontal.url) ? launchVideo : null;
  return (
    <>
      <JsonLd data={softwareApplicationLd()} />
      <JsonLd data={faqPageLd(homeFaqs)} />
      {/* Hero: a live agent you talk to, that nudges you */}
      <section>
        <Container className="pb-16 pt-14 sm:pb-24 sm:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal className="flex justify-center">
              <span className="glass inline-flex h-7 items-center gap-2 rounded-full pl-2 pr-3.5">
                <OrbIcon variant="C2" footprint={11} />
                <span className="eyebrow">{heroEyebrow}</span>
              </span>
            </Reveal>
            <h1 className="mt-8 text-balance text-[46px] font-extralight leading-[1.02] tracking-[-0.05em] sm:text-[76px]">
              <RevealLines lines={[...heroTitle]} />
            </h1>
            <Reveal delay={0.25}>
              <p className="mx-auto mt-7 max-w-[480px] text-pretty text-[15px] leading-relaxed text-muted">
                {heroSub}
              </p>
              <div className="mx-auto mt-9 flex max-w-[400px] items-center justify-center gap-2.5 sm:max-w-none">
                <DownloadButton menu={false} className="min-w-0 flex-1 sm:flex-none" />
                <ButtonLink href={video ? "#video" : "/pricing"} variant="glass" size="lg" className="shrink-0 px-5 sm:px-6">
                  {video ? "Learn more" : "See pricing"}
                </ButtonLink>
              </div>
              <p className="eyebrow mt-6">macOS, Windows and Linux · Agent in beta on Windows and Linux</p>
            </Reveal>
          </div>

          <Reveal delay={0.35} className="mx-auto mt-14 max-w-[640px] sm:mt-16">
            <HeroAgent />
          </Reveal>
        </Container>
      </section>

      {/* Works in every app */}
      <section aria-labelledby="apps-heading">
        <Container>
          <Reveal className="glass flex flex-col gap-4 rounded-[22px] px-6 py-5 sm:flex-row sm:items-center sm:gap-10">
            <h2 id="apps-heading" className="eyebrow shrink-0">
              Works in every app
            </h2>
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] font-light text-muted">
              {apps.map((a) => (
                <li key={a}>{a}</li>
              ))}
              <li className="text-subtle">+ anywhere you type</li>
            </ul>
          </Reveal>
        </Container>
      </section>

      {/* Talk to it: write / answer / act / recall, nothing to connect, computer use next */}
      <section id="agent" aria-labelledby="agent-heading">
        <Container className={pad}>
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
            <Reveal>
              <SectionHeading id="agent-heading" eyebrow={agent.eyebrow} title={agent.title} sub={agent.body} />
              <div className="mt-8 flex flex-wrap items-center gap-2">
                <span className="glass-strong inline-flex h-8 items-center gap-2 rounded-full pl-2.5 pr-3.5 text-[12.5px] text-foreground">
                  <OrbIcon variant="C2" footprint={11} />
                  {nothingToConnect.title.replace(/\.$/, "")}
                </span>
                {nothingToConnect.sources.map((src) => (
                  <span key={src.k} className={chip}>
                    {src.k}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className={chip}>{agent.handsFreeChip}</span>
                <span className={chip}>
                  <span className="t-shimmer" data-text={comingSoonChip}>
                    {comingSoonChip}
                  </span>
                </span>
              </div>
              <Link
                href="/docs/getting-started"
                className="mt-7 inline-flex items-center gap-2 text-[13.5px] text-foreground underline-offset-4 hover:underline"
              >
                See what you can say <Arrow />
              </Link>
            </Reveal>
            <Reveal delay={0.15}>
              <AgentDemo />
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Launch video: renders nothing until a URL is set in lib/content.ts */}
      {video ? (
        <section id="video" aria-label={video.title} className="scroll-mt-20">
          <Container className={pad}>
            <Reveal className="mx-auto max-w-[880px]">
              <LaunchVideo video={video} />
            </Reveal>
          </Container>
        </section>
      ) : null}

      {/* It nudges you: suggestions */}
      <section id="suggestions" aria-labelledby="suggestions-heading">
        <Container className={pad}>
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
            <Reveal>
              <SectionHeading
                id="suggestions-heading"
                eyebrow={suggestions.eyebrow}
                title={suggestions.title}
                sub={suggestions.short}
              />
              <Stagger className="mt-8 flex flex-wrap gap-2">
                {suggestions.chips.map((c) => (
                  <StaggerItem key={c} className={chip}>
                    {c}
                  </StaggerItem>
                ))}
              </Stagger>
              <p className="mt-6 flex items-center gap-2.5 text-[13px] text-subtle">
                <OrbIcon variant="B1" footprint={11} />
                {suggestions.promiseShort}
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <AmbientPreview preset="suggestion" loop />
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Meetings */}
      <section id="meetings" aria-labelledby="meetings-heading">
        <Container className={pad}>
          <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
            <Reveal delay={0.15} className="order-last lg:order-first">
              <AmbientPreview preset="meeting" />
            </Reveal>
            <Reveal>
              <SectionHeading id="meetings-heading" eyebrow={meetings.eyebrow} title={meetings.title} sub={meetings.body} />
              <Stagger className="mt-8 grid gap-2 sm:grid-cols-2">
                {meetings.chips.map((c) => (
                  <StaggerItem key={c.k} className="glass flex h-11 items-center gap-2.5 rounded-[14px] px-3.5 text-[13px] text-foreground">
                    <OrbIcon variant={c.orb as OrbVariant} footprint={12} />
                    {c.k}
                  </StaggerItem>
                ))}
              </Stagger>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Writing: dictation as an assistant, free */}
      <section id="features" aria-labelledby="features-heading">
        <Container className={pad}>
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
            <Reveal>
              <SectionHeading id="features-heading" eyebrow={writing.eyebrow} title={writing.title} sub={writing.body} />
              <div className="mt-8 flex flex-wrap gap-2">
                {writing.chips.map((c) => (
                  <span key={c} className={chip}>
                    {c}
                  </span>
                ))}
              </div>
              <Link
                href="/features"
                className="mt-7 inline-flex items-center gap-2 text-[13.5px] text-foreground underline-offset-4 hover:underline"
              >
                See everything it does <Arrow />
              </Link>
            </Reveal>
            <Reveal delay={0.15}>
              <WriteDemo />
              <p className="eyebrow mt-4 text-center !text-subtle">{writing.caption}</p>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Privacy */}
      <section id="privacy-promise" aria-labelledby="trust-heading">
        <Container className={pad}>
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
            <Reveal>
              <SectionHeading id="trust-heading" eyebrow={trust.eyebrow} title={trust.short.title} sub={trust.short.body} />
              <Link
                href="/privacy"
                className="mt-7 inline-flex items-center gap-2 text-[13.5px] text-foreground underline-offset-4 hover:underline"
              >
                How we handle your data <Arrow />
              </Link>
            </Reveal>
            <TrustPromises />
          </div>
        </Container>
      </section>

      {/* Pricing */}
      <section id="pricing" aria-labelledby="pricing-heading">
        <Container className={pad}>
          <Reveal>
            <SectionHeading
              id="pricing-heading"
              eyebrow="Pricing"
              title="Dictation is free. The agent is Pro."
              className="mx-auto text-center"
            />
          </Reveal>
          <div className="mt-10">
            <Pricing compact />
          </div>
          <p className="mt-6 text-center text-[13px] text-subtle">
            <Link href="/pricing#compare" className="text-foreground underline-offset-4 hover:underline">
              Compare with {competitors.join(" and ")}
            </Link>
            {" · "}
            <Link href="/pricing#team" className="text-foreground underline-offset-4 hover:underline">
              Team plan
            </Link>
          </p>
        </Container>
      </section>

      {/* FAQ */}
      <section id="faq" aria-labelledby="faq-heading">
        <Container className={pad}>
          <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
            <Reveal>
              <SectionHeading id="faq-heading" eyebrow="FAQ" title="Questions, answered." />
              <Link
                href="/pricing#faq"
                className="mt-6 inline-flex items-center gap-2 text-[13.5px] text-foreground underline-offset-4 hover:underline"
              >
                More answers <Arrow />
              </Link>
            </Reveal>
            <Reveal delay={0.1}>
              <Faq items={homeFaqs} />
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Final CTA */}
      <section aria-labelledby="cta-heading">
        <Container className={pad}>
          <Reveal className="glass flex flex-col items-center rounded-[28px] px-6 py-12 text-center sm:py-14">
            <Mark size={44} />
            <h2
              id="cta-heading"
              className="mt-6 max-w-xl text-balance text-[38px] font-extralight leading-[1.05] tracking-[-0.045em] sm:text-[56px]"
            >
              Start talking to your computer.
            </h2>
            <p className="mt-5 max-w-md text-balance text-[15px] text-muted">
              Try the agent free for {brand.trialDays} days, no card. Dictation stays free.
            </p>
            <ButtonLink href="/download" size="lg" className="mt-9">
              Download {brand.name} <Arrow />
            </ButtonLink>
          </Reveal>
        </Container>
      </section>
    </>
  );
}
