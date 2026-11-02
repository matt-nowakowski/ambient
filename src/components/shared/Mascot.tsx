import React from "react";
import { BrandMark } from "../icons/BrandMark";

interface MascotProps {
  /** Height in px. */
  size: number;
  /** Rise once on arrival, or pulse on a high five (re-key it to play again). */
  animation?: "wave" | "slap" | null;
}

/** The orb's own stage size (Orb.tsx); larger orbs are scaled up from it. */
const ORB_STAGE = 28;

/**
 * The brand mark in onboarding's character slot, optionally animated.
 * Drawn at the orb's stage size and zoomed, not transform-scaled: WebKit
 * rasterizes the orb's animated, blurred circles at their layout size, so a
 * scale() blows up a 28px bitmap and the mark looks pixelated. `zoom` lays
 * it out at full size instead, so it stays sharp.
 */
export const Mascot: React.FC<MascotProps> = ({ size, animation = null }) => (
  <span
    style={{ width: size, height: size }}
    className={`relative block select-none ${animation === "wave" ? "animate-rise" : animation === "slap" ? "animate-slap" : ""}`}
  >
    <span className="block" style={{ zoom: size / ORB_STAGE }}>
      <BrandMark width={ORB_STAGE} height={ORB_STAGE} />
    </span>
  </span>
);
