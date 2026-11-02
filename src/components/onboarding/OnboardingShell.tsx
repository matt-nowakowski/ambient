import React, { useEffect, useState } from "react";
import { type as osType } from "@tauri-apps/plugin-os";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "motion/react";
import "./motion.css";

const IS_MAC = osType() === "macos";

/**
 * The step last shown, across screens: each screen mounts its own shell, so
 * this is what lets the dashes morph and the screen slide in from the side
 * it came from.
 */
let shownIndex: number | null = null;

const DASH = { on: 28, off: 14 };
const dashSpring = { type: "spring", stiffness: 380, damping: 30 } as const;
const enterSpring = { type: "spring", stiffness: 260, damping: 30 } as const;

/** A View Transition is carrying this change (Demo ↔ Try it): stay still. */
const viewTransitionRunning = () =>
  typeof document !== "undefined" && !!document.documentElement.dataset.sflow;

interface OnboardingShellProps {
  /** Where this screen is in the flow; no dashes on a standalone screen. */
  progress?: { index: number; count: number };
  /** Top right: Welcome's menu language. */
  pill?: React.ReactNode;
  children: React.ReactNode;
  /** The footer's left slot; replaces Back. */
  left?: React.ReactNode;
  onBack?: () => void;
  hint?: React.ReactNode;
  /** Warnings read as warnings, not hints. */
  hintTone?: "quiet" | "warning";
  primary?: React.ReactNode;
  /** Leaving onboarding: the screen eases away before the app replaces it. */
  leaving?: boolean;
}

/** Frame for every onboarding screen: progress dashes, screen, footer. */
export const OnboardingShell: React.FC<OnboardingShellProps> = ({
  progress,
  pill,
  children,
  left,
  onBack,
  hint,
  hintTone = "quiet",
  primary,
  leaving = false,
}) => {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const index = progress?.index ?? null;
  // Decided once per mount: where this screen arrives from.
  const [arrival] = useState(() => {
    const from = shownIndex;
    const still = viewTransitionRunning() || reduce;
    const dir = from == null || index == null ? 0 : Math.sign(index - from);
    return { from, still, dir };
  });
  useEffect(() => {
    if (index != null) shownIndex = index;
  }, [index]);
  // Forget the place once the flow is gone, so a later run starts fresh.
  useEffect(
    () => () => {
      if (leaving) shownIndex = null;
    },
    [leaving],
  );

  const dashWidth = (i: number, at: number) => (i === at ? DASH.on : DASH.off);

  return (
    <div
      data-onboarding=""
      className="relative isolate h-screen w-full flex overflow-hidden bg-background select-none cursor-default"
    >
      <div aria-hidden="true" className="onb-ambient" />
      {/* Disabled buttons go neutral so the only filled one is the next step.
          The column is capped so a long row truncates instead of widening. */}
      <motion.div
        animate={
          leaving
            ? { opacity: 0, scale: reduce ? 1 : 0.97, filter: "blur(6px)" }
            : { opacity: 1, scale: 1, transitionEnd: { filter: "none" } }
        }
        initial={false}
        transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
        className="relative m-auto grid h-[600px] w-[720px] shrink-0 grid-cols-[minmax(0,1fr)] grid-rows-[48px_1fr_76px] font-ui text-body leading-[1.6] text-text antialiased [&_button:disabled]:border-line [&_button:disabled]:bg-wash [&_button:disabled]:text-ink-3 [&_button:disabled]:opacity-100"
      >
        {/* On macOS the traffic lights float over the top-left corner. */}
        <div
          className={`relative flex items-center justify-between pe-[20px] ${IS_MAC ? "ps-[84px]" : "ps-[28px]"}`}
        >
          {progress ? (
            <div
              className="flex gap-[6px]"
              role="img"
              aria-label={t("onboarding.shell.progress", {
                step: progress.index + 1,
                count: progress.count,
              })}
            >
              {Array.from({ length: progress.count }, (_, i) => (
                <motion.i
                  key={i}
                  initial={
                    arrival.from == null || reduce
                      ? false
                      : { width: dashWidth(i, arrival.from) }
                  }
                  animate={{
                    width: dashWidth(i, progress.index),
                    scaleY: i === progress.index ? [1, 1.5, 1] : 1,
                  }}
                  transition={{
                    width: dashSpring,
                    scaleY: { duration: 0.45, ease: "easeOut" },
                  }}
                  className={`h-[4px] rounded-full transition-[background-color] duration-300 ease-glide ${
                    i === progress.index
                      ? "bg-background-ui"
                      : i < progress.index
                        ? "bg-ink-3"
                        : "bg-line"
                  }`}
                />
              ))}
            </div>
          ) : (
            <span />
          )}
          {pill}
        </div>
        <motion.div
          className="min-h-0"
          initial={
            arrival.still
              ? false
              : {
                  opacity: 0,
                  x: arrival.dir * 36,
                  y: arrival.dir ? 0 : 10,
                  filter: "blur(8px)",
                }
          }
          // No filter left behind: it would trap fixed-position descendants.
          animate={{
            opacity: 1,
            x: 0,
            y: 0,
            filter: "blur(0px)",
            transitionEnd: { filter: "none" },
          }}
          transition={{
            ...enterSpring,
            opacity: { duration: 0.3, ease: "easeOut" },
            filter: { duration: 0.34, ease: "easeOut" },
          }}
        >
          {children}
        </motion.div>
        <div className="flex items-center justify-between gap-[16px] px-[28px] pb-[4px]">
          {left ??
            (onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="-ms-[12px] cursor-pointer rounded-full border border-transparent px-[12px] py-[7.5px] text-body font-medium text-ink-2 transition-colors hover:bg-wash hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-logo-primary"
              >
                {t("onboarding.shell.back")}
              </button>
            ) : (
              <span />
            ))}
          <div
            className={`ms-auto min-w-0 text-small ${hintTone === "warning" ? "text-warning" : "text-ink-3"}`}
          >
            {hint}
          </div>
          {primary}
        </div>
      </motion.div>
    </div>
  );
};

/** Horizontal alignment; text is always centred. */
const ALIGN = {
  center: "items-center",
  stretch: "items-stretch",
} as const;

/** Gap between header and content, per layout. */
const GAP = {
  center: "min-h-lead max-h-lead-max flex-[1_1_0]",
  top: "h-lead flex-none",
} as const;

/** A screen's main block: header, gap, content. */
export const ScreenMain = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    align?: keyof typeof ALIGN;
    /** Usually a ScreenHeader. */
    header?: React.ReactNode;
    /** "center" centres everything; "top" pins the header and content fills. */
    layout?: keyof typeof GAP;
  }
>(
  (
    {
      children,
      align = "center",
      header,
      layout = "center",
      className = "",
      ...rest
    },
    ref,
  ) => (
    <div
      ref={ref}
      {...rest}
      className={`flex h-full min-h-0 min-w-0 flex-col ${layout === "center" ? "justify-center-safe" : ""} text-center px-gutter ${className}`}
    >
      {header}
      {header && <div aria-hidden="true" className={GAP[layout]} />}
      <div
        className={`flex min-h-0 w-full flex-col ${layout === "top" ? "flex-1" : ""} ${ALIGN[align]}`}
      >
        {children}
      </div>
    </div>
  ),
);
ScreenMain.displayName = "ScreenMain";

/** A screen's title and subtitle; pass as ScreenMain's header. */
export const ScreenHeader: React.FC<{
  title: React.ReactNode;
  sub?: React.ReactNode;
  subClassName?: string;
  /** Note above the title, out of flow so it doesn't push the title down. */
  above?: React.ReactNode;
}> = ({ title, sub, subClassName, above }) => (
  <div className="relative w-full flex-none">
    {above && (
      <div className="absolute inset-x-0 bottom-full mb-[12px]">{above}</div>
    )}
    <ScreenTitle>{title}</ScreenTitle>
    {sub && <ScreenSub className={subClassName}>{sub}</ScreenSub>}
  </div>
);

export const ScreenTitle: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => (
  <h1
    className={`m-0 font-display text-balance text-title font-light ${className}`}
  >
    {children}
  </h1>
);

export const ScreenSub: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => (
  <p className={`mt-[4px] mb-0 text-ink-2 text-pretty ${className}`}>
    {children}
  </p>
);
