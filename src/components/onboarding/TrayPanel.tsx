import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { commands, type DictationConflicts } from "@/bindings";
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

/** "Make Ambient your dictation app": the exclusive-shortcuts switch, on by
 * default, as a choice made here rather than a setting found later. Names
 * any other dictation app it spotted. Saved the moment it's switched (not in
 * a preview). Hidden where the keyboard backend can't keep keys to itself. */
const DictationAppRow: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { getSetting, updateSetting } = useSettings();
  const preview = useOnboardingStore((s) => s.preview);
  const saved = getSetting("exclusive_shortcuts") ?? true;
  const [on, setOn] = useState(saved);
  const [apps, setApps] = useState<string[]>([]);
  useEffect(() => setOn(saved), [saved]);

  useEffect(() => {
    commands
      .getDictationConflicts()
      .then((c) => setApps(c.apps))
      .catch(() => {});
    const unlisten = listen<DictationConflicts>(
      "dictation-conflicts-changed",
      (event) => setApps(event.payload.apps),
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  if (getSetting("keyboard_implementation") !== "ambient_keys") return null;

  const toggle = (next: boolean) => {
    setOn(next);
    if (!preview) updateSetting("exclusive_shortcuts", next);
  };
  const named = new Intl.ListFormat(i18n.language, {
    style: "long",
    type: "conjunction",
  }).format(apps);

  return (
    <div className="try-panel-row is-switch">
      {/* Switch draws its own <label>; the words toggle it too. */}
      <span className="try-panel-text" onClick={() => toggle(!on)}>
        <span id="try-panel-dictation" className="try-panel-label">
          {t("onboarding.done.dictationApp.title")}
        </span>
        <span className="try-panel-sub">
          {apps.length > 0
            ? t("onboarding.done.dictationApp.found", { apps: named })
            : t("onboarding.done.dictationApp.description")}
        </span>
      </span>
      <Switch
        checked={on}
        onChange={toggle}
        ariaLabelledBy="try-panel-dictation"
      />
    </div>
  );
};

/** The panel's rows: they scroll inside the panel when the screen is too
 * short for them all (a long translation, a download line), with a soft
 * edge on the side there's more. */
const PanelBody: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const rows = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ above: false, below: false });
  useEffect(() => {
    const el = ref.current;
    if (!el || !rows.current) return;
    const measure = () => {
      const above = el.scrollTop > 1;
      const below = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      setMore((m) =>
        m.above === above && m.below === below ? m : { above, below },
      );
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    // The panel's room, and the rows' height (a row appears, text wraps).
    observer.observe(el);
    observer.observe(rows.current);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);
  return (
    <div
      ref={ref}
      className="try-panel-body"
      data-more-above={more.above || undefined}
      data-more-below={more.below || undefined}
    >
      <div ref={rows}>{children}</div>
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
      <PanelBody>
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
        <DictationAppRow />
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
      </PanelBody>
    </div>
  );
};
