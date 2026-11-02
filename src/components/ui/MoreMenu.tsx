import React, { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { usePresence } from "./Transitions";

export interface MoreMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface MoreMenuProps {
  /** Accessible name of the ⋯ button. */
  label: string;
  items: MoreMenuItem[];
  className?: string;
}

/** A ⋯ button that opens a small menu of actions (right-aligned, below). */
export const MoreMenu: React.FC<MoreMenuProps> = ({
  label,
  items,
  className = "",
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menu = usePresence(open);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`grid size-8 cursor-pointer place-items-center rounded-full text-ink-2 transition-colors hover:bg-glass-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/25 active:scale-95 ${
          open ? "bg-glass-press text-text" : ""
        }`}
      >
        <MoreHorizontal width={16} height={16} strokeWidth={1.75} />
      </button>
      {menu.mounted && (
        <div
          role="menu"
          data-origin="top-right"
          className={`t-dropdown ${menu.className} glass-strong absolute end-0 top-full z-50 mt-1.5 min-w-44 rounded-card p-1`}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`flex w-full cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-tip px-2.5 py-1.5 text-start text-ui transition-colors duration-150 hover:bg-glass-hover disabled:cursor-not-allowed disabled:opacity-50 ${
                item.danger ? "text-error" : "text-text"
              }`}
            >
              {item.icon && (
                <span className="grid size-4 shrink-0 place-items-center opacity-80">
                  {item.icon}
                </span>
              )}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
