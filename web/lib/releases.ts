import { brand } from "./brand";

// ---------------------------------------------------------------------------
// RELEASE CONFIG — edit these when cutting a release.
//
// RELEASE_VERSION is only shown on the page; download links resolve the
// current version at request time via /dl/<id> (see app/dl/[id]/route.ts),
// which reads releases/manifest.json that the Release workflow writes to R2.
// ---------------------------------------------------------------------------
export const RELEASE_VERSION = "0.1.19";

const v = RELEASE_VERSION;
const n = brand.name;

export type OS = "mac" | "windows" | "linux";

export type Release = {
  id: string;
  os: OS;
  /** e.g. "Apple Silicon" */
  short: string;
  /** e.g. "macOS — Apple Silicon" */
  label: string;
  detail: string;
  file: string;
  /** Matches this installer's name in any version, e.g. "_aarch64.dmg". */
  suffix: string;
  url: string;
};

const OS_NAMES: Record<OS, string> = { mac: "macOS", windows: "Windows", linux: "Linux" };

function release(id: string, os: OS, short: string, detail: string, file: string, suffix: string): Release {
  return { id, os, short, label: `${OS_NAMES[os]} — ${short}`, detail, file, suffix, url: `/dl/${id}` };
}

export const releases = {
  macArm: release("macArm", "mac", "Apple Silicon", "M1 and newer · .dmg", `${n}_${v}_aarch64.dmg`, "_aarch64.dmg"),
  macIntel: release("macIntel", "mac", "Intel", "x86_64 · .dmg", `${n}_${v}_x64.dmg`, "_x64.dmg"),
  winX64: release("winX64", "windows", "x64", "Windows 10/11 · .exe", `${n}_${v}_x64-setup.exe`, "_x64-setup.exe"),
  winArm: release("winArm", "windows", "ARM64", "Snapdragon / ARM · .exe", `${n}_${v}_arm64-setup.exe`, "_arm64-setup.exe"),
  linuxAppImage: release("linuxAppImage", "linux", "AppImage", "x86_64 · any distro", `${n}_${v}_amd64.AppImage`, "_amd64.AppImage"),
  linuxDeb: release("linuxDeb", "linux", ".deb", "Debian, Ubuntu", `${n}_${v}_amd64.deb`, "_amd64.deb"),
  linuxRpm: release("linuxRpm", "linux", ".rpm", "Fedora, RHEL, openSUSE", `${n}-${v}-1.x86_64.rpm`, ".x86_64.rpm"),
} as const;

export const releasesByOS: Record<OS, Release[]> = {
  mac: [releases.macArm, releases.macIntel],
  windows: [releases.winX64, releases.winArm],
  linux: [releases.linuxAppImage, releases.linuxDeb, releases.linuxRpm],
};

export const releasesPage = "/changelog";

export const osLabel = OS_NAMES;

/** Default push-to-talk shortcut per platform (keep in sync with the app). */
export const defaultShortcut: Record<OS, string> = {
  mac: "Option + Space",
  windows: "Ctrl + Space",
  linux: "Ctrl + Space",
};

/** Default Ask shortcut per platform: always talks to the agent, never types (keep in sync with the app). */
export const askShortcut: Record<OS, string> = {
  mac: "Control + Option + Space",
  windows: "Ctrl + Alt + Space",
  linux: "Ctrl + Alt + Space",
};
