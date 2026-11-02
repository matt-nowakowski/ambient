import type { Metadata } from "next";
import { MailtoForm } from "@/components/mailto-form";
import { Reveal } from "@/components/motion";
import { PageHeader } from "@/components/page-header";
import { Check, Container } from "@/components/ui";
import { brand, emails } from "@/lib/brand";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Sales",
  description: `${brand.name} for teams: private, on-device dictation and the agent for everyone, with central billing and pricing that fits your team.`,
  path: "/sales",
});

const points: { title: string; body: string; soon?: boolean }[] = [
  { title: "Private by design", body: "Speech-to-text runs on each person’s computer. No audio reaches us or any cloud — easy to clear with security." },
  { title: "Central billing", body: "One annual invoice, Pro for every seat. Add or remove seats as your team changes." },
  { title: "Every desktop", body: "The same app on macOS, Windows and Linux, so nobody is left out." },
  { title: "Priority support", body: "A direct line to the people who build it." },
  { title: "Shared dictionary", body: "Company names, product terms and jargon, shared across the team.", soon: true },
  { title: "Admin controls & local-only mode", body: "Enforce settings such as keeping optional AI polish off for everyone.", soon: true },
];

export default function SalesPage() {
  return (
    <Container className="pt-14 sm:pt-20">
      <PageHeader
        eyebrow="Team plan"
        title={`${brand.name} for your team.`}
        intro="Everything in Pro for your whole team, with one invoice and Pro for every seat. Pricing depends on your team; tell us about it and we'll put together a plan."
      />
      <div className="mt-14 grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <Reveal className="glass rounded-[24px] p-6 sm:p-8">
          <h2 className="text-[22px] font-light tracking-[-0.03em]">What you get</h2>
          <ul className="mt-6 space-y-5">
            {points.map((p) => (
              <li key={p.title} className="flex gap-3">
                  <Check className="mt-0.5 size-4 shrink-0 text-foreground/70" />
                  <div>
                    <p className="text-[14.5px] text-foreground">
                      {p.title}
                      {p.soon ? (
                        <span className="ml-2 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-medium text-muted">
                          Coming soon
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{p.body}</p>
                  </div>
                </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.1} className="glass-strong rounded-[24px] p-6 sm:p-8">
          <h2 className="text-[22px] font-light tracking-[-0.03em]">Talk to us</h2>
          <p className="mt-2 text-[13.5px] text-muted">Tell us a little about your team and we’ll get back to you within one business day.</p>
          <div className="mt-6">
            <MailtoForm
              to={emails.sales}
              subject={`${brand.name} for teams — {company}`}
              submitLabel="Send to sales"
              fields={[
                { name: "company", label: "Company", required: true },
                { name: "seats", label: "Seats", type: "number", required: true, placeholder: "e.g. 25" },
                { name: "email", label: "Your email", type: "email", required: true },
                { name: "message", label: "Message", type: "textarea", required: false, placeholder: "Anything we should know — platforms, security review, timeline." },
              ]}
            />
          </div>
        </Reveal>
      </div>
    </Container>
  );
}
