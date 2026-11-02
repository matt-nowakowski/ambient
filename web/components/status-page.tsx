import Link from "next/link";
import type { ReactNode } from "react";
import { Orb, type OrbVariant } from "./orb/Orb";
import { Reveal } from "./motion";
import { Container } from "./ui";

/** Shared layout for 404 / error pages: a large orb, a light heading, one line, actions. */
export function StatusPage({
  orb,
  label,
  title,
  body,
  actions,
}: {
  orb: OrbVariant;
  label: string;
  title: string;
  body: ReactNode;
  actions: ReactNode;
}) {
  return (
    <Container className="page-balanced py-10">
      <Reveal className="glass mx-auto flex max-w-xl flex-col items-center rounded-[28px] px-6 py-16 text-center sm:py-20">
        <Orb variant={orb} size={112} label={label} style={{ ["--orb-fg" as string]: "currentColor" }} />
        <p className="eyebrow mt-8">{label}</p>
        <h1 className="mt-3 text-balance text-[40px] font-extralight leading-[1.05] tracking-[-0.05em] sm:text-[52px]">
          {title}
        </h1>
        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted">{body}</p>
        <div className="mt-9 flex flex-col items-center gap-2.5 sm:flex-row">{actions}</div>
        <p className="mt-6 text-[13px] text-subtle">
          Still lost?{" "}
          <Link href="/contact" className="text-foreground underline decoration-border-strong underline-offset-4">
            Contact us
          </Link>
        </p>
      </Reveal>
    </Container>
  );
}
