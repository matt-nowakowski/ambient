import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AgentDemo } from "@/components/agent-demo";
import { AmbientPreview } from "@/components/ambient-preview";
import { HeroDemo } from "@/components/hero-demo";
import { LiftCard, Reveal, Stagger } from "@/components/motion";
import type { OrbVariant } from "@/components/orb/Orb";
import { OrbIcon } from "@/components/orb-icon";
import { PageHeader } from "@/components/page-header";
import { TrustHighlights, TrustList } from "@/components/trust";
import { ButtonLink, Container, Eyebrow, SectionHeading } from "@/components/ui";
import { brand } from "@/lib/brand";
import { comingSoon, featureGroups, macFirst, trust, type FeatureGroup } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Features",
  description: `Everything ${brand.name} does: a live agent on your desktop that answers, acts and recalls, nudges you when it can help, and takes meeting notes with no bot. Plus free on-device dictation that polishes your words or writes the message for you.`,
  path: "/features",
});

const demos: Partial<Record<string, { node: ReactNode; caption: string }>> = {
  agent: { node: <AgentDemo />, caption: "One key, four outcomes" },
  meetings: { node: <AmbientPreview preset="meeting" />, caption: "A live nudge during a call" },
  suggestions: { node: <AmbientPreview preset="suggestion" loop />, caption: "A suggestion from an email thread" },
  dictation: { node: <HeroDemo />, caption: "Shown with optional AI polish" },
};

function Group({ g }: { g: FeatureGroup }) {
  const demo = demos[g.id];
  return (
    <section id={g.id} aria-labelledby={`fg-${g.id}`} className="scroll-mt-24">
      <Container className="pt-20 sm:pt-28">
        <div className={demo ? "grid items-center gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-16" : ""}>
          <Reveal className="max-w-xl">
            <Eyebrow>{g.pro ? "Pro" : "Free"}</Eyebrow>
            <h2 id={`fg-${g.id}`} className="mt-3 text-[26px] font-light tracking-[-0.03em] sm:text-[30px]">
              {g.heading}
            </h2>
            {g.intro ? <p className="mt-3 text-pretty text-[15px] leading-relaxed text-muted">{g.intro}</p> : null}
          </Reveal>
          {demo ? (
            <Reveal delay={0.15}>
              {demo.node}
              <p className="eyebrow mt-4 text-center !text-subtle">{demo.caption}</p>
            </Reveal>
          ) : null}
        </div>
        <Stagger className="mt-10 grid gap-3 sm:grid-cols-2">
          {g.items.map((f) => (
            <LiftCard key={f.title} className="glass flex gap-4 rounded-[22px] p-6">
              <OrbIcon variant={f.orb as OrbVariant} footprint={16} className="mt-1" />
              <div>
                <h3 className="text-[15px] font-normal tracking-[-0.01em]">{f.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{f.body}</p>
              </div>
            </LiftCard>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}

export default function FeaturesPage() {
  const agentGroups = featureGroups.filter((g) => g.pro);
  const dictation = featureGroups.filter((g) => !g.pro);
  return (
    <>
      <Container className="pt-14 sm:pt-20">
        <PageHeader
          eyebrow="Features"
          title="A live agent on your desktop."
          intro={`Talk to it and it answers, acts or recalls. It nudges you when it can help. Dictation is free. ${macFirst}`}
        />
      </Container>

      {agentGroups.map((g) => (
        <Group key={g.id} g={g} />
      ))}

      <section id="privacy-promise" aria-labelledby="trust-heading" className="scroll-mt-24">
        <Container className="pt-20 sm:pt-28">
          <Reveal>
            <SectionHeading id="trust-heading" eyebrow={trust.eyebrow} title={trust.title} sub={trust.body} />
          </Reveal>
          <div className="mt-10">
            <TrustHighlights />
          </div>
          <div className="mt-3">
            <TrustList />
          </div>
        </Container>
      </section>

      {dictation.map((g) => (
        <Group key={g.id} g={g} />
      ))}

      <section aria-labelledby="coming-soon">
        <Container className="pt-24 sm:pt-28">
          <Reveal className="glass rounded-[24px] p-6 sm:p-8">
            <Eyebrow>
              <span className="t-shimmer" data-text={comingSoon.label}>
                {comingSoon.label}
              </span>
            </Eyebrow>
            <h2 id="coming-soon" className="mt-4 text-[26px] font-light tracking-[-0.03em] sm:text-[30px]">
              {comingSoon.title}
            </h2>
            <p className="mt-3 max-w-xl text-pretty text-[15px] leading-relaxed text-muted">{comingSoon.body}</p>
            <ul className="mt-6 grid gap-x-10 gap-y-3 sm:grid-cols-2">
              {comingSoon.points.map((p) => (
                <li key={p.k} className="flex flex-col gap-1">
                  <span className="text-[14px] text-foreground">{p.k}</span>
                  <span className="text-[13.5px] leading-relaxed text-muted">{p.v}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </section>

      <Container className="pt-24">
        <Reveal className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-center">
          <ButtonLink href="/download" size="lg">
            Download {brand.name}
          </ButtonLink>
          <ButtonLink href="/pricing" variant="glass" size="lg">
            See pricing
          </ButtonLink>
        </Reveal>
      </Container>
    </>
  );
}
