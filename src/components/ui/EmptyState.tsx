import React from "react";
import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { softSpring } from "./Motion";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/** A calm, centered empty state: floating glass icon, title, hint, action. */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  className = "",
}) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={softSpring}
    className={`flex flex-col items-center justify-center px-6 py-14 text-center ${className}`}
  >
    <motion.div
      animate={{ y: [0, -5, 0] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      className="glass mb-5 grid size-14 place-items-center rounded-card"
    >
      <Icon width={22} height={22} strokeWidth={1.6} className="text-ink-2" />
    </motion.div>
    <h3 className="text-heading font-normal">{title}</h3>
    {description && (
      <p className="mt-1.5 max-w-xs text-ui text-ink-2">{description}</p>
    )}
    {action && <div className="mt-5">{action}</div>}
  </motion.div>
);
