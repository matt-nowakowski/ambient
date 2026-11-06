import React from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";

/** Snappy spring for UI that should "pop" (pressable things, indicators). */
export const spring = {
  type: "spring",
  stiffness: 420,
  damping: 32,
  mass: 0.8,
} as const;

/** Softer spring for larger surfaces entering the screen. */
export const softSpring = {
  type: "spring",
  stiffness: 220,
  damping: 28,
} as const;

export const easeOutSoft = [0.22, 1, 0.36, 1] as const;

/** Expand/collapse in place: the height folds and the content fades. Spread
 * on a motion element with `overflow-hidden`, inside AnimatePresence. */
export const expand = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto" },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.26, ease: easeOutSoft },
} as const;

/** Cross-fades between pages keyed by `id`: rise in with a hint of blur. */
export const PageTransition: React.FC<{
  id: string;
  className?: string;
  children: React.ReactNode;
}> = ({ id, className = "", children }) => (
  <AnimatePresence mode="wait" initial={false}>
    <motion.div
      key={id}
      className={className}
      initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
      transition={{ duration: 0.26, ease: easeOutSoft }}
    >
      {children}
    </motion.div>
  </AnimatePresence>
);

const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
};

const staggerChild: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: softSpring },
};

/** Children wrapped in `StaggerItem` animate in one after another. */
export const Stagger: React.FC<{
  className?: string;
  children: React.ReactNode;
  as?: "div" | "ul";
}> = ({ className, children, as = "div" }) => {
  const Comp = as === "ul" ? motion.ul : motion.div;
  return (
    <Comp
      className={className}
      variants={staggerParent}
      initial="hidden"
      animate="show"
    >
      {children}
    </Comp>
  );
};

export const StaggerItem: React.FC<{
  className?: string;
  children: React.ReactNode;
  as?: "div" | "li";
}> = ({ className, children, as = "div" }) => {
  const Comp = as === "li" ? motion.li : motion.div;
  return (
    <Comp className={className} variants={staggerChild}>
      {children}
    </Comp>
  );
};
