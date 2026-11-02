import type { Metadata } from "next";
import Link from "next/link";
import { MailtoForm } from "@/components/mailto-form";
import { Reveal } from "@/components/motion";
import { PageHeader } from "@/components/page-header";
import { Container, Eyebrow } from "@/components/ui";
import { brand, emails, mailto } from "@/lib/brand";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Contact",
  description: `Get help with ${brand.name}, or just say hello: ${brand.supportEmail}.`,
  path: "/contact",
});

const inboxes = [
  { email: emails.sales, subject: `${brand.name} for teams`, body: "Team plan, invoices, larger rollouts." },
  { email: emails.legal, subject: "Legal request", body: "Privacy and data requests, terms, DPAs." },
];

const links = [
  { href: "/docs/troubleshooting", label: "Troubleshooting", body: "Shortcuts, permissions, pasting." },
  { href: "/docs/linux", label: "Linux setup", body: "Packages, Wayland, paste tools." },
  { href: "/changelog", label: "Release notes", body: "What changed in each version." },
];

export default function ContactPage() {
  return (
    <Container className="page-balanced pb-10 pt-14 sm:pt-20">
      <PageHeader
        eyebrow="Contact"
        title="Talk to a human."
        intro={
          <>
            Email{" "}
            <a href={mailto()} className="text-foreground underline decoration-border-strong underline-offset-4">
              {brand.supportEmail}
            </a>{" "}
            and a person who works on {brand.name} will reply — usually within one business day, faster for Pro and Team.
          </>
        }
      />
      <div className="mt-14 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Reveal className="glass rounded-[24px] p-6 sm:p-8">
          <h2 className="text-[22px] font-light tracking-[-0.03em]">Write to us</h2>
          <p className="mt-2 text-[13.5px] text-muted">
            For a bug, include your OS, {brand.name} version and what you expected to happen.
          </p>
          <div className="mt-6">
            <MailtoForm
              to={brand.supportEmail}
              subject={`${brand.name}: {topic}`}
              fields={[
                { name: "name", label: "Name", required: false },
                { name: "topic", label: "Topic", required: true, placeholder: "e.g. Shortcut doesn’t work on Windows" },
                { name: "message", label: "Message", type: "textarea", required: true },
              ]}
            />
          </div>
        </Reveal>
        <Reveal delay={0.1} className="space-y-3">
          <Eyebrow className="px-1">Faster answers</Eyebrow>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="glass block rounded-[20px] p-5 transition-transform duration-200 ease-spring hover:-translate-y-0.5 active:scale-[0.98] motion-reduce:transition-none"
            >
              <span className="block text-[15px] text-foreground">{l.label}</span>
              <span className="mt-1 block text-[13px] text-muted">{l.body}</span>
            </Link>
          ))}
          <Eyebrow className="px-1 pt-5">Other inboxes</Eyebrow>
          {inboxes.map((i) => (
            <a
              key={i.email}
              href={mailto(i.subject, i.email)}
              className="glass block rounded-[20px] p-5 transition-transform duration-200 ease-spring hover:-translate-y-0.5 active:scale-[0.98] motion-reduce:transition-none"
            >
              <span className="block text-[15px] text-foreground">{i.email}</span>
              <span className="mt-1 block text-[13px] text-muted">{i.body}</span>
            </a>
          ))}
        </Reveal>
      </div>
    </Container>
  );
}
