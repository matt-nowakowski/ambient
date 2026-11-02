/**
 * Platforms where the voice agent can read the screen (macOS Accessibility,
 * Windows UI Automation), hear calls and suggest things on its own. Apple
 * Intelligence (on-device AI) stays macOS-only.
 */
export const hasScreenAgent = (os: string): boolean =>
  os === "macos" || os === "windows";
