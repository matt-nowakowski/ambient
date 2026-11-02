import type { CSSProperties } from "react";
import { Orb, type OrbVariant } from "./orb/Orb";

/**
 * Orb families fill different fractions of their box, so equal `size` is not
 * equal visual size. Sizes below give a ~13px visual footprint (same table as
 * the desktop app's Sidebar `ORB_FOOTPRINT`); scale proportionally.
 */
const ORB_FOOTPRINT: Record<string, number> = { S: 20, C: 19, M: 21, B: 18, G: 22 };

/**
 * Vertical optical correction (px at a 13px footprint) for an orb centred
 * (flex items-center) next to a text label. Tuned by eye against capitalised
 * labels ("Free", "Pro", "Team"): the optical centre sits between the
 * x-height and cap-height centres, so these are small.
 */
const ORB_NUDGE: Record<string, number> = { G: 0.5, S: 1, C: 0, M: 0, B: 0 };

/** Resting inks lifted so orbs read as icons, not faint activity indicators. */
const ORB_ICON_STYLE = {
  "--orb-fg": "currentColor",
  "--orb-rest-ink": "0.5",
  "--orb-dim-ink": "0.35",
  "--orb-ring-rest-ink": "0.55",
} as CSSProperties;

export function orbIconSize(variant: OrbVariant, footprint = 13) {
  const family = variant[0];
  const k = footprint / 13;
  return {
    size: Math.round((ORB_FOOTPRINT[family] ?? 18) * k),
    nudge: (ORB_NUDGE[family] ?? 0) * k,
  };
}

/** An orb used as an icon, optically sized and nudged. */
export function OrbIcon({
  variant,
  footprint = 13,
  label,
  className = "",
}: {
  variant: OrbVariant;
  footprint?: number;
  label?: string;
  className?: string;
}) {
  const { size, nudge } = orbIconSize(variant, footprint);
  return (
    <span className={`inline-flex shrink-0 ${className}`} style={nudge ? { transform: `translateY(${nudge}px)` } : undefined}>
      <Orb variant={variant} size={size} label={label} style={ORB_ICON_STYLE} />
    </span>
  );
}
