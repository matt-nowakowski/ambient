import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  bindingKeys,
  DOUBLE_TAP_PREFIX,
  formatKeyCombination,
  isDoubleTapBinding,
  isModifierOnlyBinding,
} from "../../lib/utils/keyboard";
import { showError } from "../../lib/errors";
import { ResetButton } from "../ui/ResetButton";
import { SettingContainer } from "../ui/SettingContainer";
import { Switch } from "../ui/Switch";
import { Tooltip } from "../ui/Tooltip";
import { useSettings } from "../../hooks/useSettings";
import { useOsType } from "../../hooks/useOsType";
import { useShortcutCapture } from "../../hooks/useShortcutCapture";
import { usePressAway } from "../../hooks/usePressAway";

interface ShortcutInputProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  shortcutId: string;
  disabled?: boolean;
}

/**
 * A binding's shortcut; click to record a new one. Clicking elsewhere cancels;
 * Escape is recorded like any key (Cancel's default is Escape).
 */
export const ShortcutInput: React.FC<ShortcutInputProps> = ({
  descriptionMode = "tooltip",
  grouped = false,
  shortcutId,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const { getSetting, resetBinding, updateBinding, isUpdating, isLoading } =
    useSettings();
  const osType = useOsType();
  const { capturing, partial, refused, refusedMouse, start, cancel } =
    useShortcutCapture(shortcutId, osType);
  const shortcutRef = useRef<HTMLDivElement | null>(null);

  const bindings = getSetting("bindings") || {};

  usePressAway(capturing, shortcutRef, cancel);

  // If still loading, show loading state
  if (isLoading) {
    return (
      <SettingContainer
        title={t("settings.general.shortcut.title")}
        description={t("settings.general.shortcut.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      >
        <div className="text-small text-ink-3">
          {t("settings.general.shortcut.loading")}
        </div>
      </SettingContainer>
    );
  }

  // If no bindings are loaded, show empty state
  if (Object.keys(bindings).length === 0) {
    return (
      <SettingContainer
        title={t("settings.general.shortcut.title")}
        description={t("settings.general.shortcut.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      >
        <div className="text-small text-ink-3">
          {t("settings.general.shortcut.none")}
        </div>
      </SettingContainer>
    );
  }

  const binding = bindings[shortcutId];
  if (!binding) {
    return (
      <SettingContainer
        title={t("settings.general.shortcut.title")}
        description={t("settings.general.shortcut.notFound")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      >
        <div className="text-small text-ink-3">
          {t("settings.general.shortcut.none")}
        </div>
      </SettingContainer>
    );
  }

  // Get translated name and description for the binding
  const translatedName = t(
    `settings.general.shortcut.bindings.${shortcutId}.name`,
    binding.name,
  );
  const translatedDescription = t(
    `settings.general.shortcut.bindings.${shortcutId}.description`,
    binding.description,
  );

  // A double tap only makes sense on a key held for its own sake, and only the
  // ambient-keys backend can watch for one.
  const canDoubleTap =
    getSetting("keyboard_implementation") === "ambient_keys" &&
    isModifierOnlyBinding(binding.current_binding);

  const setDoubleTap = async (on: boolean) => {
    const base = bindingKeys(binding.current_binding).join("+");
    try {
      await updateBinding(shortcutId, on ? DOUBLE_TAP_PREFIX + base : base);
    } catch (error) {
      showError("settings", error, { title: t("errors.titles.shortcut") });
    }
  };

  return (
    <SettingContainer
      title={translatedName}
      description={translatedDescription}
      descriptionMode={descriptionMode}
      grouped={grouped}
      disabled={disabled}
      layout="horizontal"
    >
      <div className="flex items-center space-x-1">
        {capturing ? (
          <div
            ref={shortcutRef}
            className="h-control-sm px-3 inline-flex items-center rounded-full text-small font-medium border-[0.5px] border-dashed border-ink-3 bg-glass-press animate-pulse"
          >
            {partial
              ? formatKeyCombination(partial, osType)
              : refusedMouse
                ? t("settings.general.shortcut.keepClicks")
                : refused
                  ? t("onboarding.demo.addModifier")
                  : t("settings.general.shortcut.pressKeys")}
          </div>
        ) : (
          <div
            className="h-control-sm px-3 inline-flex items-center rounded-full text-small font-medium bg-glass-strong border-[0.5px] border-glass-edge shadow-card cursor-pointer transition-[transform,background-color] duration-150 hover:bg-glass active:scale-[0.96]"
            onClick={start}
          >
            {formatKeyCombination(binding.current_binding, osType)}
          </div>
        )}
        {!capturing && canDoubleTap && (
          <Tooltip text={t("settings.general.shortcut.doubleTap.description")}>
            <span className="inline-flex items-center gap-2 ps-1">
              <span className="text-small text-ink-3">
                {t("settings.general.shortcut.doubleTap.label")}
              </span>
              <Switch
                checked={isDoubleTapBinding(binding.current_binding)}
                onChange={setDoubleTap}
                disabled={isUpdating(`binding_${shortcutId}`) || disabled}
                ariaLabel={t("settings.general.shortcut.doubleTap.label")}
              />
            </span>
          </Tooltip>
        )}
        <ResetButton
          onClick={() => resetBinding(shortcutId)}
          disabled={isUpdating(`binding_${shortcutId}`)}
        />
      </div>
    </SettingContainer>
  );
};
