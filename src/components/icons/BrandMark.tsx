import type { CSSProperties } from "react";
import { BRAND } from "@/lib/brand";
import { Orb, type OrbVariant } from "../orb/Orb";

interface IconProps {
  width?: number | string;
  height?: number | string;
  className?: string;
  /** Which orb animation to play; the brand is the B1 "Lens" orb. */
  variant?: OrbVariant;
}

// Orbs are laid out in px; accept numbers or "NNpx" strings.
const px = (v: number | string | undefined, fallback: number) =>
  typeof v === "number"
    ? v
    : v && /^\d+(\.\d+)?(px)?$/.test(v)
      ? parseFloat(v)
      : fallback;

/** The brand orb alone, in `currentColor` (four circles, focus moving clockwise). */
export const BrandGlyph = ({
  width = 24,
  height,
  className,
  variant = "B1",
}: IconProps) => {
  const size = px(height ?? width, 24);
  return (
    <span
      className={`inline-grid place-items-center ${className ?? ""}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Orb
        variant={variant}
        size={size}
        label={BRAND.name}
        style={{ "--orb-fg": "currentColor" } as CSSProperties}
      />
    </span>
  );
};

/** The brand mark: the orb on its own, in the text color. */
export const BrandMark = (props: IconProps) => (
  <BrandGlyph {...props} className={`text-text ${props.className ?? ""}`} />
);

/** Mark + lowercase wordmark. `size` is the mark in px; set the text size
 * with a `text-*` class on `className`. */
export const BrandWordmark = ({
  className = "",
  size = 22,
}: {
  className?: string;
  size?: number;
}) => (
  <span
    className={`inline-flex items-center gap-[0.14em] font-semibold tracking-[-0.04em] text-text select-none ${className}`}
  >
    {/* The circles fill only the middle of the orb's box, so the gap is
        tight; nudged down so the orb's centre sits on the x-height. */}
    <BrandMark width={size} className="translate-y-[1px]" />
    <span className="leading-none">{BRAND.slug}</span>
  </span>
);
