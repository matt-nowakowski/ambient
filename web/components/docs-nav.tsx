"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { brand } from "@/lib/brand";
import { guidePage } from "@/lib/guide";

const link = (slug: Parameters<typeof guidePage>[0]) => ({ href: guidePage(slug).path, label: guidePage(slug).nav });

const groups = [
  {
    title: "Get started",
    links: [link("getting-started"), { href: "/download", label: "Download" }, { href: "/docs/linux", label: "Linux setup" }],
  },
  {
    title: `Using ${brand.name}`,
    links: [link("answers"), link("actions"), link("recall"), link("meetings"), link("suggestions")],
  },
  {
    title: "Privacy & security",
    links: [
      { href: "/docs/privacy", label: "Privacy controls" },
      { href: "/privacy", label: "Privacy policy" },
    ],
  },
  {
    title: "Help & account",
    links: [
      { href: "/docs/troubleshooting", label: "Troubleshooting" },
      { href: "/pricing", label: "Plans & billing" },
      { href: "/contact", label: "Contact" },
    ],
  },
];

/** Docs sidebar: small group headers, tight rows, the current page marked. */
export function DocsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Docs" className="grid grid-cols-2 gap-x-6 gap-y-6 md:sticky md:top-28 md:block md:self-start">
      {groups.map((g, i) => (
        <div key={g.title} className={i > 0 ? "md:mt-6" : ""}>
          <p className="text-[11px] font-medium tracking-[0.01em] text-subtle">{g.title}</p>
          <ul className="mt-2 space-y-0.5 md:-ml-2">
            {g.links.map((n) => {
              const active = pathname === n.href;
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-md py-1 text-[13px] leading-snug transition-colors md:px-2 ${
                      active ? "bg-foreground/[0.06] text-foreground" : "text-muted hover:text-foreground"
                    }`}
                  >
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
