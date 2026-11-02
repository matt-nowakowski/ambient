import Link from "next/link";
import { company, emails, mailto } from "@/lib/brand";
import { Logo } from "./logo";
import { Container } from "./ui";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/#privacy-promise", label: "Privacy & security" },
      { href: "/pricing", label: "Pricing" },
      { href: "/download", label: "Download" },
      { href: "/changelog", label: "Release notes" },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/docs/getting-started", label: "Getting started" },
      { href: "/docs/troubleshooting", label: "Troubleshooting" },
      { href: "/docs/linux", label: "Linux setup" },
      { href: "/contact", label: "Contact" },
      { href: "/sales", label: "Sales" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer data-site-chrome className="mt-20 sm:mt-32">
      <Container className="pb-10">
        <div className="glass rounded-[28px] px-6 py-10 sm:px-10 sm:py-12">
          <div className="flex flex-col gap-10 md:flex-row md:justify-between">
            <div className="max-w-xs">
              <Logo size="md" />
              <p className="mt-4 text-[13px] leading-relaxed text-muted">
                A private voice agent. Free dictation on macOS, Windows and Linux.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-14">
              {columns.map((col) => (
                <div key={col.title}>
                  <h2 className="eyebrow">{col.title}</h2>
                  <ul className="mt-4 space-y-2.5">
                    {col.links.map((l) => (
                      <li key={l.label}>
                        <Link href={l.href} className="text-[13px] text-muted transition-colors hover:text-foreground">
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-[12px] text-subtle sm:flex-row sm:justify-between">
            <p>
              © {new Date().getFullYear()} {company.legalName}
            </p>
            <p className="flex flex-wrap gap-x-4 gap-y-1">
              {Object.values(emails).map((e) => (
                <a key={e} href={mailto(undefined, e)} className="transition-colors hover:text-foreground">
                  {e}
                </a>
              ))}
            </p>
          </div>
        </div>
      </Container>
    </footer>
  );
}
