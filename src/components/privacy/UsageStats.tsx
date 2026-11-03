import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { SettingsGroup } from "../ui/SettingsGroup";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { WhatsShared } from "../telemetry/WhatsShared";

/** Privacy: the switch for anonymous usage counts (off by default), with
 * the same "What's shared" list as the All set screen. */
export const UsageStats: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const [open, setOpen] = useState(false);
  return (
    <SettingsGroup title={t("privacy.telemetry.title")}>
      <ToggleSwitch
        checked={getSetting("telemetry") ?? false}
        onChange={(on) => updateSetting("telemetry", on)}
        isUpdating={isUpdating("telemetry")}
        label={t("privacy.telemetry.label")}
        description={t("privacy.telemetry.description")}
        descriptionMode="inline"
        grouped
      />
      <div className="px-row-x py-row-y">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-small text-ink-2 hover:text-text"
        >
          {t("telemetry.whatsShared")}
          <ChevronDown
            width={13}
            height={13}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && <WhatsShared className="mt-3" />}
      </div>
    </SettingsGroup>
  );
};
