import React, { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/hooks/useSettings";
import { WhatsShared } from "../telemetry/WhatsShared";
import { useOnboardingStore } from "./onboardingStore";

/** All set's one line: share anonymous usage counts, unchecked by default,
 * with "What's shared" opening the short list. Saved as soon as it's ticked
 * (not in a preview); the same switch lives in Privacy. */
export const TelemetryOptIn: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting } = useSettings();
  const preview = useOnboardingStore((s) => s.preview);
  const saved = getSetting("telemetry") ?? false;
  const [checked, setChecked] = useState(saved);
  const [open, setOpen] = useState(false);
  const id = useId();

  useEffect(() => setChecked(saved), [saved]);

  const toggle = (on: boolean) => {
    setChecked(on);
    if (!preview) updateSetting("telemetry", on);
  };

  return (
    <div className="relative flex items-center gap-2 text-small text-ink-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => toggle(e.target.checked)}
        className="size-3.5 shrink-0 cursor-pointer accent-[var(--color-logo-primary)]"
      />
      <label htmlFor={id} className="cursor-pointer">
        {t("telemetry.optIn")}
      </label>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="shrink-0 text-ink-3 underline underline-offset-2 hover:text-text"
      >
        {t("telemetry.whatsShared")}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t("telemetry.whatsShared")}
          className="glass absolute bottom-full end-0 z-20 mb-2 w-[340px] rounded-card border-[0.5px] border-glass-edge bg-glass-strong p-3 text-start shadow-card"
        >
          <WhatsShared />
        </div>
      )}
    </div>
  );
};
