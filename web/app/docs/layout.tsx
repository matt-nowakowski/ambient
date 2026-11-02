import { DocsNav } from "@/components/docs-nav";
import { Container } from "@/components/ui";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Container className="pt-14 sm:pt-20">
      <div className="grid gap-10 md:grid-cols-[180px_1fr] md:gap-16">
        <DocsNav />
        <article className="glass min-w-0 max-w-2xl space-y-10 rounded-[24px] px-6 py-10 text-[14.5px] leading-relaxed text-muted sm:px-10 [&_strong]:font-normal [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5">
          {children}
        </article>
      </div>
    </Container>
  );
}
