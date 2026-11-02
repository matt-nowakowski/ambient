import type { ReactNode } from "react";
import { RevealLines } from "./hero-copy";
import { Reveal } from "./motion";
import { Eyebrow } from "./ui";

/** Shared page header: small sentence-case label, light display title, short intro. */
export function PageHeader({
  eyebrow,
  title,
  intro,
  center = false,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  center?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`max-w-2xl ${center ? "mx-auto text-center" : ""}`}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="mt-4 text-balance text-[42px] font-extralight leading-[1.04] tracking-[-0.05em] sm:text-[60px]">
        <RevealLines lines={[title]} />
      </h1>
      {intro ? (
        <Reveal delay={0.15}>
          <p className={`mt-5 max-w-xl text-pretty text-[15px] leading-relaxed text-muted ${center ? "mx-auto" : ""}`}>{intro}</p>
        </Reveal>
      ) : null}
      {children}
    </div>
  );
}
