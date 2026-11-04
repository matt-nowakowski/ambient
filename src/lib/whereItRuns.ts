/*
 * Where each piece of intelligence runs, by the settings that control it.
 * Mirrors the Rust that decides (keep them in step):
 * - suggestions: `agent::judge::route`
 * - AI polish: `actions::post_process_transcription` (+ `plan::polish_every_dictation`)
 * - answers, writing for you, meeting summaries: `agent::llm::target` and
 *   `complete_inner`
 */
import type { CloudSuggestions, Intelligence } from "@/bindings";

/** Provider ids from settings.rs. */
export const HOSTED_PROVIDER = "ambient";
export const ON_DEVICE_PROVIDER = "apple_intelligence";

export type SuggestionRoute = "on_device" | "cloud" | "offer" | "rules";

/** Who judges a window for a suggestion (`judge::route`). The cloud judge is
 * Pro's. */
export const suggestionRoute = (
  intelligence: Intelligence,
  onDevice: boolean,
  offer: CloudSuggestions,
  paid: boolean,
): SuggestionRoute => {
  switch (intelligence) {
    case "device":
      return onDevice ? "on_device" : "rules";
    case "auto":
      if (onDevice) return "on_device";
      if (!paid) return "rules";
      return offer === "accepted"
        ? "cloud"
        : offer === "unasked"
          ? "offer"
          : "rules";
    case "cloud":
      if (paid) return "cloud";
      return onDevice ? "on_device" : "rules";
  }
};

export type PolishRoute = "off" | "on_device" | "cloud" | "blocked";

/** Where AI polish runs. "On this computer only" swaps hosted polish for
 * the on-device model (Apple Intelligence or the downloaded one) when it's
 * there, and skips it (types as said) when not. */
export const polishRoute = (
  enabled: boolean,
  provider: string,
  intelligence: Intelligence,
  onDeviceWhenPossible: boolean,
  onDevice: boolean,
): PolishRoute => {
  if (!enabled) return "off";
  if (provider === ON_DEVICE_PROVIDER) return onDevice ? "on_device" : "off";
  if (provider !== HOSTED_PROVIDER) return "off";
  if (intelligence === "device") return onDevice ? "on_device" : "blocked";
  if (intelligence === "auto" && onDeviceWhenPossible && onDevice)
    return "on_device";
  return "cloud";
};

/** Answers, writing for you and meeting summaries can reach our hosted
 * model: never in "On this computer only"; in Automatic not when polish is
 * kept on this Mac (Automatic follows the polish provider). */
export const answersMayUseCloud = (
  intelligence: Intelligence,
  provider: string,
): boolean =>
  intelligence === "cloud" ||
  (intelligence === "auto" && provider !== ON_DEVICE_PROVIDER);
