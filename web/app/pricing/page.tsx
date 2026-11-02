import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Compare } from "@/components/compare";
import { Faq } from "@/components/faq";
import { RevealLines } from "@/components/hero-copy";
import { Reveal } from "@/components/motion";
import { Pricing } from "@/components/pricing";
import { Container, Eyebrow } from "@/components/ui";
import { brand, emails, fairUseNote, freeMeetingsPerMonth, mailto } from "@/lib/brand";
import { macFirst } from "@/lib/content";
import { billingFaqs } from "@/lib/faqs";
import { faqPageLd, productLd } from "@/lib/structured-data";
import { JsonLd } from "@/components/json-ld";

export const metadata: Metadata = pageMetadata({
  title: "Pricing",
  description: `Dictation is free and unlimited. ${brand.name} Pro adds the voice agent, meeting notes and suggestions for $${brand.pricing.proYearlyPerMonth}/mo billed annually or $${brand.pricing.proMonthly} monthly. ${brand.trialDays}-day trial, no card.`,
  path: "/pricing",
});

export default function PricingPage() {
  return (
    <>
      <JsonLd data={productLd()} />
      <JsonLd data={faqPageLd(billingFaqs)} />
      <Container className="pt-14 sm:pt-20">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Pricing</Eyebrow>
          <h1 className="mt-5 text-balance text-[44px] font-extralight leading-[1.04] tracking-[-0.05em] sm:text-[64px]">
            <RevealLines lines={["Simple pricing."]} />
          </h1>
          <Reveal delay={0.15}>
            <p className="mx-auto mt-6 max-w-md text-pretty text-[15px] leading-relaxed text-muted">
              Dictation is free and unlimited on every platform, forever. Pro adds the agent: AI polish, answers,
              actions, meeting notes and suggestions, with no weekly cap. Every install starts with {brand.trialDays}{" "}
              days of everything, no card.
            </p>
          </Reveal>
        </div>
        <div className="mt-14">
          <Pricing headingLevel="h2" />
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-[13px] leading-relaxed text-subtle">
          After the trial, Free includes {brand.freePolishPerWeek} AI uses a week, shared across polish, answers,
          actions, Ask and meeting summaries, and {freeMeetingsPerMonth} meetings a month. {fairUseNote} {macFirst}
        </p>
        <p className="mt-3 text-center text-[13px] text-subtle">
          Prices in USD. Taxes calculated at checkout. Need an invoice or a larger plan?{" "}
          <a
            href={mailto(`${brand.name} pricing`, emails.sales)}
            className="text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
          >
            {emails.sales}
          </a>
        </p>
      </Container>

      <section aria-labelledby="compare-heading">
        <Container className="pt-28 sm:pt-32">
          <Reveal>
            <Eyebrow>Compare</Eyebrow>
            <h2 id="compare-heading" className="mt-4 text-[30px] font-light tracking-[-0.035em] sm:text-[36px]">
              How we compare
            </h2>
          </Reveal>
          <Reveal delay={0.1} className="mt-8">
            <Compare />
          </Reveal>
        </Container>
      </section>

      <section aria-labelledby="faq-heading">
        <Container className="pt-28 sm:pt-32">
          <Reveal>
            <Eyebrow>FAQ</Eyebrow>
            <h2 id="faq-heading" className="mt-4 text-[30px] font-light tracking-[-0.035em] sm:text-[36px]">
              Billing questions
            </h2>
          </Reveal>
          <Reveal delay={0.1} className="mt-8">
            <Faq items={billingFaqs} />
          </Reveal>
        </Container>
      </section>
    </>
  );
}
