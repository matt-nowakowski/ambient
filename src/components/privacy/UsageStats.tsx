import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useSettings } from "@/hooks/useSettings";
import { SettingsGroup } from "../ui/SettingsGroup";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { expand } from "../ui/Motion";
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
            className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div {...expand} className="overflow-hidden">
              <WhatsShared className="mt-3" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SettingsGroup>
  );
};
