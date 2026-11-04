import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Info, X } from "lucide-react";
import { commands, type DictationConflicts } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";

const MACOS_KEYBOARD_SETTINGS =
  "x-apple.systempreferences:com.apple.Keyboard-Settings.extension";
const DISMISSED_KEY = "dictationConflictDismissed";

const readDismissed = (): string | null => {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
};

const writeDismissed = (value: string) => {
  try {
    localStorage.setItem(DISMISSED_KEY, value);
  } catch {
    // Storage unavailable: the dismissal lasts for this session only.
  }
};

/**
 * A short heads-up when another dictation app (or the OS's own dictation)
 * may answer the same shortcut as Ambient, with the one thing to do about
 * it. Silent once Ambient is already keeping its shortcuts to itself, since
 * then the other app never sees the press.
 */
const DictationConflictNotice: React.FC<{ onChangeShortcut: () => void }> = ({
  onChangeShortcut,
}) => {
  const { t, i18n } = useTranslation();
  const { updateSetting } = useSettings();
  const [conflicts, setConflicts] = useState<DictationConflicts | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(readDismissed);

  const refresh = useCallback(async () => {
    try {
      setConflicts(await commands.getDictationConflicts());
    } catch (e) {
      console.warn("Failed to fetch dictation conflicts:", e);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unlisten = listen<DictationConflicts>(
      "dictation-conflicts-changed",
      (event) => setConflicts(event.payload),
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refresh]);

  if (conflicts === null) return null;

  const system = conflicts.system_dictation;
  // macOS acts on Fn/Globe before any app can stop it, so that one shows
  // regardless; Win+H and other apps are covered by exclusive shortcuts.
  const showSystem =
    system === "macos_fn_key" ||
    (system === "windows_voice_typing" && !conflicts.exclusive_active);
  const showApps = conflicts.apps.length > 0 && !conflicts.exclusive_active;
  if (!showSystem && !showApps) return null;

  // Dismissal holds until what we'd say changes (a new app, say).
  const signature = [system ?? "", ...conflicts.apps].join("|");
  if (dismissed === signature) return null;

  const apps = new Intl.ListFormat(i18n.language, {
    style: "long",
    type: "conjunction",
  }).format(conflicts.apps);

  const message = showSystem
    ? system === "macos_fn_key"
      ? t("dictationConflict.macosFn")
      : t("dictationConflict.windowsVoiceTyping")
    : t("dictationConflict.apps", { apps });

  const action =
    showSystem && system === "macos_fn_key"
      ? {
          label: t("dictationConflict.openKeyboardSettings"),
          run: () => openUrl(MACOS_KEYBOARD_SETTINGS),
        }
      : showApps && conflicts.exclusive_supported
        ? {
            label: t("dictationConflict.makeExclusive"),
            run: () => updateSetting("exclusive_shortcuts", true),
          }
        : {
            label: t("dictationConflict.changeShortcut"),
            run: onChangeShortcut,
          };

  return (
    <div className="w-full rounded-card border border-transparent bg-warning-wash px-item-x py-item-y">
      <div className="flex items-center gap-3">
        <Info className="h-5 w-5 shrink-0 text-warning" />
        <p className="min-w-0 flex-1 text-ui font-medium leading-5">
          {message}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={action.run}
            className="cursor-pointer whitespace-nowrap rounded-full px-2.5 py-1 text-small font-medium text-text hover:text-warning focus:outline-none focus:ring-1 focus:ring-warning"
          >
            <span className="border-b border-current leading-4">
              {action.label}
            </span>
          </button>
          <button
            onClick={() => {
              writeDismissed(signature);
              setDismissed(signature);
            }}
            aria-label={t("dictationConflict.dismiss")}
            className="cursor-pointer rounded-full p-1.5 text-ink-3 hover:bg-warning-wash hover:text-warning focus:outline-none focus:ring-1 focus:ring-warning"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DictationConflictNotice;
