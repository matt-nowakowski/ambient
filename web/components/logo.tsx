import type { CSSProperties } from "react";
import { brand } from "@/lib/brand";
import { Orb } from "./orb/Orb";

/** Live brand mark: the animated AICSS "Lens" orb (B1). */
export function Mark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <Orb
      variant="B1"
      size={size}
      label={brand.name}
      className={className}
      style={{ "--orb-fg": "currentColor" } as CSSProperties}
    />
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`font-normal tracking-[-0.04em] ${className}`}>{brand.slug}</span>;
}

const LOGO_SIZES = { sm: 14, md: 16, lg: 20 } as const;
export type LogoSize = keyof typeof LOGO_SIZES;

/**
 * The one orb + wordmark lockup used everywhere. Derived from a single font
 * size: orb = round(1.25 × fontSize) (e.g. 20px orb with 16px text), a tight
 * 0.14em gap (the B1 circles only fill the middle of the orb's box), and a
 * ~1px downward nudge so the orb sits on the x-height centre.
 */
export function Logo({ size = "md", className = "text-foreground" }: { size?: LogoSize; className?: string }) {
  const fontSize = LOGO_SIZES[size];
  const orb = Math.round(fontSize * 1.25);
  return (
    <span className={`inline-flex items-center ${className}`} style={{ fontSize, gap: "0.14em" }}>
      <span className="inline-flex" style={{ transform: `translateY(${Math.max(1, Math.round(fontSize * 0.06))}px)` }}>
        <Mark size={orb} />
      </span>
      <Wordmark className="leading-none" />
    </span>
  );
}
