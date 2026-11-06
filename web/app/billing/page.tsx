import type { Metadata } from "next";
import Link from "next/link";
import { BillingLinkForm } from "@/components/billing-link-form";
import { Reveal } from "@/components/motion";
import { PageHeader } from "@/components/page-header";
import { Container, Eyebrow } from "@/components/ui";
import { brand, mailto } from "@/lib/brand";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Manage your plan",
  description: `Change or cancel your ${brand.name} plan, update your card or download invoices: from the app, or by email from here.`,
  path: "/billing",
});

const portal = [
  {
    label: "Change your plan",
    body: "Switch between monthly and yearly billing.",
  },
  {
    label: "Cancel",
    body: "Your plan stays on until the end of the period you’ve paid for, then Free carries on.",
  },
  { label: "Update your card", body: "Change the card you pay with." },
  { label: "Download invoices", body: "Every receipt, past and present." },
];

export default function BillingPage() {
  return (
    <Container className="page-balanced pb-10 pt-14 sm:pt-20">
      <PageHeader
        eyebrow="Billing"
        title="Manage your plan."
        intro={
          <>
            Change or cancel your plan, update your card, or download invoices.
            It all happens in the billing portal run by Polar, our payment
            provider. Two ways in.
          </>
        }
      />
      <div className="mt-14 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Reveal className="glass rounded-[24px] p-6 sm:p-8">
            <Eyebrow>In the app</Eyebrow>
            <h2 className="mt-3 text-[22px] font-light tracking-[-0.03em]">
              Account → Manage billing
            </h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
              Open {brand.name}, go to{" "}
              <span className="text-foreground">Account</span> and choose{" "}
              <span className="text-foreground">Manage billing</span>. The
              portal opens in your browser, already signed in.
            </p>
          </Reveal>
          <Reveal delay={0.05} className="glass rounded-[24px] p-6 sm:p-8">
            <Eyebrow>Without the app</Eyebrow>
            <h2 className="mt-3 text-[22px] font-light tracking-[-0.03em]">
              We’ll email you a link
            </h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
              Enter the email you paid with and we’ll send a secure link to your
              billing portal. Uninstalled {brand.name} or on another computer?
              This works the same.
            </p>
            <div className="mt-6">
              <BillingLinkForm />
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.1} className="space-y-3">
          <Eyebrow className="px-1">In the portal</Eyebrow>
          {portal.map((p) => (
            <div key={p.label} className="glass rounded-[20px] p-5">
              <span className="block text-[15px] text-foreground">
                {p.label}
              </span>
              <span className="mt-1 block text-[13px] text-muted">
                {p.body}
              </span>
            </div>
          ))}
          <p className="px-1 pt-3 text-[13px] leading-relaxed text-subtle">
            Stuck, or want a refund? Email{" "}
            <a
              href={mailto(`${brand.name} billing`)}
              className="text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
            >
              {brand.supportEmail}
            </a>{" "}
            and a person will sort it out. Refunds are in the{" "}
            <Link
              href="/terms"
              className="text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
            >
              terms
            </Link>
            .
          </p>
        </Reveal>
      </div>
    </Container>
  );
}
