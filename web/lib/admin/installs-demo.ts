import type { InstallsData } from "./installs";

/**
 * Sample numbers for /admin?tab=installs&demo=1: a few thousand installs,
 * mostly Free, so the tab can be reviewed before real data exists. Made up;
 * never mixed with real data.
 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function demoInstallsData(days: string[]): InstallsData {
  const r = rng(29);
  const grow = (i: number) => 0.75 + 0.5 * (i / (days.length - 1));
  const weekend = (d: string) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
  const downloads = days.map((d, i) => Math.round((weekend(d) ? 48 : 74) * grow(i) * (0.85 + r() * 0.3)));
  const installs = downloads.map((n) => Math.round(n * (0.58 + r() * 0.1)));
  const activePerDay = {
    free: days.map((d, i) => Math.round((weekend(d) ? 310 : 520) * grow(i) * (0.92 + r() * 0.16))),
    trial: days.map((d, i) => Math.round((weekend(d) ? 140 : 230) * grow(i) * (0.9 + r() * 0.2))),
    pro: days.map((d) => Math.round((weekend(d) ? 14 : 29) * (0.9 + r() * 0.2))),
    team: days.map((d) => Math.round((weekend(d) ? 2 : 6) * (0.8 + r() * 0.4))),
  };
  const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

  return {
    days,
    installs: { total: 4_812, last7: sum(installs.slice(-7)), last30: sum(installs), trialing: sum(installs.slice(-7)), perDay: installs },
    downloads: { last30: sum(downloads), perDay: downloads },
    active: {
      day: { free: activePerDay.free.at(-1)!, trial: activePerDay.trial.at(-1)!, pro: activePerDay.pro.at(-1)!, team: activePerDay.team.at(-1)! },
      week: { free: 1_964, trial: 402, pro: 36, team: 9 },
      month: { free: 3_310, trial: 1_088, pro: 41, team: 11 },
    },
    activePerDay,
    activeSince: days[0],
    downloadFiles: [
      { id: "macArm", n: Math.round(sum(downloads) * 0.52) },
      { id: "winX64", n: Math.round(sum(downloads) * 0.27) },
      { id: "macIntel", n: Math.round(sum(downloads) * 0.08) },
      { id: "linuxAppImage", n: Math.round(sum(downloads) * 0.05) },
      { id: "linuxDeb", n: Math.round(sum(downloads) * 0.04) },
      { id: "winArm", n: Math.round(sum(downloads) * 0.03) },
      { id: "linuxRpm", n: Math.round(sum(downloads) * 0.01) },
    ],
    downloadVersions: [
      { version: "0.1.8", n: Math.round(sum(downloads) * 0.31) },
      { version: "0.1.7", n: Math.round(sum(downloads) * 0.69) },
    ],
    countries: [
      ["US", 512, 288],
      ["GB", 204, 121],
      ["DE", 188, 112],
      ["PL", 96, 61],
      ["IN", 141, 58],
      ["FR", 83, 47],
      ["CA", 71, 44],
      ["AE", 52, 33],
      ["BR", 49, 21],
      ["JP", 31, 18],
    ].map(([country, downloads, firstLaunches]) => ({ country: String(country), downloads: Number(downloads), firstLaunches: Number(firstLaunches) })),
    mix: {
      deviceDays: 2_430,
      os: [
        { key: "macos/aarch64", n: 1_390 },
        { key: "macos/x86_64", n: 250 },
        { key: "windows/x86_64", n: 690 },
        { key: "linux/x86_64", n: 100 },
      ],
      versions: [
        { key: "0.1.8", n: 1_120 },
        { key: "0.1.7", n: 1_190 },
        { key: "0.1.6", n: 120 },
      ],
      plans: [
        { key: "free", n: 1_610 },
        { key: "trial", n: 640 },
        { key: "pro", n: 180 },
      ],
    },
    accounts: [
      { email: "marta.kowalska@example.com", plan: "free", firstSeen: ago(30), lastSeen: ago(2) },
      { email: "j.okafor@example.com", plan: "free", firstSeen: ago(200), lastSeen: ago(5) },
      { email: "lena.berg@example.com", plan: "free", firstSeen: ago(90), lastSeen: ago(26) },
      { email: "tom@example.org", plan: "free", firstSeen: ago(500), lastSeen: ago(170) },
      { email: "priya.n@example.com", plan: "pro", firstSeen: ago(700), lastSeen: ago(1) },
      { email: "sam@studio.example", plan: "team", firstSeen: ago(400), lastSeen: ago(8) },
    ],
    accountTotals: { free: 214, pro: 41, team: 11 },
  };
}
