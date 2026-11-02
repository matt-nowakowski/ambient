import React from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * DoneMark (shared/DoneMark.tsx), drawn on: the disc springs in, the tick
 * draws itself, and a ring ripples out once.
 */
export const DrawnCheck: React.FC<{ size?: number }> = ({ size = 16 }) => {
  const reduce = useReducedMotion();
  return (
    <span
      aria-hidden="true"
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      {!reduce && <span className="onb-ripple" />}
      <motion.span
        className="inline-grid size-full place-items-center rounded-full bg-moss text-background"
        initial={reduce ? false : { scale: 0.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 520, damping: 18 }}
      >
        <svg
          width={size * 0.69}
          height={size * 0.69}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <motion.path
            d="M5 12.5l4.5 4.5L19 7.5"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.38, delay: 0.14, ease: "easeOut" }}
          />
        </svg>
      </motion.span>
    </span>
  );
};
