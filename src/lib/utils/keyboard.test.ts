import assert from "node:assert/strict";
import {
  bindingKeys,
  bindsPrimaryMouseButton,
  ChordRecorder,
  formatKeyCombination,
  getKeyName,
  isDoubleTapBinding,
  isModifierOnlyBinding,
  keycapLabel,
  keycapLabels,
  type RecordedKeyEvent,
  typesText,
} from "./keyboard";

const keyboardEvent = (value: { code?: string; key?: string }): KeyboardEvent =>
  value as KeyboardEvent;

const compoundKeys = [
  ["ScrollLock", "scrolllock", "Scroll Lock"],
  ["CapsLock", "capslock", "Caps Lock"],
  ["NumLock", "numlock", "Num Lock"],
  ["PageUp", "pageup", "Page Up"],
  ["PageDown", "pagedown", "Page Down"],
  ["PrintScreen", "printscreen", "Print Screen"],
] as const;

for (const [code, stored, displayed] of compoundKeys) {
  assert.equal(getKeyName(keyboardEvent({ code })), stored);
  assert.equal(formatKeyCombination(stored, "linux"), displayed);
}

assert.equal(getKeyName(keyboardEvent({ key: "CapsLock" })), "capslock");
assert.equal(
  getKeyName(keyboardEvent({ code: "AudioVolumeUp" })),
  "audiovolumeup",
);

console.log("keyboard: all assertions passed");

// A typing key can't be a global shortcut on its own (or with only Shift).
for (const binding of ["d", "shift+d", "space", "5", "shift_left+up", "esc"])
  assert.equal(typesText(binding), true, binding);
for (const binding of [
  "option+space",
  "command+d",
  "ctrl+option+space",
  "option_left+shift+space",
  "f5",
  "fn",
  "option",
  "command+shift",
])
  assert.equal(typesText(binding), false, binding);

// The recorder keeps every key of the combo, whichever is pressed first.
const ev = (
  hotkey: string,
  key: string | null,
  down: boolean,
  modifiers: string[] = [],
): RecordedKeyEvent => ({
  hotkey_string: hotkey,
  key,
  is_key_down: down,
  modifiers,
});
const record = (events: RecordedKeyEvent[]) => {
  const r = new ChordRecorder();
  const done = events.map((e) => r.feed(e).done).filter(Boolean);
  return done;
};

// ⌘ then D, released in either order.
assert.deepEqual(
  record([
    ev("command", null, true, ["command"]),
    ev("command+d", "d", true, ["command"]),
    ev("command+d", "d", false, ["command"]),
    ev("", null, false),
  ]),
  ["command+d"],
);
// D first, then ⌘: the old recorder saved just "d".
assert.deepEqual(
  record([
    ev("d", "d", true),
    ev("command", null, true, ["command"]),
    ev("command+d", "d", false, ["command"]),
    ev("", null, false),
  ]),
  ["command+d"],
);
// ⌥⇧ then Space, with Space's release swallowed by macOS.
assert.deepEqual(
  record([
    ev("option", null, true, ["option"]),
    ev("option+shift", null, true, ["option", "shift"]),
    ev("option+shift+space", "space", true, ["option", "shift"]),
    ev("option", null, false, ["option"]),
    ev("", null, false),
  ]),
  ["option+shift+space"],
);
// Modifier only.
assert.deepEqual(record([ev("fn", null, true, ["fn"]), ev("", null, false)]), [
  "fn",
]);
// A lone key is recorded (the caller refuses it), and nothing commits early.
assert.deepEqual(record([ev("d", "d", true), ev("d", "d", false)]), ["d"]);
// The release of the key that started capture (Enter on the button) is ignored.
assert.deepEqual(record([ev("enter", "enter", false)]), []);

console.log("keyboard: chord assertions passed");

// Mouse buttons and double-tap triggers read as words, not parser tokens.
assert.equal(
  formatKeyCombination("double_tap+option_right", "macos"),
  "Right Option ×2",
);
assert.equal(formatKeyCombination("double_tap+fn", "macos"), "fn ×2");
assert.equal(
  formatKeyCombination("double_tap+ctrl_left", "windows"),
  "Left Ctrl ×2",
);
assert.equal(
  formatKeyCombination("double_tap+option_right+space", "macos"),
  "Right Option + Space ×2",
);
assert.equal(formatKeyCombination("mousex1", "windows"), "Mouse 4");
assert.equal(formatKeyCombination("mouse4", "linux"), "Mouse 4");
assert.equal(formatKeyCombination("mouse5", "macos"), "Mouse 5");
assert.equal(formatKeyCombination("mousemiddle", "windows"), "Mouse 3");
assert.equal(formatKeyCombination("mouseleft", "windows"), "Mouse 1");

assert.deepEqual(keycapLabels("double_tap+option_right", "macos"), ["⌥", "×2"]);
assert.deepEqual(keycapLabels("option_right", "windows"), ["Alt"]);
assert.deepEqual(keycapLabels("mousex2", "windows"), ["Mouse 5"]);
assert.equal(keycapLabel("double_tap+ctrl_left", "windows"), "Ctrl + ×2");

// The marker is not a key: binding logic sees only the key it marks.
assert.deepEqual(bindingKeys("double_tap+option_right"), ["option_right"]);
assert.deepEqual(bindingKeys("option_right"), ["option_right"]);
assert.deepEqual(bindingKeys(""), []);
assert.equal(isDoubleTapBinding("double_tap+fn"), true);
assert.equal(isDoubleTapBinding("fn"), false);
assert.equal(isDoubleTapBinding(null), false);

// A double tap rides on a modifier on its own; a chord or a typing key is out.
for (const binding of [
  "double_tap+option_right",
  "option_right",
  "fn",
  "double_tap+fn",
])
  assert.equal(isModifierOnlyBinding(binding), true, binding);
for (const binding of [
  "double_tap+ctrl+space",
  "ctrl+space",
  "space",
  "double_tap+d",
  "",
])
  assert.equal(isModifierOnlyBinding(binding), false, binding);

// A lone modifier, double tap or not, still isn't a typing key.
for (const binding of ["double_tap+option_right", "double_tap+fn"])
  assert.equal(typesText(binding), false, binding);

// Left and right click stay the user's; the extra buttons don't.
for (const binding of [
  "mouseleft",
  "mouse1",
  "mouseright",
  "rmb",
  "ctrl+mouseleft",
])
  assert.equal(bindsPrimaryMouseButton(binding), true, binding);
for (const binding of [
  "mouse4",
  "mouse5",
  "mousex1",
  "mousemiddle",
  "double_tap+mouse5",
])
  assert.equal(bindsPrimaryMouseButton(binding), false, binding);

console.log("keyboard: double-tap and mouse assertions passed");
