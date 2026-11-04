/*
 * What global search can find. Pages come from the sidebar's own config and
 * Settings tabs from the tab list the page renders, so both stay in sync by
 * construction. Rows and groups are listed by the same translation keys the
 * components render as their titles; a jump finds the row by that rendered
 * text, and in development a row the page no longer shows is reported
 * (see `useSearchJump`).
 */
import type { TFunction } from "i18next";
import { SECTIONS_CONFIG, type SidebarSection } from "../Sidebar";
import {
  SETTINGS_TABS,
  settingsTabVisible,
  type SettingsTab,
} from "../settings/settingsTabs";

export type SearchKind = "page" | "tab" | "group" | "setting";

interface Row {
  /** Translation key of the title as the component renders it. */
  label: string;
  description?: string;
  /** Extra words people might type (English; matched, never shown). */
  keywords?: string[];
  /** Only offered when this is true (platform, other settings). */
  when?: (ctx: SearchContext) => boolean;
}

interface Group {
  /** Title of the group (a SettingsGroup heading), or none. */
  label?: string;
  description?: string;
  keywords?: string[];
  rows: Row[];
  when?: (ctx: SearchContext) => boolean;
}

interface Place {
  section: SidebarSection;
  tab?: SettingsTab;
  groups: Group[];
}

export interface SearchContext {
  isMac: boolean;
  /** The agent can read the screen here (macOS, Windows). */
  screenAgent: boolean;
  isLinux: boolean;
  postProcessEnabled: boolean;
  experimentalEnabled: boolean;
}

const binding = (id: string): Row => ({
  label: `settings.general.shortcut.bindings.${id}.name`,
  description: `settings.general.shortcut.bindings.${id}.description`,
  keywords: ["shortcut", "hotkey", "keyboard", "key"],
});

/** The rows and groups of each page, in the order the page shows them. */
const PLACES: Place[] = [
  {
    section: "settings",
    tab: "general",
    groups: [
      {
        label: "settings.general.title",
        rows: [
          binding("transcribe"),
          {
            label: "settings.general.shortcutActivation.title",
            description: "settings.general.shortcutActivation.description",
            keywords: ["push to talk", "hold", "toggle", "tap"],
          },
          { ...binding("cancel"), when: (c) => !c.isLinux },
        ],
      },
      {
        label: "settings.agent.title",
        description: "settings.agent.description",
        keywords: ["agent", "assistant", "ai"],
        rows: [
          {
            label: "settings.agent.routing.label",
            description: "settings.agent.routing.description",
          },
          {
            label: "settings.agent.wake.label",
            description: "settings.agent.wake.description",
            keywords: ["wake word", "hey", "hands-free"],
          },
          binding("ask_agent"),
        ],
      },
      {
        label: "settings.languages.title",
        keywords: ["language", "translate"],
        rows: [
          {
            label: "settings.general.preferredLanguages.title",
            description: "settings.general.preferredLanguages.description",
            keywords: ["language", "spoken"],
          },
        ],
      },
      {
        label: "settings.sound.title",
        keywords: ["audio"],
        rows: [
          {
            label: "settings.sound.microphone.title",
            description: "settings.sound.microphone.description",
            keywords: ["mic", "input", "device"],
          },
          {
            label: "settings.sound.channel.title",
            description: "settings.sound.channel.description",
          },
          {
            label: "settings.sound.keepMicReady.title",
            description: "settings.sound.keepMicReady.description",
            keywords: ["mic", "first word", "latency", "indicator"],
          },
          {
            label: "settings.debug.muteWhileRecording.label",
            description: "settings.debug.muteWhileRecording.description",
          },
          {
            label: "settings.sound.audioFeedback.label",
            description: "settings.sound.audioFeedback.description",
            keywords: ["sound", "beep", "chime"],
          },
          {
            label: "settings.sound.outputDevice.title",
            description: "settings.sound.outputDevice.description",
            keywords: ["speaker", "headphones"],
          },
          {
            label: "settings.sound.volume.title",
            description: "settings.sound.volume.description",
          },
        ],
      },
    ],
  },
  {
    section: "settings",
    tab: "advanced",
    groups: [
      {
        label: "settings.advanced.groups.app",
        rows: [
          {
            label: "settings.advanced.startHidden.label",
            description: "settings.advanced.startHidden.description",
          },
          {
            label: "settings.advanced.autostart.label",
            description: "settings.advanced.autostart.description",
            keywords: ["login", "startup", "launch"],
          },
          {
            label: "settings.advanced.showTrayIcon.label",
            description: "settings.advanced.showTrayIcon.description",
            keywords: ["menu bar", "tray"],
          },
          {
            label: "settings.advanced.overlay.style.title",
            description: "settings.advanced.overlay.style.description",
            keywords: ["overlay", "hud", "indicator"],
          },
          {
            label: "settings.advanced.modelUnload.title",
            description: "settings.advanced.modelUnload.description",
            keywords: ["memory", "ram"],
          },
          {
            label: "settings.advanced.experimentalToggle.label",
            description: "settings.advanced.experimentalToggle.description",
          },
        ],
      },
      {
        label: "settings.advanced.groups.output",
        rows: [
          {
            label: "settings.advanced.pasteMethod.title",
            description: "settings.advanced.pasteMethod.description",
            keywords: ["paste", "type"],
          },
          {
            label: "settings.advanced.clipboardHandling.title",
            description: "settings.advanced.clipboardHandling.description",
            keywords: ["clipboard", "copy"],
          },
          {
            label: "settings.advanced.autoSubmit.title",
            description: "settings.advanced.autoSubmit.description",
            keywords: ["enter", "send"],
          },
        ],
      },
      {
        label: "settings.advanced.groups.transcription",
        rows: [
          {
            label: "settings.advanced.voiceActivityDetection.title",
            description: "settings.advanced.voiceActivityDetection.description",
            keywords: ["vad", "silence"],
          },
          {
            label: "settings.advanced.longFormChunking.title",
            description: "settings.advanced.longFormChunking.description",
          },
          {
            label: "settings.advanced.fillerWordRemoval.title",
            description: "settings.advanced.fillerWordRemoval.description",
            keywords: ["um", "uh"],
          },
          {
            label: "settings.advanced.customWords.title",
            description: "settings.advanced.customWords.description",
            keywords: ["vocabulary", "dictionary", "names", "spelling"],
          },
          {
            label: "settings.debug.appendTrailingSpace.label",
            description: "settings.debug.appendTrailingSpace.description",
          },
        ],
      },
      {
        label: "settings.advanced.groups.history",
        rows: [
          {
            label: "settings.debug.historyLimit.title",
            description: "settings.debug.historyLimit.description",
          },
          {
            label: "settings.debug.recordingRetention.title",
            description: "settings.debug.recordingRetention.description",
            keywords: ["delete", "keep", "recordings"],
          },
        ],
      },
    ],
  },
  {
    section: "settings",
    tab: "postprocessing",
    groups: [
      {
        label: "settings.postProcessing.hotkey.title",
        rows: [binding("transcribe_with_post_process")],
      },
    ],
  },
  {
    section: "settings",
    tab: "about",
    groups: [
      {
        label: "settings.about.title",
        rows: [
          {
            label: "settings.about.version.title",
            description: "settings.about.version.description",
            keywords: ["update"],
          },
          {
            label: "settings.about.sourceCode.title",
            description: "settings.about.sourceCode.description",
          },
          {
            label: "settings.about.feedback.title",
            description: "settings.about.feedback.description",
            keywords: [
              "bug",
              "report",
              "problem",
              "idea",
              "support",
              "contact",
            ],
          },
        ],
      },
      {
        label: "settings.about.acknowledgments.title",
        keywords: ["licenses", "credits"],
        rows: [],
      },
    ],
  },
  {
    section: "privacy",
    groups: [
      {
        label: "privacy.capabilities.title",
        description: "privacy.capabilities.description",
        keywords: ["permissions", "screen", "allow"],
        rows: [
          "screen_context",
          "screen_memory",
          "proactive",
          "meetings",
          "wake_word",
        ].map((cap) => ({
          label: `privacy.capabilities.${cap}.title`,
          description: `privacy.capabilities.${cap}.reads`,
        })),
      },
      {
        label: "privacy.intelligence.title",
        description: "privacy.intelligence.description",
        keywords: [
          "intelligence",
          "ai",
          "model",
          "apple intelligence",
          "on-device",
          "local",
          "offline",
          "cloud",
          "server",
        ],
        rows: [
          ...["auto", "device", "cloud"].map((key) => ({
            label: `privacy.intelligence.options.${key}.title`,
            description: `privacy.intelligence.options.${key}.description`,
          })),
          {
            label: "privacy.engine.title",
            description: "privacy.engine.description",
            keywords: ["apple intelligence", "answers", "polish"],
            when: (c) => c.isMac,
          },
          {
            label: "privacy.intelligence.cloudSuggestions.title",
            description: "privacy.intelligence.cloudSuggestions.description",
            keywords: ["suggestions", "cloud"],
          },
        ],
      },
      {
        label: "privacy.preview.title",
        description: "privacy.preview.description",
        rows: [],
        when: (c) => c.screenAgent,
      },
      {
        label: "privacy.neverWatch.title",
        description: "privacy.neverWatch.description",
        keywords: ["exclude", "block", "ignore"],
        rows: [],
      },
      {
        label: "privacy.stored.title",
        description: "privacy.stored.description",
        keywords: ["delete", "data", "memory"],
        rows: [],
      },
      {
        label: "privacy.telemetry.title",
        keywords: ["analytics", "telemetry", "usage", "statistics", "improve"],
        rows: [
          {
            label: "privacy.telemetry.label",
            description: "privacy.telemetry.description",
          },
        ],
      },
      {
        label: "privacy.ledger.title",
        description: "privacy.ledger.description",
        keywords: ["network", "sent", "requests", "log"],
        rows: [],
      },
    ],
  },
  {
    section: "account",
    groups: [
      {
        rows: [
          {
            label: "account.polish.title",
            description: "account.polish.description",
            keywords: ["ai", "clean up", "post-processing"],
          },
          {
            label: "account.writing.title",
            description: "account.writing.description",
            keywords: [
              "writing",
              "smart",
              "rewrite",
              "compose",
              "as said",
              "my words",
              "dictation",
              "polish",
            ],
          },
          ...["smart", "as_said", "polish"].map((key) => ({
            label: `account.writing.options.${key}.title`,
            description: `account.writing.options.${key}.description`,
            keywords: ["writing", "dictation"],
          })),
          {
            label: "account.signIn.sectionTitle",
            keywords: [
              "sign in",
              "sign out",
              "billing",
              "subscription",
              "plan",
            ],
          },
        ],
      },
    ],
  },
  {
    section: "meetings",
    groups: [
      {
        rows: [
          {
            label: "meetings.email.title",
            keywords: ["email", "send", "notes", "inbox"],
          },
          { label: "meetings.past" },
        ],
      },
    ],
  },
];

/** English words for whole pages (matched, never shown). */
const PAGE_KEYWORDS: Partial<Record<SidebarSection, string[]>> = {
  history: ["transcripts", "recordings", "past"],
  models: ["speech model", "whisper", "download"],
  settings: ["preferences", "options"],
  meetings: ["notes", "calls", "zoom"],
  privacy: ["security", "permissions", "data"],
  account: ["plan", "billing", "pro", "subscription", "sign in"],
};

export interface SearchEntry {
  id: string;
  kind: SearchKind;
  section: SidebarSection;
  tab?: SettingsTab;
  /** Translated title. */
  label: string;
  /** Translated "Page › Tab › Group" trail. */
  trail: string;
  description: string;
  /** Lower-cased, accent-free text the query is matched against. */
  haystack: string;
}

export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Builds the index in the current language. */
export function buildSearchIndex(
  t: TFunction,
  ctx: SearchContext,
): SearchEntry[] {
  const entries: SearchEntry[] = [];
  const add = (
    e: Omit<SearchEntry, "haystack" | "description"> & {
      description?: string;
      extra: string[];
    },
  ) => {
    const description = e.description ?? "";
    entries.push({
      id: e.id,
      kind: e.kind,
      section: e.section,
      tab: e.tab,
      label: e.label,
      trail: e.trail,
      description,
      haystack: normalize(
        [e.label, description, e.trail, ...e.extra].join(" \u0000 "),
      ),
    });
  };

  const pageLabel = (section: SidebarSection) =>
    t(SECTIONS_CONFIG[section].labelKey);
  const tabLabel = (tab: SettingsTab) =>
    t(SETTINGS_TABS.find((x) => x.id === tab)?.labelKey ?? "");

  for (const [id, config] of Object.entries(SECTIONS_CONFIG)) {
    const section = id as SidebarSection;
    if (section === "debug") continue; // a hidden support tool
    add({
      id: `page:${section}`,
      kind: "page",
      section,
      label: t(config.labelKey),
      trail: "",
      extra: PAGE_KEYWORDS[section] ?? [],
    });
  }

  for (const tab of SETTINGS_TABS) {
    if (!settingsTabVisible(tab.id, ctx.postProcessEnabled)) continue;
    add({
      id: `tab:${tab.id}`,
      kind: "tab",
      section: "settings",
      tab: tab.id,
      label: t(tab.labelKey),
      trail: pageLabel("settings"),
      extra: [],
    });
  }

  for (const place of PLACES) {
    if (place.tab && !settingsTabVisible(place.tab, ctx.postProcessEnabled))
      continue;
    const base = [
      pageLabel(place.section),
      ...(place.tab ? [tabLabel(place.tab)] : []),
    ];
    for (const group of place.groups) {
      if (group.when && !group.when(ctx)) continue;
      const groupLabel = group.label ? t(group.label) : null;
      if (group.label && groupLabel) {
        add({
          id: `group:${group.label}`,
          kind: "group",
          section: place.section,
          tab: place.tab,
          label: groupLabel,
          description: group.description ? t(group.description) : undefined,
          trail: base.join(" › "),
          extra: group.keywords ?? [],
        });
      }
      for (const row of group.rows) {
        if (row.when && !row.when(ctx)) continue;
        add({
          id: `row:${row.label}`,
          kind: "setting",
          section: place.section,
          tab: place.tab,
          label: t(row.label),
          description: row.description ? t(row.description) : undefined,
          trail: [...base, ...(groupLabel ? [groupLabel] : [])].join(" › "),
          extra: [...(row.keywords ?? []), ...(group.keywords ?? [])],
        });
      }
    }
  }
  return entries;
}

const KIND_RANK: Record<SearchKind, number> = {
  page: 0,
  tab: 1,
  group: 2,
  setting: 3,
};

/** Best matches first; every word of the query must match somewhere. */
export function searchIndex(
  entries: SearchEntry[],
  query: string,
  limit = 12,
): SearchEntry[] {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const scored: { e: SearchEntry; score: number }[] = [];
  for (const e of entries) {
    if (!terms.every((term) => e.haystack.includes(term))) continue;
    const label = normalize(e.label);
    const q = terms.join(" ");
    let score = 0;
    if (label === q) score += 100;
    else if (label.startsWith(q)) score += 60;
    else if (label.split(/\s+/).some((w) => w.startsWith(terms[0])))
      score += 40;
    else if (label.includes(q)) score += 25;
    // On an equal match, broader places (pages, then tabs) come first.
    score -= KIND_RANK[e.kind];
    scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.e);
}
