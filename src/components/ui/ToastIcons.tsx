import React from "react";
import {
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { Orb } from "../orb/Orb";

/** A muted lucide icon; the status colour is only a tiny dot on it. */
const StatusIcon: React.FC<{
  icon: LucideIcon;
  dot?: string;
}> = ({ icon: Icon, dot }) => (
  <>
    <Icon width={15} height={15} strokeWidth={1.75} />
    {dot && (
      <span
        aria-hidden="true"
        className="ambient-toast-dot"
        style={{ background: dot }}
      />
    )}
  </>
);

/** Icons for every sonner variant, in the app's monochrome style. */
export const toastIcons = {
  success: <StatusIcon icon={CircleCheck} dot="var(--color-moss)" />,
  error: <StatusIcon icon={CircleAlert} dot="var(--color-error)" />,
  warning: <StatusIcon icon={TriangleAlert} dot="var(--color-warning)" />,
  info: <StatusIcon icon={Info} />,
  // AICSS orb (Ring "Loading") instead of sonner's spinner.
  loading: (
    <Orb
      variant="C1"
      size={15}
      style={{ "--orb-fg": "currentColor" } as React.CSSProperties}
    />
  ),
  close: <X width={10} height={10} strokeWidth={2} />,
};
