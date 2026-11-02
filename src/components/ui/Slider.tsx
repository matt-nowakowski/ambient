import React, { useEffect, useState } from "react";
import { SettingContainer } from "./SettingContainer";
import { ResetButton } from "./ResetButton";

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  label: string;
  description: string;
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  showValue?: boolean;
  formatValue?: (value: number) => string;
  onReset?: () => void;
  isResetting?: boolean;
}

export const Slider: React.FC<SliderProps> = ({
  value,
  onChange,
  min,
  max,
  step = 0.01,
  disabled = false,
  label,
  description,
  descriptionMode = "tooltip",
  grouped = false,
  showValue = true,
  formatValue = (v) => v.toFixed(2),
  onReset,
  isResetting = false,
}) => {
  const [dragging, setDragging] = useState(false);

  // The value bubble shows while the thumb is held.
  useEffect(() => {
    if (!dragging) return;
    const end = () => setDragging(false);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [dragging]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseFloat(e.target.value));
  };

  const p =
    max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;

  return (
    <SettingContainer
      title={label}
      description={description}
      descriptionMode={descriptionMode}
      grouped={grouped}
      layout="horizontal"
      disabled={disabled}
    >
      <div className="flex h-control items-center gap-inline">
        <div className="relative flex w-[160px] items-center">
          <input
            type="range"
            aria-label={label}
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={handleChange}
            onPointerDown={() => !disabled && setDragging(true)}
            disabled={disabled}
            className="range w-full"
            style={{ "--range-p": p } as React.CSSProperties}
          />
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-tip bg-plum px-2 py-0.5 text-meta tabular-nums text-background shadow-card transition-[opacity,scale] duration-200 ease-[var(--spring)] ${
              dragging ? "scale-100 opacity-100" : "scale-90 opacity-0"
            }`}
            style={{ left: `calc(8px + (100% - 16px) * ${p})` }}
          >
            {formatValue(value)}
          </span>
        </div>
        {showValue && (
          <span className="w-10 text-end text-small tabular-nums text-ink-2">
            {formatValue(value)}
          </span>
        )}
        {onReset && (
          <ResetButton onClick={onReset} disabled={disabled || isResetting} />
        )}
      </div>
    </SettingContainer>
  );
};
