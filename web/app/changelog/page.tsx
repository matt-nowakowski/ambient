import type { Metadata } from "next";
import { Reveal } from "@/components/motion";
import { PageHeader } from "@/components/page-header";
import { Container } from "@/components/ui";
import { brand } from "@/lib/brand";
import { changelog } from "@/lib/changelog";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Release notes",
  description: `What’s new in each version of ${brand.name}.`,
  path: "/changelog",
});

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

export default function ChangelogPage() {
  return (
    <Container className="pt-14 sm:pt-20">
      <PageHeader
        eyebrow="Release notes"
        title="What’s new."
        intro={
          <>
            Every version of {brand.name}, newest first. Get the latest on the{" "}
            <a href="/download" className="text-foreground underline decoration-border-strong underline-offset-4">
              download page
            </a>
            .
          </>
        }
      />
      <div className="mt-14 space-y-6">
        {changelog.map((r) => (
          <Reveal key={r.version}>
            <article id={`v${r.version}`} className="glass grid gap-6 rounded-[24px] p-6 sm:grid-cols-[160px_1fr] sm:p-10">
              <div>
                <p className="text-[22px] font-extralight tracking-[-0.03em]">{r.version}</p>
                <p className="eyebrow mt-1">
                  <time dateTime={r.date}>{fmt(r.date)}</time>
                </p>
              </div>
              <div>
                <h2 className="text-[24px] font-light tracking-[-0.03em]">{r.title}</h2>
                <p className="mt-3 text-[14.5px] leading-relaxed text-muted">{r.summary}</p>
                {r.sections.map((s) => (
                  <div key={s.heading} className="mt-7">
                    <h3 className="eyebrow">{s.heading}</h3>
                    <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-muted">
                      {s.items.map((i) => (
                        <li key={i} className="flex gap-3">
                          <span aria-hidden="true" className="mt-[9px] size-1 shrink-0 rounded-full bg-foreground/40" />
                          <span>{i}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </Container>
  );
}
