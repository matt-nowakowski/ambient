"use client";

import { MotionConfig, motion, type HTMLMotionProps, type Variants } from "motion/react";
import type { ReactNode } from "react";

export const spring = { type: "spring", stiffness: 260, damping: 26, mass: 0.9 } as const;
export const easeOutSoft = [0.22, 1, 0.36, 1] as const;

/** Respect the OS "reduce motion" setting for every motion component. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

const container: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.7, ease: easeOutSoft } },
};

/** No `filter` in these variants: a filtered ancestor would stop child glass from blurring the page. */
/** Staggered reveal on scroll. Children should be <StaggerItem>. */
export function Stagger({ children, className, ...rest }: HTMLMotionProps<"div">) {
  return (
    <motion.div
      className={className}
      variants={container}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className, ...rest }: HTMLMotionProps<"div">) {
  return (
    <motion.div className={className} variants={item} {...rest}>
      {children}
    </motion.div>
  );
}

/** Single element reveal on scroll. */
export function Reveal({ children, className, delay = 0, ...rest }: HTMLMotionProps<"div"> & { delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.8, ease: easeOutSoft, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Glass card with a springy hover lift. */
export function LiftCard({ children, className, ...rest }: HTMLMotionProps<"div">) {
  return (
    <motion.div
      className={className}
      variants={item}
      whileHover={{ y: -3 }}
      transition={spring}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
