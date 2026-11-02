import React from "react";
import {
  bindingKeys,
  isOnlyModifiers,
  keycapLabel,
  keycapLabels,
  type OSType,
} from "@/lib/utils/keyboard";

interface KeycapsProps {
  /** The binding to draw, e.g. "option+space". */
  binding: string;
  osType: OSType;
  /** sm: standalone; screen: Demo's drawn screen; line: inline in body text. */
  size?: "sm" | "screen" | "line";
  /** Draw every key as held down. */
  pressed?: boolean;
  /** A combination still being captured: dashed, no drop. */
  partial?: boolean;
  /** Raise the keys on hover/focus of a parent `group/keycaps` control. */
  lift?: boolean;
  className?: string;
}

const SIZES = {
  sm: "h-[30px] min-w-[30px] px-[9px] rounded-chip text-small",
  screen: "h-[24px] min-w-[24px] px-[7px] rounded-chip text-meta",
  line: "h-[25px] min-w-[25px] px-[7px] rounded-chip text-ui",
};

/** A shortcut binding drawn as physical keycaps. */
export const Keycaps: React.FC<KeycapsProps> = ({
  binding,
  osType,
  size = "sm",
  pressed = false,
  partial = false,
  lift = false,
  className = "",
}) => {
  const labels = keycapLabels(binding, osType);
  // Glassy keys with a soft 2px base; pressing sinks the key onto it.
  const base = "color-mix(in srgb, var(--color-plum) 22%, transparent)";
  const state = pressed
    ? "translate-y-[2px] shadow-none bg-plum text-background border-plum"
    : partial
      ? "translate-y-[2px] shadow-none border-dashed bg-glass-strong text-plum border-plum-pick"
      : `bg-glass-strong text-plum border-glass-edge shadow-[0_2px_0_0_var(--keycap-base),0_3px_8px_-2px_rgba(0,0,0,0.12)] ${
          lift
            ? "group-hover/keycaps:-translate-y-[2px] group-hover/keycaps:shadow-[0_4px_0_0_var(--keycap-base),0_6px_14px_-4px_rgba(0,0,0,0.18)] group-focus-visible/keycaps:-translate-y-[2px] group-focus-visible/keycaps:shadow-[0_4px_0_0_var(--keycap-base),0_6px_14px_-4px_rgba(0,0,0,0.18)]"
            : ""
        }`;

  return (
    <span
      className={`inline-flex items-center gap-[4px] align-middle ${className}`}
      style={{ ["--keycap-base" as string]: base }}
      role="img"
      aria-label={keycapLabel(binding, osType)}
    >
      {labels.map((label, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`relative inline-flex items-center justify-center border font-display font-medium leading-none select-none transition-[transform,box-shadow,background-color] duration-[70ms] ease-out ${SIZES[size]} ${state}`}
        >
          {label}
        </span>
      ))}
    </span>
  );
};

const SLOT_SIZES = {
  sm: "h-[30px] min-w-[88px] px-[9px] rounded-chip text-small",
  line: "h-[25px] min-w-[64px] px-[8px] rounded-chip text-ui",
};

/** Placeholder key shown while a shortcut is being captured. */
export const KeySlot: React.FC<
  React.HTMLAttributes<HTMLSpanElement> & { size?: "sm" | "line" }
> = ({ size = "sm", className = "", children, ...rest }) => (
  <span
    aria-hidden={children ? undefined : true}
    {...rest}
    className={`inline-flex translate-y-[2px] items-center justify-center whitespace-nowrap border border-dashed border-plum-pick font-display font-medium leading-none text-ink-2 animate-key-slot motion-reduce:animate-none ${SLOT_SIZES[size]} ${className}`}
  >
    {children}
  </span>
);

/**
 * The instruction while capturing: modifiers alone still need a key, and a
 * lone typing key was refused for want of a modifier.
 */
export const captureHintKey = (partial: string, refused = false) =>
  refused
    ? "onboarding.demo.addModifier"
    : isOnlyModifiers(bindingKeys(partial))
      ? "onboarding.demo.addKey"
      : "onboarding.demo.pressKeys";

/** While capturing: the keys pressed so far, dashed, or an empty slot before any. */
export const CapturedKeys: React.FC<{
  partial: string;
  osType: OSType;
  size?: "sm" | "line";
  /** On the keys and the slot alike. */
  className?: string;
  keysClassName?: string;
  slotClassName?: string;
  /** Words in the empty slot, announced. */
  slotLabel?: string;
}> = ({
  partial,
  osType,
  size = "sm",
  className = "",
  keysClassName = "",
  slotClassName = "",
  slotLabel,
}) =>
  bindingKeys(partial).length ? (
    <Keycaps
      binding={partial}
      osType={osType}
      size={size}
      partial
      className={`${className} ${keysClassName}`}
    />
  ) : (
    <KeySlot
      size={size}
      role={slotLabel ? "status" : undefined}
      className={`${className} ${slotClassName}`}
    >
      {slotLabel}
    </KeySlot>
  );
