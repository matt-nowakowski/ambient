import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { Compare } from "@/components/compare";
import { Faq } from "@/components/faq";
import { RevealLines } from "@/components/hero-copy";
import { Reveal } from "@/components/motion";
import { Pricing } from "@/components/pricing";
import { Container, Eyebrow } from "@/components/ui";
import { brand, emails, fairUseNote, mailto } from "@/lib/brand";
import { billingFaqs, faqs } from "@/lib/faqs";
import { faqPageLd, productLd } from "@/lib/structured-data";
import { JsonLd } from "@/components/json-ld";

export const metadata: Metadata = pageMetadata({
  title: "Pricing",
  description: `${brand.name} Free gets the whole colleague, with weekly limits and unlimited dictation. Pro removes the limits for $${brand.pricing.proYearlyPerMonth}/mo billed annually or $${brand.pricing.proMonthly} monthly. Try Pro free for ${brand.trialDays} days, no card.`,
  path: "/pricing",
});

/** Every question, general then billing ("What’s free" is in both lists once). */
const pricingFaqs = [...faqs, ...billingFaqs.filter((b) => !faqs.some((f) => f.q === b.q))];

export default function PricingPage() {
  return (
    <>
      <JsonLd data={productLd()} />
      <JsonLd data={faqPageLd(pricingFaqs)} />
      <Container className="pt-14 sm:pt-20">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Pricing</Eyebrow>
          <h1 className="mt-5 text-balance text-[44px] font-extralight leading-[1.04] tracking-[-0.05em] sm:text-[64px]">
            <RevealLines lines={["Start free. Go unlimited."]} />
          </h1>
          <Reveal delay={0.15}>
            <p className="mx-auto mt-6 max-w-md text-pretty text-[15px] leading-relaxed text-muted">
              Free gets the whole colleague, with weekly limits. Pro removes them. Try Pro free for {brand.trialDays}{" "}
              days, no card.
            </p>
          </Reveal>
        </div>
        <div className="mt-14">
          <Pricing headingLevel="h2" />
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-[13px] leading-relaxed text-subtle">
          Free’s {brand.freePolishPerWeek} AI uses a week are shared across polish, writing, answers, actions and
          meeting summaries. {fairUseNote}
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
        <p className="mt-2 text-center text-[13px] text-subtle">
          Already subscribed?{" "}
          <Link
            href="/billing"
            className="text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
          >
            Manage or cancel your plan
          </Link>
        </p>
      </Container>

      <section id="compare" aria-labelledby="compare-heading" className="scroll-mt-20">
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

      <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-20">
        <Container className="pt-28 sm:pt-32">
          <Reveal>
            <Eyebrow>FAQ</Eyebrow>
            <h2 id="faq-heading" className="mt-4 text-[30px] font-light tracking-[-0.035em] sm:text-[36px]">
              Questions
            </h2>
          </Reveal>
          <Reveal delay={0.1} className="mt-8">
            <Faq items={pricingFaqs} />
          </Reveal>
        </Container>
      </section>
    </>
  );
}
