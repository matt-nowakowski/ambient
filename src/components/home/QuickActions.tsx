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
const GAP = 8;
const HEIGHT = 84;

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

  return (
    <div
      ref={ref}
      className="relative shrink-0"
      style={{ width: PLUS, height: PLUS }}
    >
      <Liquid
        blur={7}
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
            y={open ? (i === 0 ? -1 : 1) * (PILL_H / 2 + 5) : 0}
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
