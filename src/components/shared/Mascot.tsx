import React from "react";
import { BrandMark } from "../icons/BrandMark";

interface MascotProps {
  /** Height in px. */
  size: number;
  /** Rise once on arrival, or pulse on a high five (re-key it to play again). */
  animation?: "wave" | "slap" | null;
}

/** The brand mark in onboarding's character slot, optionally animated. */
export const Mascot: React.FC<MascotProps> = ({ size, animation = null }) => (
  <span
    style={{ width: size, height: size }}
    className={`relative block select-none ${animation === "wave" ? "animate-rise" : animation === "slap" ? "animate-slap" : ""}`}
  >
    <BrandMark width={size} height={size} />
  </span>
);
