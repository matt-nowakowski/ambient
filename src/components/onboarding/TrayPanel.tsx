import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  keycapLabel,
  spaceDoesNotClick,
  type OSType,
} from "@/lib/utils/keyboard";
import { usePressAway } from "@/hooks/usePressAway";
import { useSettings } from "@/hooks/useSettings";
import { languageList } from "@/lib/constants/languages";
import { CapturedKeys, Keycaps } from "../shared/Keycaps";
import { Switch } from "../ui/Switch";
import TrayIcon from "../icons/TrayIcon";
import { useOnboardingStore } from "./onboardingStore";

interface TrayPanelProps {
  os: OSType;
  languages: string[];
  modelName: string;
  /** The model is on disk. */
  ready: boolean;
  /** Shown while not ready. */
  download: React.ReactNode;
  shortcut: string;
  keysDown: boolean;
  capture: {
    capturing: boolean;
    partial: string;
    start: () => void;
    cancel: () => void;
  };
  atLogin: boolean;
  onAtLogin: (on: boolean) => void;
  onChangeLanguages: () => void;
  onChangeModel: () => void;
  /** Where the tail meets the icon, from the panel's inline-end edge. */
  tailAt: number;
  style?: React.CSSProperties;
}

const Chevron = () => (
  <svg
    viewBox="0 0 16 16"
    width="14"
    height="14"
    aria-hidden="true"
    className="try-panel-chevron"
  >
    <path
      d="M6 3.5 10.5 8 6 12.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Provider ids from settings.rs (as in AiPolishCard).
const HOSTED = "ambient";
const ON_DEVICE = "apple_intelligence";

/** AI polish, off for new installs (dictation types instantly; smart
 * writing still drafts when asked): saved the moment it's switched (not in a
 * preview), like Account's AI polish switch. Turning it back on picks our
 * hosted model if none is chosen; it still runs on device where it can. */
const PolishRow: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, setPostProcessProvider } = useSettings();
  const preview = useOnboardingStore((s) => s.preview);
  const provider = getSetting("post_process_provider_id") ?? "";
  const chosen = provider === HOSTED || provider === ON_DEVICE;
  const saved = (getSetting("post_process_enabled") ?? false) && chosen;
  const [on, setOn] = useState(saved);
  useEffect(() => setOn(saved), [saved]);

  const toggle = async (next: boolean) => {
    setOn(next);
    if (preview) return;
    if (next && !chosen) await setPostProcessProvider(HOSTED);
    await updateSetting("post_process_enabled", next);
  };

  return (
    <div className="try-panel-row is-switch">
      {/* Switch draws its own <label>; the words toggle it too. */}
      <span className="try-panel-text" onClick={() => toggle(!on)}>
        <span id="try-panel-polish" className="try-panel-label">
          {t("onboarding.done.polish.title")}
        </span>
        <span id="try-panel-polish-sub" className="try-panel-sub">
          {t("onboarding.done.polish.description")}
        </span>
      </span>
      <Switch
        checked={on}
        onChange={toggle}
        ariaLabelledBy="try-panel-polish"
      />
    </div>
  );
};

/**
 * All set's summary panel under the drawn tray icon. Clicks here never take
 * focus from the note, so the shortcut keeps typing there.
 */
export const TrayPanel: React.FC<TrayPanelProps> = ({
  os,
  languages,
  modelName,
  ready,
  download,
  shortcut,
  keysDown,
  capture,
  atLogin,
  onAtLogin,
  onChangeLanguages,
  onChangeModel,
  tailAt,
  style,
}) => {
  const { t, i18n } = useTranslation();
  const languagesText = languageList(languages, i18n.language);
  const keysLabel = keycapLabel(shortcut, os);

  // While capturing, a click outside the keys box cancels; that same click
  // must not then restart capture.
  const keysRow = useRef<HTMLDivElement>(null);
  const keysBox = useRef<HTMLSpanElement>(null);
  const resetAt = useRef(-Infinity);
  const { capturing } = capture;
  usePressAway(capturing, keysBox, (at) => {
    if (keysRow.current?.contains(at)) resetAt.current = performance.now();
    capture.cancel();
  });

  return (
    <div
      className="try-panel"
      style={{ ...style, ["--try-tail" as string]: `${tailAt}px` }}
      onMouseDown={(ev) => ev.preventDefault()}
    >
      <div className="try-panel-head">
        <TrayIcon state="idle" size={17} />
        <span className="try-panel-name">
          {t("onboarding.done.panel.name")}
        </span>
        {ready && (
          <span className="try-panel-ready">
            {t("onboarding.done.panel.ready")}
          </span>
        )}
      </div>
      {!ready && <div className="try-panel-download">{download}</div>}
      <button
        type="button"
        className="try-panel-row"
        aria-label={t("onboarding.done.panel.changeLanguages", {
          languages: languagesText,
        })}
        onClick={onChangeLanguages}
      >
        <span className="try-panel-label">
          {t("onboarding.done.panel.languages")}
        </span>
        <span className="try-panel-value">{languagesText}</span>
        <Chevron />
      </button>
      <button
        type="button"
        className="try-panel-row"
        aria-label={t("onboarding.done.panel.changeModel", {
          model: modelName,
        })}
        onClick={onChangeModel}
      >
        <span className="try-panel-label">
          {t("onboarding.done.panel.model")}
        </span>
        <span className="try-panel-value" title={modelName}>
          {modelName}
        </span>
        <Chevron />
      </button>
      <div
        ref={keysRow}
        className="try-panel-keys"
        data-capturing={capturing || undefined}
      >
        <button
          type="button"
          className="try-panel-row group/keycaps"
          aria-label={
            capturing
              ? t("onboarding.demo.pressKeys")
              : t("onboarding.try.changeKeys", { keys: keysLabel })
          }
          {...spaceDoesNotClick}
          onClick={() => {
            // The click that just cancelled capture.
            if (performance.now() - resetAt.current < 800) return;
            if (!capturing) capture.start();
          }}
        >
          <span className="try-panel-label">
            {t("onboarding.done.panel.shortcut")}
          </span>
          <span ref={keysBox} className="try-panel-keybox">
            {!capturing ? (
              <Keycaps
                binding={shortcut}
                osType={os}
                size="line"
                pressed={keysDown}
                lift
              />
            ) : (
              <CapturedKeys
                partial={capture.partial}
                osType={os}
                size="line"
                slotLabel={t("settings.general.shortcut.pressKeys")}
              />
            )}
          </span>
        </button>
      </div>
      <hr className="try-panel-rule" />
      <div className="try-panel-row is-switch">
        {/* Switch draws its own <label>; the words toggle it too. */}
        <span
          id="try-panel-login"
          className="try-panel-label"
          onClick={() => onAtLogin(!atLogin)}
        >
          {t("onboarding.done.atLogin")}
        </span>
        <Switch
          checked={atLogin}
          onChange={onAtLogin}
          ariaLabelledBy="try-panel-login"
        />
      </div>
      <PolishRow />
    </div>
  );
};
