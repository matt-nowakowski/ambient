import type { ReactNode } from "react";
import { company } from "@/lib/brand";
import { Container } from "./ui";

/** Plain-English legal document in a glass panel, with a draft notice and a table of contents. */
export function LegalPage({
  title,
  effective,
  intro,
  sections,
}: {
  title: string;
  effective: string;
  intro: ReactNode;
  sections: { id: string; title: string; body: ReactNode }[];
}) {
  return (
    <Container className="pt-14 sm:pt-20">
      <article className="mx-auto max-w-3xl">
        <header>
          <p className="eyebrow">Legal</p>
          <h1 className="mt-4 text-[42px] font-extralight leading-[1.04] tracking-[-0.05em] sm:text-[56px]">{title}</h1>
          <p className="eyebrow mt-4">Effective {effective}</p>
          <div className="mt-6 text-[15px] leading-relaxed text-muted">{intro}</div>
        </header>

        <nav aria-label="Contents" className="glass mt-10 rounded-[20px] p-5 sm:p-6">
          <p className="eyebrow">Contents</p>
          <ol className="mt-3 grid gap-x-8 gap-y-1.5 text-[13.5px] sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-muted transition-colors hover:text-foreground">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="glass mt-4 space-y-10 rounded-[24px] px-6 py-10 text-[14.5px] leading-relaxed text-muted sm:px-10 [&_a]:text-foreground [&_a]:underline [&_a]:decoration-border-strong [&_a]:underline-offset-4 [&_li]:pl-1 [&_strong]:font-normal [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_p+p]:mt-3 [&_p+ul]:mt-3 [&_ul+p]:mt-3">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-28">
              <h2 id={`${s.id}-h`} className="mb-3 text-[20px] font-light tracking-[-0.025em] text-foreground">
                {i + 1}. {s.title}
              </h2>
              {s.body}
            </section>
          ))}
        </div>

        <p className="mt-6 px-1 text-[12.5px] text-subtle">
          {company.legalName} · {company.jurisdiction} · Registered with {company.freeZoneAuthority}
        </p>
      </article>
    </Container>
  );
}
