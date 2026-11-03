import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { AgentDemo } from "@/components/agent-demo";
import { DownloadButton } from "@/components/download-picker";
import { AmbientPreview } from "@/components/ambient-preview";
import { Compare } from "@/components/compare";
import { Faq } from "@/components/faq";
import { faqs } from "@/lib/faqs";
import { HeroDemo } from "@/components/hero-demo";
import { LaunchVideo, videoSource } from "@/components/launch-video";
import { NothingToConnect } from "@/components/nothing-to-connect";
import { RevealLines, SwapWord } from "@/components/hero-copy";
import { Mark } from "@/components/logo";
import { LiftCard, Reveal, Stagger, StaggerItem } from "@/components/motion";
import { type OrbVariant } from "@/components/orb/Orb";
import { OrbIcon } from "@/components/orb-icon";
import { Pricing } from "@/components/pricing";
import { TrustHighlights, TrustList } from "@/components/trust";
import { Arrow, ButtonLink, Container, Eyebrow, SectionHeading } from "@/components/ui";
import { brand } from "@/lib/brand";
import {
  agent,
  agentModes,
  apps,
  comingSoon,
  competitors,
  description,
  features,
  heroLead,
  heroOutcomes,
  heroSub,
  launchVideo,
  macFirst,
  meetings,
  suggestions,
  trust,
} from "@/lib/content";
import { pageMetadata } from "@/lib/seo";
import { faqPageLd, softwareApplicationLd } from "@/lib/structured-data";
import { JsonLd } from "@/components/json-ld";

export const metadata: Metadata = pageMetadata({ description, path: "/" });

export default function Home() {
  const video = launchVideo && videoSource(launchVideo.horizontal.url) ? launchVideo : null;
  return (
    <>
      <JsonLd data={softwareApplicationLd()} />
      <JsonLd data={faqPageLd(faqs)} />
      {/* Hero */}
      <section>
        <Container className="pb-20 pt-14 sm:pb-28 sm:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal className="flex justify-center">
              <span className="glass inline-flex h-7 items-center gap-2 rounded-full pl-2 pr-3.5">
                <OrbIcon variant="C2" footprint={11} />
                <span className="eyebrow">A voice agent for your computer</span>
              </span>
            </Reveal>
            <h1 className="mt-8 text-balance text-[46px] font-extralight leading-[1.02] tracking-[-0.05em] sm:text-[76px]">
              <RevealLines
                lines={[
                  heroLead,
                  <Fragment key="outcome">
                    It’s <SwapWord words={heroOutcomes} interval={2600} />
                  </Fragment>,
                ]}
              />
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

          <Reveal delay={0.35} className="mx-auto mt-16 max-w-[640px] sm:mt-20">
            <HeroDemo />
            <p className="eyebrow mt-4 text-center !text-subtle">Shown with optional AI polish</p>
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

      {/* Voice agent: write / answer / act / recall */}
      <section id="agent" aria-labelledby="agent-heading">
        <Container className="pt-28 sm:pt-36">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
            <Reveal>
              <SectionHeading id="agent-heading" eyebrow={agent.eyebrow} title={agent.title} sub={agent.body} />
              <Stagger className="mt-9">
                {agentModes.map((m) => (
                  <StaggerItem key={m.k} className="flex gap-4 border-t border-border py-4">
                    <span className="w-[72px] shrink-0 text-[13.5px] text-foreground">{m.k}</span>
                    <span className="text-[13.5px] text-muted">{m.body}</span>
                  </StaggerItem>
                ))}
              </Stagger>
              <p className="border-t border-border pt-4 text-[13.5px] text-muted">{agent.handsFree}</p>
              <Link
                href="/docs/getting-started"
                className="mt-6 inline-flex items-center gap-2 text-[13.5px] text-foreground underline-offset-4 hover:underline"
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
        <section id="video" aria-label={video.title}>
          <Container className="pt-28 sm:pt-36">
            <Reveal className="mx-auto max-w-[880px]">
              <LaunchVideo video={video} />
            </Reveal>
          </Container>
        </section>
      ) : null}

      {/* Nothing to connect */}
      <section id="nothing-to-connect" aria-labelledby="connect-heading">
        <Container className="pt-20 sm:pt-24">
          <Reveal>
            <NothingToConnect />
          </Reveal>
        </Container>
      </section>

      {/* Meetings */}
      <section id="meetings" aria-labelledby="meetings-heading">
        <Container className="pt-28 sm:pt-36">
          <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
            <Reveal delay={0.15} className="order-last lg:order-first">
              <AmbientPreview preset="meeting" />
              <p className="eyebrow mt-4 text-center !text-subtle">A live nudge during a call</p>
            </Reveal>
            <Reveal>
              <SectionHeading id="meetings-heading" eyebrow={meetings.eyebrow} title={meetings.title} sub={meetings.body} />
              <Stagger className="mt-9">
                {meetings.points.map((p) => (
                  <StaggerItem key={p.k} className="flex gap-4 border-t border-border py-4">
                    <span className="w-[112px] shrink-0 text-[13.5px] text-foreground">{p.k}</span>
                    <span className="text-[13.5px] text-muted">{p.v}</span>
                  </StaggerItem>
                ))}
              </Stagger>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Suggestions */}
      <section id="suggestions" aria-labelledby="suggestions-heading">
        <Container className="pt-28 sm:pt-36">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
            <Reveal>
              <SectionHeading
                id="suggestions-heading"
                eyebrow={suggestions.eyebrow}
                title={suggestions.title}
                sub={suggestions.body}
              />
              <ul className="mt-8 space-y-2 text-[13.5px] text-muted">
                {suggestions.examples.map((e) => (
                  <li key={e} className="flex gap-3">
                    <span className="mt-[9px] size-1 shrink-0 rounded-full bg-foreground/40" />
                    {e}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-[13.5px] text-foreground">{suggestions.promise}</p>
            </Reveal>
            <Reveal delay={0.15}>
              <AmbientPreview preset="suggestion" />
              <p className="eyebrow mt-4 text-center !text-subtle">A suggestion from an email thread</p>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Coming soon: computer use */}
      <section id="computer-use" aria-labelledby="computer-use-heading">
        <Container className="pt-28 sm:pt-36">
          <Reveal className="glass rounded-[24px] p-6 sm:p-10">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
              <div>
                <Eyebrow>
                  <span className="t-shimmer" data-text={comingSoon.label}>
                    {comingSoon.label}
                  </span>
                </Eyebrow>
                <h2
                  id="computer-use-heading"
                  className="mt-4 text-balance text-[30px] font-light leading-[1.1] tracking-[-0.035em] sm:text-[40px]"
                >
                  {comingSoon.title}
                </h2>
                <p className="mt-4 text-pretty text-[15px] leading-relaxed text-muted">{comingSoon.body}</p>
                <ul className="mt-6 space-y-2">
                  {comingSoon.examples.map((e) => (
                    <li key={e} className="text-[15px] text-foreground">
                      “{e}”
                    </li>
                  ))}
                </ul>
              </div>
              <dl className="grid content-start gap-x-10 sm:grid-cols-2">
                {comingSoon.points.map((p, i) => (
                  <div
                    key={p.k}
                    className={`flex flex-col gap-1 py-4 ${i > 0 ? "border-t border-border" : ""} ${i === 1 ? "sm:border-t-0" : ""}`}
                  >
                    <dt className="text-[14px] text-foreground">{p.k}</dt>
                    <dd className="text-[13.5px] leading-relaxed text-muted">{p.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Reveal>
        </Container>
      </section>


      {/* Trust */}
      <section id="privacy-promise" aria-labelledby="trust-heading">
        <Container className="pt-28 sm:pt-36">
          <Reveal>
            <SectionHeading id="trust-heading" eyebrow={trust.eyebrow} title={trust.title} sub={trust.body} />
          </Reveal>
          <div className="mt-10">
            <TrustHighlights />
          </div>
          <div className="mt-3">
            <TrustList />
          </div>
          <Reveal className="mt-6 text-[13px] text-subtle">{macFirst}</Reveal>
        </Container>
      </section>

      {/* Free dictation */}
      <section id="features" aria-labelledby="features-heading">
        <Container className="pt-28 sm:pt-36">
          <Reveal>
            <SectionHeading
              id="features-heading"
              eyebrow="Dictation, free forever"
              title="Talk the way you think. Read it the way you’d write it."
              sub="Hold a key, talk, let go. The words appear where you’re typing."
            />
          </Reveal>
          <Stagger className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <LiftCard key={f.title} className="glass flex min-h-[188px] flex-col rounded-[22px] p-6">
                <div className="flex items-center justify-between">
                  <OrbIcon variant={f.orb as OrbVariant} footprint={18} />
                  <span className="eyebrow !text-subtle">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="mt-auto pt-8 text-[15px] font-normal tracking-[-0.01em]">{f.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{f.body}</p>
              </LiftCard>
            ))}
          </Stagger>
          <Reveal className="mt-8 flex justify-center">
            <ButtonLink href="/features" variant="glass">
              Everything it does <Arrow />
            </ButtonLink>
          </Reveal>
        </Container>
      </section>

      {/* Compare */}
      <section id="compare" aria-labelledby="compare-heading">
        <Container className="pt-28 sm:pt-36">
          <Reveal>
            <SectionHeading
              id="compare-heading"
              eyebrow="Compare"
              title={`${brand.name}, ${competitors.join(" and ")}`}
              sub="Where your voice goes, what’s free, and what each one costs and does."
            />
          </Reveal>
          <Reveal delay={0.1} className="mt-10">
            <Compare />
          </Reveal>
        </Container>
      </section>

      {/* Pricing */}
      <section id="pricing" aria-labelledby="pricing-heading">
        <Container className="pt-28 sm:pt-36">
          <Reveal>
            <SectionHeading
              id="pricing-heading"
              eyebrow="Pricing"
              title="Free to start. Simple when you’re hooked."
              sub="Dictation is free forever. Pro adds the agent."
              className="mx-auto text-center"
            />
          </Reveal>
          <div className="mt-12">
            <Pricing />
          </div>
        </Container>
      </section>

      {/* FAQ */}
      <section id="faq" aria-labelledby="faq-heading">
        <Container className="pt-28 sm:pt-36">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
            <Reveal>
              <SectionHeading id="faq-heading" eyebrow="FAQ" title="Questions, answered." />
            </Reveal>
            <Reveal delay={0.1}>
              <Faq items={faqs} />
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Final CTA */}
      <section aria-labelledby="cta-heading">
        <Container className="pt-28 sm:pt-36">
          <Reveal className="glass flex flex-col items-center rounded-[28px] px-6 py-20 text-center sm:py-24">
            <Mark size={56} />
            <Eyebrow className="mt-8">{brand.name}</Eyebrow>
            <h2
              id="cta-heading"
              className="mt-4 max-w-xl text-balance text-[38px] font-extralight leading-[1.05] tracking-[-0.045em] sm:text-[56px]"
            >
              Stop typing. Start talking.
            </h2>
            <p className="mt-5 max-w-sm text-[15px] text-muted">
              Free dictation on every platform. Try the agent free for {brand.trialDays} days, no card.
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
