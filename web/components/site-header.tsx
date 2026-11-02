import Link from "next/link";
import { brand } from "@/lib/brand";
import { Logo } from "./logo";

// Essentials only. Privacy is a landing section (linked from the footer), and
// the policy lives at /privacy, also in the footer.
const links = [
  { href: "/features", label: "Features", mobile: false },
  { href: "/pricing", label: "Pricing", mobile: true },
  { href: "/docs/getting-started", label: "Docs", mobile: true },
];

/** Thin floating smoked-glass bar. */
export function SiteHeader() {
  return (
    <header data-site-chrome className="pointer-events-none fixed inset-x-0 top-3 z-40 px-3 sm:top-4">
      <div className="glass-dark pointer-events-auto mx-auto flex h-11 max-w-[760px] items-center justify-between gap-4 rounded-full pl-4 pr-1.5">
        <Link href="/" aria-label={`${brand.name} home`} className="shrink-0 rounded-full">
          <Logo size="md" className="text-white" />
        </Link>
        <div className="flex items-center gap-4 sm:gap-6">
          <nav aria-label="Primary" className="flex items-center gap-4 sm:gap-5">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`${l.mobile ? "" : "hidden sm:inline"} text-[12.5px] font-medium text-white/60 transition-colors hover:text-white`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/download"
            className="inline-flex h-8 items-center rounded-full bg-white px-3.5 text-[12px] font-medium text-[#0a0a0a] transition-transform duration-200 ease-spring active:scale-[0.97] motion-reduce:transition-none"
          >
            Download
          </Link>
        </div>
      </div>
    </header>
  );
}
