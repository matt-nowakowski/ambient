import { releases, type OS } from "./releases";

export type ReleaseId = keyof typeof releases;
export type Platform = { os: OS; release: ReleaseId } | { os: "mobile" | "unknown"; release: null };

type UAData = {
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string; bitness?: string }>;
};

function uaData(): UAData | undefined {
  return (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
}

/** The GPU name the browser reports, e.g. "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, …)".
 * Safari masks it as "Apple GPU", so it only helps in Chromium and Firefox. */
function gpuRenderer(): string {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return (ext && gl?.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || "";
  } catch {
    return "";
  }
}

/** Fast, synchronous best guess. Every Mac browser says "Intel" in its user agent,
 * so the chip comes from the GPU name; Apple silicon is the default when it's unknown
 * (every Mac sold since 2021). */
export function guessPlatform(): Platform {
  const ua = navigator.userAgent;
  const hint = `${uaData()?.platform ?? ""} ${ua}`.toLowerCase();
  if (/iphone|ipad|ipod|android/.test(hint) || (/macintosh/.test(hint) && navigator.maxTouchPoints > 1)) {
    return { os: "mobile", release: null };
  }
  if (/mac/.test(hint)) {
    const gpu = gpuRenderer();
    const intel = /intel|amd|radeon|nvidia/i.test(gpu) && !/apple m\d/i.test(gpu);
    return { os: "mac", release: intel ? "macIntel" : "macArm" };
  }
  if (/win/.test(hint)) {
    return { os: "windows", release: /arm/i.test(ua) || /snapdragon|qualcomm|adreno/i.test(gpuRenderer()) ? "winArm" : "winX64" };
  }
  if (/linux|x11|cros/.test(hint)) {
    if (/ubuntu|debian|mint/i.test(ua)) return { os: "linux", release: "linuxDeb" };
    if (/fedora|red hat|suse|centos/i.test(ua)) return { os: "linux", release: "linuxRpm" };
    return { os: "linux", release: "linuxAppImage" };
  }
  return { os: "unknown", release: null };
}

/** Refines the guess with Chromium's client hints, which report the real CPU
 * architecture on macOS and Windows. Resolves to the guess elsewhere. */
export async function detectPlatform(): Promise<Platform> {
  const guess = guessPlatform();
  if (guess.os !== "mac" && guess.os !== "windows") return guess;
  try {
    const { architecture } = (await uaData()?.getHighEntropyValues?.(["architecture"])) ?? {};
    if (architecture === "arm") return { os: guess.os, release: guess.os === "mac" ? "macArm" : "winArm" };
    if (architecture === "x86") return { os: guess.os, release: guess.os === "mac" ? "macIntel" : "winX64" };
  } catch {
    // No client hints: keep the guess.
  }
  return guess;
}
