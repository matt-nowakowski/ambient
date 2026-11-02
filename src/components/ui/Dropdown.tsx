import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePresence } from "./Transitions";

export interface DropdownOption {
  value: string;
  label: React.ReactNode;
  description?: string;
  disabled?: boolean;
}

interface DropdownProps {
  options: DropdownOption[];
  className?: string;
  menuClassName?: string;
  selectedValue: string | null;
  onSelect: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onOpen?: () => void;
  /** Where the menu opens: below the button (default), or above it. */
  placement?: "below" | "above";
  /** Highlight colour for hover and selection. */
  tone?: "brand" | "neutral";
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  selectedValue,
  onSelect,
  className = "",
  menuClassName,
  placeholder = "Select an option...",
  disabled = false,
  onOpen,
  placement = "below",
  tone = "brand",
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // transitions.dev "Menu dropdown": grows from the button, shrinks away on close.
  const menu = usePresence(isOpen && !disabled);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const hover = "hover:bg-glass-hover";
  const selected = "bg-glass-press";

  const selectedOption = options.find(
    (option) => option.value === selectedValue,
  );

  const handleSelect = (value: string) => {
    onSelect(value);
    setIsOpen(false);
  };

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) onOpen?.();
    setIsOpen(!isOpen);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        className={`h-control px-3 text-ui bg-glass-strong border-[0.5px] border-glass-edge shadow-card rounded-control min-w-[200px] w-full text-start grid grid-cols-[1fr_auto] gap-2 items-center transition-all duration-150 active:scale-[0.98] ${
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "hover:bg-glass cursor-pointer"
        }`}
        onClick={handleToggle}
        disabled={disabled}
        aria-expanded={isOpen}
      >
        <span className="truncate">{selectedOption?.label || placeholder}</span>
        <svg
          className={`w-3.5 h-3.5 text-ink-3 transition-transform duration-300 ease-[var(--spring)] ${isOpen ? "transform rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {menu.mounted && (
        <div
          data-origin={placement === "above" ? "bottom-center" : "top-center"}
          className={`t-dropdown ${menu.className} absolute ${placement === "above" ? "bottom-full mb-1.5" : "top-full mt-1.5"} glass-strong rounded-card p-1 z-50 max-h-60 overflow-y-auto ${
            menuClassName ?? "left-0 right-0"
          }`}
        >
          {options.length === 0 ? (
            <div className="px-2 py-1 text-small text-ink-3">
              {t("common.noOptionsFound")}
            </div>
          ) : (
            options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`w-full rounded-tip text-ui text-start ${hover} transition-colors duration-150 ${
                  option.description ? "px-3 py-2" : "px-2.5 py-1.5"
                } ${
                  selectedValue === option.value ? selected : ""
                } ${option.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                onClick={() => handleSelect(option.value)}
                disabled={option.disabled}
              >
                <span
                  className={`block whitespace-normal break-words ${
                    option.description || selectedValue === option.value
                      ? "font-medium"
                      : ""
                  }`}
                >
                  {option.label}
                </span>
                {option.description && (
                  <span className="mt-0.5 block whitespace-normal text-meta font-normal text-ink-3">
                    {option.description}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
