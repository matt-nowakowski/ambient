/**
 * Keyboard utility functions for handling keyboard events
 */

import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export type OSType = "macos" | "windows" | "linux" | "unknown";

const keepSpace = (e: ReactKeyboardEvent<HTMLElement>) => {
  if (e.key === " ") e.preventDefault();
};

/** Spread on shortcut controls so a Space in the shortcut doesn't click them. */
export const spaceDoesNotClick = { onKeyDown: keepSpace, onKeyUp: keepSpace };

// Shortcut parsers require compact tokens; keep display labels separate.
const COMPOUND_KEY_DISPLAY: Record<string, string> = {
  capslock: "Caps Lock",
  numlock: "Num Lock",
  pageup: "Page Up",
  pagedown: "Page Down",
  printscreen: "Print Screen",
  scrolllock: "Scroll Lock",
};

// Mouse buttons as people name them. The parser also accepts the "mouse1"
// style aliases, so they all display the same way.
const MOUSE_DISPLAY: Record<string, string> = {
  mouseleft: "Mouse 1",
  mouse1: "Mouse 1",
  mouseright: "Mouse 2",
  mouse2: "Mouse 2",
  mousemiddle: "Mouse 3",
  mouse3: "Mouse 3",
  mousex1: "Mouse 4",
  mouse4: "Mouse 4",
  mousex2: "Mouse 5",
  mouse5: "Mouse 5",
};

/**
 * Marks a binding that toggles on a double tap of its key instead of holding
 * it: "double_tap+option_right". Mirrors DOUBLE_TAP_PREFIX in ambient-keys.
 */
export const DOUBLE_TAP_PREFIX = "double_tap+";

/** Whether this binding toggles on a double tap of its key. */
export const isDoubleTapBinding = (
  binding: string | null | undefined,
): boolean => !!binding?.trim().startsWith(DOUBLE_TAP_PREFIX);

/**
 * Extract a consistent key name from a KeyboardEvent
 * This function provides cross-platform keyboard event handling
 * and returns key names appropriate for the target operating system
 */
export const getKeyName = (
  e: KeyboardEvent,
  osType: OSType = "unknown",
): string => {
  // Handle special cases first
  if (e.code) {
    const code = e.code;

    // Handle function keys (F1-F24)
    if (code.match(/^F\d+$/)) {
      return code.toLowerCase(); // F1, F2, ..., F14, F15, etc.
    }

    // Handle regular letter keys (KeyA -> a)
    if (code.match(/^Key[A-Z]$/)) {
      return code.replace("Key", "").toLowerCase();
    }

    // Handle digit keys (Digit0 -> 0)
    if (code.match(/^Digit\d$/)) {
      return code.replace("Digit", "");
    }

    // Handle numpad digit keys (Numpad0 -> numpad 0)
    if (code.match(/^Numpad\d$/)) {
      return code.replace("Numpad", "numpad ").toLowerCase();
    }

    // Handle modifier keys - OS-specific naming
    const getModifierName = (baseModifier: string): string => {
      switch (baseModifier) {
        case "shift":
          return "shift";
        case "ctrl":
          return osType === "macos" ? "ctrl" : "ctrl";
        case "alt":
          return osType === "macos" ? "option" : "alt";
        case "meta":
          // Windows key on Windows/Linux, Command key on Mac
          if (osType === "macos") return "command";
          return "super";
        default:
          return baseModifier;
      }
    };

    const modifierMap: Record<string, string> = {
      ShiftLeft: getModifierName("shift"),
      ShiftRight: getModifierName("shift"),
      ControlLeft: getModifierName("ctrl"),
      ControlRight: getModifierName("ctrl"),
      AltLeft: getModifierName("alt"),
      AltRight: getModifierName("alt"),
      MetaLeft: getModifierName("meta"),
      MetaRight: getModifierName("meta"),
      OSLeft: getModifierName("meta"),
      OSRight: getModifierName("meta"),
      CapsLock: "capslock",
      Tab: "tab",
      Enter: "enter",
      Space: "space",
      Backspace: "backspace",
      Delete: "delete",
      Escape: "esc",
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      Home: "home",
      End: "end",
      PageUp: "pageup",
      PageDown: "pagedown",
      Insert: "insert",
      PrintScreen: "printscreen",
      ScrollLock: "scrolllock",
      Pause: "pause",
      ContextMenu: "menu",
      NumpadMultiply: "numpad *",
      NumpadAdd: "numpad +",
      NumpadSubtract: "numpad -",
      NumpadDecimal: "numpad .",
      NumpadDivide: "numpad /",
      NumLock: "numlock",
    };

    if (modifierMap[code]) {
      return modifierMap[code];
    }

    // Handle punctuation and special characters
    const punctuationMap: Record<string, string> = {
      Semicolon: ";",
      Equal: "=",
      Comma: ",",
      Minus: "-",
      Period: ".",
      Slash: "/",
      Backquote: "`",
      BracketLeft: "[",
      Backslash: "\\",
      BracketRight: "]",
      Quote: "'",
    };

    if (punctuationMap[code]) {
      return punctuationMap[code];
    }

    // Parser names mirror KeyboardEvent.code without spaces.
    return code.toLowerCase();
  }

  // Fallback to e.key if e.code is not available
  if (e.key) {
    const key = e.key;

    // Handle special key names with OS-specific formatting
    const keyMap: Record<string, string> = {
      Control: osType === "macos" ? "ctrl" : "ctrl",
      Alt: osType === "macos" ? "option" : "alt",
      Shift: "shift",
      Meta:
        osType === "macos" ? "command" : osType === "windows" ? "win" : "super",
      OS:
        osType === "macos" ? "command" : osType === "windows" ? "win" : "super",
      CapsLock: "capslock",
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      Escape: "esc",
      " ": "space",
    };

    if (keyMap[key]) {
      return keyMap[key];
    }

    return key.toLowerCase();
  }

  // Last resort fallback
  return `unknown-${e.keyCode || e.which || 0}`;
};

/**
 * Capitalize a key name for display (e.g. "space" -> "Space", "f1" -> "F1")
 */
const capitalizeKey = (key: string): string => {
  // fn key: keep lowercase
  if (key === "fn") return "fn";
  // Function keys: f1 -> F1
  if (/^f\d+$/.test(key)) return key.toUpperCase();
  // Single char: a -> A
  if (key.length === 1) return key.toUpperCase();
  if (COMPOUND_KEY_DISPLAY[key]) return COMPOUND_KEY_DISPLAY[key];
  if (MOUSE_DISPLAY[key]) return MOUSE_DISPLAY[key];
  // Multi-word: capitalize first letter of each word
  return key.replace(/\b\w/g, (c) => c.toUpperCase());
};

/**
 * Format a single key part for display.
 * Handles _left/_right suffixes and capitalizes names.
 * e.g. "shift_left" -> "Left Shift", "option" -> "Option", "space" -> "Space"
 */
const formatKeyPart = (part: string): string => {
  const trimmed = part.trim();
  if (!trimmed) return "";

  if (trimmed.endsWith("_left")) {
    const name = trimmed.slice(0, -5);
    return `Left ${capitalizeKey(name)}`;
  }
  if (trimmed.endsWith("_right")) {
    const name = trimmed.slice(0, -6);
    return `Right ${capitalizeKey(name)}`;
  }

  return capitalizeKey(trimmed);
};

/**
 * Get display-friendly key combination string for the current OS
 * Formats raw hotkey strings like "option_left+shift+space" into
 * human-readable form like "Left Option + Shift + Space"
 */
export const formatKeyCombination = (
  combination: string,
  _osType: OSType,
): string => {
  if (!combination) return "";
  const keys = bindingKeys(combination).map(formatKeyPart).join(" + ");
  return isDoubleTapBinding(combination) ? keys + " ×2" : keys;
};

/**
 * Normalize modifier keys to handle left/right variants
 */
export const normalizeKey = (key: string): string => {
  // Handle left/right variants of modifier keys
  if (key.startsWith("left ") || key.startsWith("right ")) {
    const parts = key.split(" ");
    if (parts.length === 2) {
      // Return just the modifier name without left/right prefix
      return parts[1];
    }
  }
  return key;
};

/** Keys that only modify another: a binding needs a key besides these. */
export const MODIFIERS = [
  "ctrl",
  "control",
  "shift",
  "alt",
  "option",
  "meta",
  "command",
  "cmd",
  "super",
  "win",
  "windows",
  "fn",
];

/**
 * The keys in a binding, or in one still being captured ("option+space").
 * A double-tap marker is not a key, so it is not one of them.
 */
export const bindingKeys = (binding: string | null | undefined): string[] =>
  binding
    ? binding.trim().replace(DOUBLE_TAP_PREFIX, "").split("+").filter(Boolean)
    : [];

/** Only modifiers are held so far: the binding still needs a key. */
export const isOnlyModifiers = (keys: string[]): boolean =>
  keys.length > 0 && keys.every((k) => MODIFIERS.includes(k.toLowerCase()));

/** A single modifier on either side: "option_right", "ctrl", "fn". */
export const isModifierKey = (key: string): boolean =>
  MODIFIERS.includes(
    key
      .trim()
      .toLowerCase()
      .replace(/_(left|right)$/, ""),
  );

/**
 * Only modifiers, no main key: the binding a double tap can ride on. Double
 * tapping a full chord (ctrl+space) would mean repeating both keys, so the
 * backend refuses it.
 */
export const isModifierOnlyBinding = (
  binding: string | null | undefined,
): boolean => {
  const keys = bindingKeys(binding);
  return keys.length > 0 && keys.every(isModifierKey);
};

/** Left and right click are how people use the computer: never bindings. */
const PRIMARY_MOUSE_BUTTONS = [
  "mouseleft",
  "leftclick",
  "lmb",
  "mouse1",
  "mouseright",
  "rightclick",
  "rmb",
  "mouse2",
];

/** Whether any key of the binding is the left or right mouse button. */
export const bindsPrimaryMouseButton = (
  binding: string | null | undefined,
): boolean =>
  bindingKeys(binding).some((key) =>
    PRIMARY_MOUSE_BUTTONS.includes(key.trim().toLowerCase()),
  );

// Labels as printed on the keys; a key's side (option_left) isn't printed.
const MAC_KEYCAPS: Record<string, string> = {
  option: "⌥",
  alt: "⌥",
  command: "⌘",
  cmd: "⌘",
  meta: "⌘",
  super: "⌘",
  ctrl: "⌃",
  control: "⌃",
  shift: "⇧",
};
const PC_KEYCAPS: Record<string, string> = {
  alt: "Alt",
  option: "Alt",
  ctrl: "Ctrl",
  control: "Ctrl",
  shift: "Shift",
  meta: "⊞",
  super: "⊞",
  command: "⊞",
};

/** "Right " / "Left " for a side-specific key, "" for a key without sides. */
const sidePrefix = (part: string): string =>
  part.endsWith("_right") ? "Right " : part.endsWith("_left") ? "Left " : "";

/** "option+space" → ["⌥", "Space"] on macOS. A double tap adds a "×2" cap. */
export const keycapLabels = (binding: string, osType: OSType): string[] => {
  const parts = bindingKeys(binding);
  const labels = parts.map((part) => {
    const key = part.replace(/_(left|right)$/, "");
    const glyphs = osType === "macos" ? MAC_KEYCAPS : PC_KEYCAPS;
    // A lone modifier is the whole shortcut, so its side has to be drawn:
    // "Right ⌥" says what "⌥" alone doesn't.
    const side = parts.length === 1 ? sidePrefix(part) : "";
    return side + (glyphs[key] ?? capitalizeKey(key));
  });
  return isDoubleTapBinding(binding) ? [...labels, "×2"] : labels;
};

/** "⌥ Space" on macOS, "Alt + Space" elsewhere. */
export const keycapLabel = (binding: string, osType: OSType): string =>
  keycapLabels(binding, osType).join(osType === "macos" ? " " : " + ");

/** "option_left" → "option": the side doesn't change what a key is. */
const baseKey = (part: string) =>
  part
    .trim()
    .toLowerCase()
    .replace(/_(left|right)$/, "");

// Keys that type or move the caret: on their own (or with only Shift) they'd
// fire in every text field, so they can't be a global shortcut.
const TYPING_KEYS = new Set([
  "space",
  "enter",
  "return",
  "tab",
  "backspace",
  "delete",
  "escape",
  "esc",
  "up",
  "down",
  "left",
  "right",
  "home",
  "end",
  "pageup",
  "pagedown",
]);

/**
 * A key that types, alone or with only Shift ("d", "shift+d", "space"):
 * not a usable global shortcut. F-keys and modifier-only combos are fine.
 * Mirrors `types_text` in src-tauri/src/shortcut/mod.rs.
 */
export const typesText = (binding: string): boolean => {
  const parts = bindingKeys(binding).map(baseKey);
  const keys = parts.filter((p) => !MODIFIERS.includes(p));
  if (keys.length !== 1) return false;
  if (parts.some((p) => MODIFIERS.includes(p) && p !== "shift")) return false;
  const key = keys[0];
  return (
    [...key].length === 1 ||
    TYPING_KEYS.has(key) ||
    /^(numpad|keypad)/.test(key)
  );
};

/** One ambient-keys event while recording (see `FrontendKeyEvent` in Rust). */
export interface RecordedKeyEvent {
  modifiers: string[];
  key: string | null;
  is_key_down: boolean;
  hotkey_string: string;
}

/**
 * Builds a binding from recorder events in any order ("d" then ⌘ works as
 * well as ⌘ then "d"): the most keys held at once, finished once everything
 * is released. `feed` returns the combo so far and, at the end, the binding.
 */
export class ChordRecorder {
  /** Non-modifier keys down, oldest first. */
  private held: string[] = [];
  private best: string[] = [];

  feed(e: RecordedKeyEvent): { partial: string; done: string | null } {
    const parts = bindingKeys(e.hotkey_string);
    // The string is the modifiers held now, plus this event's key if any.
    const mods = e.key ? parts.slice(0, -1) : parts;
    if (e.key) {
      this.held = this.held.filter((k) => k !== e.key);
      if (e.is_key_down) this.held.push(e.key);
    }
    const now = [...mods, ...this.held.slice(-1)];
    if (e.is_key_down && now.length && now.length >= this.best.length)
      this.best = now;
    const partial = this.best.join("+");
    // All released. macOS can swallow a key's release while ⌘ is down, so
    // the last modifier going up ends a combo that has one.
    const released =
      !e.is_key_down &&
      e.modifiers.length === 0 &&
      (this.held.length === 0 || (!e.key && this.best.length > 1));
    if (!released) return { partial, done: null };
    this.held = [];
    this.best = [];
    return { partial: "", done: partial || null };
  }
}

/** An app shortcut on the platform's primary modifier: "⌘ V" on macOS, "Ctrl + V" elsewhere. */
export const primaryShortcut = (key: string, osType: OSType): string =>
  keycapLabel(`${osType === "macos" ? "command" : "ctrl"}+${key}`, osType);
