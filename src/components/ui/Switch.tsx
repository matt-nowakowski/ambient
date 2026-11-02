import React, { useState } from "react";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Names the switch for assistive tech when no visible label points at it. */
  ariaLabel?: string;
  /** The id of a visible label that names the switch. */
  ariaLabelledBy?: string;
}

/** The on/off switch on its own; ToggleSwitch puts it in a settings row. */
export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
  ariaLabelledBy,
}) => {
  // transitions.dev "Toggle": the bounce plays only after a press, never on mount.
  const [init, setInit] = useState(false);
  return (
    <label
      className={`flex items-center ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        value=""
        className="sr-only peer"
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          setInit(true);
          onChange(e.target.checked);
        }}
      />
      <div
        data-on={checked ? "true" : "false"}
        className={`t-toggle relative h-[22px] w-[38px] rounded-full bg-glass-press peer-focus-visible:ring-2 peer-focus-visible:ring-logo-primary/25 peer-checked:bg-background-ui peer-disabled:opacity-40 peer-active:*:scale-x-110 ${init ? "is-init" : ""}`}
      >
        <span
          className={`t-toggle-thumb absolute start-[2px] top-[2px] size-[18px] rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.25),0_0_0_0.5px_rgba(0,0,0,0.04)] transition-[scale,background-color] duration-200 ${
            checked ? "bg-on-primary" : "bg-white"
          }`}
        />
      </div>
    </label>
  );
};
