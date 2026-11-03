import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { showError } from "@/lib/errors";
import { commands } from "@/bindings";
import { SECURE_INPUT_HELP_URL } from "@/components/SecureInputWarning";
import { useSettings } from "@/hooks/useSettings";
import {
  ChordRecorder,
  getKeyName,
  MODIFIERS,
  normalizeKey,
  type OSType,
  type RecordedKeyEvent,
  typesText,
} from "@/lib/utils/keyboard";

/**
 * Records a new binding via ambient-keys events, or this window's key events
 * with all bindings suspended: every key held together, saved once all are
 * released. A key that types on its own ("d") is refused and capture goes on
 * (`refused`), except for Cancel, whose default is Escape. `inert` records
 * without saving; `escapeCancels` makes Escape exit instead of recording.
 */
export const useShortcutCapture = (
  bindingId: string,
  osType: OSType,
  {
    onDone,
    inert = false,
    escapeCancels = false,
  }: { onDone?: () => void; inert?: boolean; escapeCancels?: boolean } = {},
) => {
  const { t } = useTranslation();
  const { getSetting, updateBinding } = useSettings();
  const ambientKeys =
    !inert && getSetting("keyboard_implementation") === "ambient_keys";
  const [capturing, setCapturing] = useState(false);
  const [partial, setPartial] = useState("");
  // The last combo was a lone typing key; the hint asks for a modifier.
  const [refused, setRefused] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // What the capture holds in the backend, released on end or unmount.
  const held = useRef<"ambientKeys" | "bindings" | null>(null);
  const release = useCallback(async () => {
    const was = held.current;
    held.current = null;
    if (was === "ambientKeys")
      await commands.stopAmbientKeysRecording().catch(console.error);
    else if (was === "bindings")
      await commands.resumeAllBindings().catch(console.error);
  }, []);
  useEffect(
    () => () => {
      release();
    },
    [release],
  );

  const finish = useCallback(async () => {
    setCapturing(false);
    setPartial("");
    setRefused(false);
    await release();
    onDoneRef.current?.();
  }, [release]);

  /** Saves the combo, or refuses it and keeps listening. Resolves to whether capture ended. */
  const commit = useCallback(
    async (binding: string) => {
      if (bindingId !== "cancel" && typesText(binding)) {
        setRefused(true);
        setPartial("");
        return false;
      }
      try {
        if (!inert) await updateBinding(bindingId, binding);
      } catch (error) {
        showError("settings", error, { title: t("errors.titles.shortcut") });
      }
      await finish();
      return true;
    },
    [bindingId, finish, inert, t, updateBinding],
  );

  /** Resolves to whether capture began. */
  const start = useCallback(async () => {
    if (held.current) return false;
    if (ambientKeys) {
      // Refused while macOS Secure Input is on (no key events would arrive);
      // the backend also shows the warning banner the toast points at.
      const result = await commands
        .startAmbientKeysRecording(bindingId)
        .catch((error) => ({ status: "error" as const, error: String(error) }));
      if (result.status === "error") {
        if (String(result.error).includes("secure-input-active")) {
          toast.error(t("secureInput.recorderBlocked"), {
            action: {
              label: t("secureInput.learnMore"),
              onClick: () => openUrl(SECURE_INPUT_HELP_URL),
            },
          });
        } else {
          showError("settings", result.error, {
            title: t("errors.titles.shortcut"),
          });
        }
        return false;
      }
      held.current = "ambientKeys";
    } else if (!inert) {
      await commands.suspendAllBindings().catch(console.error);
      held.current = "bindings";
    }
    setPartial("");
    setRefused(false);
    setCapturing(true);
    return true;
  }, [bindingId, ambientKeys, inert, t]);

  const cancel = useCallback(() => {
    if (capturing) finish();
  }, [capturing, finish]);

  useEffect(() => {
    if (!capturing || !escapeCancels) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      finish();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, escapeCancels, finish]);

  // ambient-keys: the backend reports keys while recording.
  useEffect(() => {
    if (!capturing || !ambientKeys) return;
    const chord = new ChordRecorder();
    let stopped = false;
    const pending = listen<RecordedKeyEvent>("ambient-keys-event", (event) => {
      if (stopped) return;
      const { partial: held, done } = chord.feed(event.payload);
      if (!done) {
        if (held) {
          setRefused(false);
          setPartial(held);
        }
        return;
      }
      stopped = true;
      commit(done).then((ended) => {
        stopped = ended;
      });
    });
    return () => {
      stopped = true;
      pending.then((unlisten) => unlisten());
    };
  }, [capturing, ambientKeys, commit]);

  // Tauri shortcuts: this window's own key events.
  useEffect(() => {
    if (!capturing || ambientKeys) return;
    const pressed = new Set<string>();
    let recorded: string[] = [];
    const isModifier = (k: string) => MODIFIERS.includes(k);
    const onDown = (e: KeyboardEvent) => {
      if (escapeCancels && e.key === "Escape") return;
      e.preventDefault();
      const key = normalizeKey(getKeyName(e, osType));
      pressed.add(key);
      if (!recorded.includes(key)) recorded.push(key);
      setRefused(false);
      setPartial(recorded.join("+"));
    };
    const onUp = (e: KeyboardEvent) => {
      e.preventDefault();
      const key = normalizeKey(getKeyName(e, osType));
      pressed.delete(key);
      // WebKit drops a key's keyup while ⌘ is held: the last modifier going
      // up releases the rest.
      if (isModifier(key) && ![...pressed].some(isModifier)) pressed.clear();
      if (pressed.size || !recorded.length) return;
      const sorted = [...recorded].sort(
        (a, b) => +!isModifier(a) - +!isModifier(b),
      );
      recorded = [];
      commit(sorted.join("+"));
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [capturing, ambientKeys, commit, escapeCancels, osType]);

  return { capturing, partial, refused, start, cancel };
};
