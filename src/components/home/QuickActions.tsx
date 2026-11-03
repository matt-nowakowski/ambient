/*
 * A "+" that splits into actions like liquid droplets (liquid-gooey morph;
 * MIT, Jakub Antalik). Closed, the action pills shrink into the "+" and
 * share its liquid; open, they bead off to its side.
 */
import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Liquid } from "liquid-gooey";
import { FilePlus, History, Plus } from "lucide-react";

const PLUS = 36;
const PILL_W = 168;
const PILL_H = 30;
// Space between the "+" and the pills, and between the two pills. The goo
// bridges anything closer than ~2x its blur, so these stay well above that
// or the resting pills melt into one shape.
const GAP = 12;
const PILL_GAP = 16;
const HEIGHT = PILL_H * 2 + PILL_GAP + 12;
/** No goo on Linux (main.tsx sets `data-platform` before render). */
const SIMPLE =
  typeof document !== "undefined" &&
  document.documentElement.dataset.platform === "linux";

interface QuickAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  run: () => void;
}

export const QuickActions: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTranscribeFile: () => void;
  onOpenHistory: () => void;
}> = ({ open, onOpenChange, onTranscribeFile, onOpenHistory }) => {
  const { t, i18n } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  // Offsets are physical px; flip them right-to-left.
  const sign = i18n.dir() === "rtl" ? -1 : 1;

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open, onOpenChange]);

  const actions: QuickAction[] = [
    {
      key: "file",
      label: t("home.quickActions.transcribeFile"),
      icon: <FilePlus width={13} height={13} strokeWidth={1.75} />,
      run: onTranscribeFile,
    },
    {
      key: "history",
      label: t("home.quickActions.openHistory"),
      icon: <History width={13} height={13} strokeWidth={1.75} />,
      run: onOpenHistory,
    },
  ];

  // Closed: each pill's centre sits on the "+" centre, shrunk into it.
  const closedX = sign * (PILL_W / 2 - PLUS / 2);
  const openX = -sign * (PLUS + GAP);
  const pillTop = (HEIGHT - PILL_H) / 2;

  // WebKitGTK (Linux) renders the goo's SVG blur filter slowly and unevenly:
  // there the pills slide out of the "+" as plain glass, no melting.
  if (SIMPLE) {
    const glassPill =
      "glass-strong rounded-full shadow-[0_0.5px_1.5px_rgba(0,0,0,0.08),0_8px_20px_-10px_rgba(0,0,0,0.25)]";
    return (
      <div
        ref={ref}
        className="relative shrink-0"
        style={{ width: PLUS, height: PLUS }}
      >
        {actions.map((a, i) => {
          const y = (i === 0 ? -1 : 1) * (PILL_H / 2 + PILL_GAP / 2);
          return (
            <button
              key={a.key}
              type="button"
              tabIndex={open ? 0 : -1}
              aria-hidden={!open}
              onClick={() => {
                onOpenChange(false);
                a.run();
              }}
              style={{
                width: PILL_W,
                height: PILL_H,
                position: "absolute",
                top: (PLUS - PILL_H) / 2,
                insetInlineEnd: 0,
                transform: open
                  ? `translate(${openX}px, ${y}px) scale(1)`
                  : `translate(${closedX}px, 0) scale(0.2)`,
                transitionDelay: open ? `${i * 40}ms` : "0ms",
              }}
              className={`${glassPill} flex cursor-pointer items-center gap-2 px-3 text-small font-medium text-text transition-[transform,opacity] duration-300 ease-[var(--spring)] hover:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/25 ${
                open ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              {a.icon}
              <span className="truncate">{a.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          aria-expanded={open}
          aria-label={t("home.quickActions.label")}
          title={t("home.quickActions.label")}
          onClick={() => onOpenChange(!open)}
          style={{ width: PLUS, height: PLUS }}
          className={`${glassPill} relative grid cursor-pointer place-items-center text-text transition-transform duration-150 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/25`}
        >
          <Plus
            width={16}
            height={16}
            strokeWidth={1.75}
            className="transition-transform duration-300 ease-[var(--spring)]"
            style={{ transform: open ? "rotate(45deg)" : "none" }}
          />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="relative shrink-0"
      style={{ width: PLUS, height: PLUS }}
    >
      <Liquid
        blur={6}
        contrast={20}
        fill="var(--glass-strong)"
        shadow="0 0.5px 1.5px rgba(0,0,0,0.08), 0 8px 20px -10px rgba(0,0,0,0.25)"
        className="pointer-events-none"
        // Inline: the group's own inline `position: relative` beats a class.
        style={{
          position: "absolute",
          width: PILL_W + PLUS + GAP,
          height: HEIGHT,
          insetInlineEnd: 0,
          top: (PLUS - HEIGHT) / 2,
        }}
      >
        {actions.map((a, i) => (
          <Liquid.Item
            key={a.key}
            x={open ? openX : closedX}
            y={open ? (i === 0 ? -1 : 1) * (PILL_H / 2 + PILL_GAP / 2) : 0}
            scale={open ? 1 : 0.2}
            transition="bouncy"
            delay={open ? i * 40 : 0}
            style={{ position: "absolute", top: pillTop, insetInlineEnd: 0 }}
          >
            <button
              type="button"
              tabIndex={open ? 0 : -1}
              aria-hidden={!open}
              onClick={() => {
                onOpenChange(false);
                a.run();
              }}
              style={{ width: PILL_W, height: PILL_H }}
              className={`flex cursor-pointer items-center gap-2 rounded-full px-3 text-small font-medium text-text transition-opacity duration-200 hover:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/25 ${
                open ? "pointer-events-auto opacity-100 delay-100" : "opacity-0"
              }`}
            >
              {a.icon}
              <span className="truncate">{a.label}</span>
            </button>
          </Liquid.Item>
        ))}
        <Liquid.Item
          style={{
            position: "absolute",
            top: (HEIGHT - PLUS) / 2,
            insetInlineEnd: 0,
          }}
        >
          <button
            type="button"
            aria-expanded={open}
            aria-label={t("home.quickActions.label")}
            title={t("home.quickActions.label")}
            onClick={() => onOpenChange(!open)}
            style={{ width: PLUS, height: PLUS }}
            className="pointer-events-auto grid cursor-pointer place-items-center rounded-full text-text transition-transform duration-150 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/25"
          >
            <Plus
              width={16}
              height={16}
              strokeWidth={1.75}
              className="transition-transform duration-300 ease-[var(--spring)]"
              style={{ transform: open ? "rotate(45deg)" : "none" }}
            />
          </button>
        </Liquid.Item>
      </Liquid>
    </div>
  );
};
