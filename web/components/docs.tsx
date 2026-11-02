import Link from "next/link";
import type { ReactNode } from "react";
import { guidePages, type GuideSlug } from "@/lib/guide";

/** Shell command block. */
export function Cmd({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-surface px-4 py-3 text-[13px] leading-relaxed text-foreground">
      <code>{children}</code>
    </pre>
  );
}

/** Inline code. */
export function C({ children }: { children: ReactNode }) {
  return (
    <code className="rounded border border-border bg-surface px-1 py-px text-[0.86em] text-foreground">
      {children}
    </code>
  );
}

export function DocSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="scroll-mt-24 border-t border-border pt-10">
      <h2 id={id} className="group text-[22px] font-light tracking-[-0.03em] text-foreground sm:text-[26px]">
        <a href={`#${id}`} className="no-underline">
          {title}
          <span aria-hidden="true" className="ml-2 text-base text-subtle opacity-0 transition-opacity group-hover:opacity-100">
            #
          </span>
        </a>
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function DocHeader({ eyebrow, title, intro }: { eyebrow: string; title: string; intro: ReactNode }) {
  return (
    <header className="mb-12">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-4 text-[40px] font-extralight leading-[1.05] tracking-[-0.05em] text-foreground sm:text-[52px]">{title}</h1>
      <p className="mt-5 text-[15px] leading-relaxed text-muted">{intro}</p>
    </header>
  );
}

/** “Try saying” list: what you say, and what happens. */
export function TrySaying({ items, title = "Try saying" }: { items: readonly { say: string; then: string }[]; title?: string }) {
  return (
    <div>
      <p className="eyebrow">{title}</p>
      <dl className="mt-3">
        {items.map((i, n) => (
          <div key={`${i.say}-${n}`} className="grid gap-1 border-t border-border py-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] sm:gap-6">
            <dt className="text-[14.5px] text-foreground">“{i.say}”</dt>
            <dd className="text-[13.5px] leading-relaxed text-muted">{i.then}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Two-column term/description rows. */
export function DocRows({ items }: { items: readonly { k: string; v: string }[] }) {
  return (
    <dl>
      {items.map((i) => (
        <div key={i.k} className="grid gap-1 border-t border-border py-3.5 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:gap-6">
          <dt className="text-[14px] text-foreground">{i.k}</dt>
          <dd className="text-[13.5px] leading-relaxed text-muted">{i.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A quiet glass note inside a doc. */
export function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="glass rounded-[18px] px-5 py-4">
      <p className="text-[14.5px] text-foreground">{title}</p>
      <div className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{children}</div>
    </aside>
  );
}

/** “Next: …” link to the following guide page. */
export function GuideNext({ slug }: { slug: GuideSlug }) {
  const i = guidePages.findIndex((p) => p.slug === slug);
  const next = guidePages[i + 1];
  if (!next) return null;
  return (
    <nav aria-label="Next page" className="border-t border-border pt-8">
      <Link href={next.path} className="group inline-flex flex-col gap-1">
        <span className="eyebrow">Next</span>
        <span className="text-[18px] font-light tracking-[-0.02em] text-foreground">
          {next.title}
          <span aria-hidden="true" className="ml-2 inline-block transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none">
            →
          </span>
        </span>
      </Link>
    </nav>
  );
}
