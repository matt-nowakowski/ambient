import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { showError } from "@/lib/errors";
import { formatModelSize } from "@/lib/utils/format";
import {
  ArrowUpRight,
  AudioLines,
  BellOff,
  ChevronDown,
  Cloud,
  Cpu,
  Eye,
  History,
  KeyRound,
  Laptop,
  PenLine,
  ListChecks,
  Lock,
  Mic,
  MinusCircle,
  ScanText,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { requestAccessibilityPermission } from "tauri-plugin-macos-permissions-api";
import { type as osType } from "@tauri-apps/plugin-os";
import { hasScreenAgent } from "@/lib/agentPlatform";
import {
  commands,
  type AgentSettings,
  type AgentStatus,
  type ContextSnapshot,
  type Intelligence,
  type LedgerEntry,
  type UsageToday,
} from "@/bindings";
import { Button } from "../ui/Button";
import { Radio } from "../ui/Radio";
import { Switch } from "../ui/Switch";
import { InfoTooltip } from "../ui/InfoTooltip";
import { MoreMenu, type MoreMenuItem } from "../ui/MoreMenu";
import { SettingsGroup } from "../ui/SettingsGroup";
import { DependencyNote } from "../ui/SettingLink";
import { useSettings } from "../../hooks/useSettings";
import {
  answersMayUseCloud,
  polishRoute,
  suggestionRoute,
} from "@/lib/whereItRuns";
import { AtAGlance, type GlanceItem } from "./AtAGlance";
import { isPaid, usePlan } from "../account/usePlan";
import { useGetStarted } from "../getstarted/store";
import { UsageStats } from "./UsageStats";
import {
  OnDeviceAi,
  useOnDeviceAi,
  useOnDeviceAiDownloading,
} from "./OnDeviceAi";
import { Stagger, StaggerItem, expand } from "../ui/Motion";

const RETENTION_CHOICES = [1, 3, 7, 14, 30];
/** The guarantees, always shown at the top: four short lines. */
const PROMISES = [
  { key: "voice", icon: Mic },
  { key: "text", icon: ScanText },
  { key: "sensitive", icon: KeyRound },
  { key: "ledger", icon: ListChecks },
] as const;
const PREVIEW_DELAY_MS = 3000;

/* Privacy's cards hold several lines per row (what it reads, what leaves,
 * a note, chips), so rows get 18px above and below instead of a one-line
 * row's 10px, the lines inside a row get room between them, and a card's first and last lines sit as far from its top and
 * bottom edges as from each other. Every block on the page uses the same. */
/** A block of text, chips or a list inside a card. */
const BLOCK = "px-row-x py-4.5";
/** An icon, a title and its lines, and a control on the far side. */
const ROW_RICH = "flex items-start gap-3.5 px-row-x py-4.5";
/** A one-line row: an icon, a name, a control. */
const ROW_ONE = "flex items-center gap-3.5 px-row-x py-3.5";
/** A switch beside a row's 28px icon: centred on it (and on a Radio's mt-1.5). */
const SWITCH_ALIGN = "mt-1 shrink-0";

/** "com.tinyspeck.slackmacgap" → "slackmacgap"; good enough without a name lookup. */
const shortBundle = (id: string) => id.split(".").pop() || id;

/** Display names for well-known apps, keyed by lowercased macOS bundle id or
 * Windows executable. App names are proper nouns, so they are not translated. */
const APP_NAMES: Record<string, string> = {
  "com.tinyspeck.slackmacgap": "Slack",
  "slack.exe": "Slack",
  "com.apple.mail": "Mail",
  "com.google.chrome": "Google Chrome",
  "chrome.exe": "Google Chrome",
  "com.apple.safari": "Safari",
  "company.thebrowser.browser": "Arc",
  "arc.exe": "Arc",
  "com.microsoft.edgemac": "Microsoft Edge",
  "msedge.exe": "Microsoft Edge",
  "org.mozilla.firefox": "Firefox",
  "firefox.exe": "Firefox",
  "com.brave.browser": "Brave",
  "brave.exe": "Brave",
  "com.microsoft.teams": "Microsoft Teams",
  "com.microsoft.teams2": "Microsoft Teams",
  "ms-teams.exe": "Microsoft Teams",
  "teams.exe": "Microsoft Teams",
  "com.microsoft.outlook": "Outlook",
  "outlook.exe": "Outlook",
  "olk.exe": "Outlook",
  "notion.id": "Notion",
  "notion.exe": "Notion",
  "com.apple.terminal": "Terminal",
  "windowsterminal.exe": "Windows Terminal",
  "com.googlecode.iterm2": "iTerm",
  "dev.warp.warp-stable": "Warp",
  "warp.exe": "Warp",
  "com.microsoft.vscode": "VS Code",
  "code.exe": "VS Code",
  "com.todesktop.230313mzl4w4u92": "Cursor",
  "cursor.exe": "Cursor",
  "dev.zed.zed": "Zed",
  "zed.exe": "Zed",
  "com.microsoft.excel": "Excel",
  "excel.exe": "Excel",
  "com.microsoft.word": "Word",
  "winword.exe": "Word",
  "com.apple.iwork.numbers": "Numbers",
  "com.apple.iwork.pages": "Pages",
  "com.apple.notes": "Notes",
  "com.hnc.discord": "Discord",
  "discord.exe": "Discord",
  "net.whatsapp.whatsapp": "WhatsApp",
  "desktop.whatsapp": "WhatsApp",
  "whatsapp.exe": "WhatsApp",
  "ru.keepcoder.telegram": "Telegram",
  "org.telegram.desktop": "Telegram",
  "telegram.exe": "Telegram",
  "com.apple.mobilesms": "Messages",
  "com.linear": "Linear",
  "linear.exe": "Linear",
  "com.readdle.smartemail-mac": "Spark",
  "spark.exe": "Spark",
  "com.superhuman.electron": "Superhuman",
  "superhuman.exe": "Superhuman",
};
const appName = (id: string) => APP_NAMES[id.toLowerCase()] ?? shortBundle(id);

type Capability =
  | "screen_context"
  | "screen_memory"
  | "proactive"
  | "meetings"
  | "wake_word";
const IS_LINUX = osType() === "linux";
/** Reading other apps' windows needs macOS Accessibility, Windows UI
 * Automation or Linux AT-SPI. */
const SCREEN_AGENT = hasScreenAgent(osType());
const UNSUPPORTED: Capability[] = SCREEN_AGENT
  ? []
  : ["screen_context", "screen_memory", "proactive"];
/** The command that turns on AT-SPI for GNOME (and most GTK desktops). */
const LINUX_A11Y_COMMAND =
  "gsettings set org.gnome.desktop.interface toolkit-accessibility true";
/** Where the intelligence runs, in display order. */
const INTELLIGENCE: { key: Intelligence; icon: LucideIcon }[] = [
  { key: "auto", icon: Sparkles },
  { key: "device", icon: Laptop },
  { key: "cloud", icon: Cloud },
  { key: "none", icon: MinusCircle },
];
/** Capabilities grouped by what they touch, each with its icon. Suggestions
 * ("proactive") has its own section further down. */
const CAPABILITY_GROUPS: {
  key: "screen" | "listening";
  caps: { cap: Capability; icon: LucideIcon }[];
}[] = [
  {
    key: "screen",
    caps: [
      { cap: "screen_context", icon: ScanText },
      { cap: "screen_memory", icon: History },
    ],
  },
  {
    key: "listening",
    caps: [
      { cap: "meetings", icon: Users },
      { cap: "wake_word", icon: AudioLines },
    ],
  },
];

export const PrivacyCenter: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { status: plan } = usePlan();
  const paid = plan ? isPaid(plan) : false;
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [openLedger, setOpenLedger] = useState<number | null>(null);
  const [preview, setPreview] = useState<ContextSnapshot | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  // Free's limits, for the small "Free: 10 a week" hints.
  const [limits, setLimits] = useState<UsageToday | null>(null);
  // "Download on-device AI", and which on-device model runs tasks: shared
  // with Models › Reasoning models.
  const {
    status: onDeviceAi,
    models: reasoningModels,
    starting: startingAi,
    refresh: refreshAi,
    download: fetchAi,
  } = useOnDeviceAi();
  const { downloading: aiDownloading } = useOnDeviceAiDownloading(
    startingAi,
    reasoningModels,
  );
  // AI polish and telemetry live in app settings, not the agent's.
  const { getSetting } = useSettings();
  const polishOn = getSetting("post_process_enabled") ?? false;
  const polishProvider = getSetting("post_process_provider_id") ?? "";
  const telemetry = getSetting("telemetry") ?? false;

  const refresh = useCallback(async () => {
    setStatus(await commands.getAgentStatus());
    setLimits(await commands.getUsageToday());
    await refreshAi();
    const l = await commands.getNetworkLedger(50);
    if (l.status === "ok") setLedger(l.data);
  }, [refreshAi]);

  useEffect(() => {
    useGetStarted.getState().mark("privacy");
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  // Download on-device AI, then re-read everything it changes here.
  const downloadAi = useCallback(
    async (modelId: string | null) => {
      await fetchAi(modelId);
      await refresh();
    },
    [fetchAi, refresh],
  );

  if (!status) return null;
  const s = status.settings;
  // "On this computer only" with no model here: the model it downloads.
  const toDownload =
    !status.on_device_ready && onDeviceAi?.supported
      ? reasoningModels.find((m) => m.selected)
      : undefined;

  const save = async (next: AgentSettings) => {
    setStatus({ ...status, settings: next });
    const r = await commands.setAgentSettings(next);
    if (r.status === "error") showError("settings", r.error);
    refresh();
  };

  const time = (secs: number) =>
    new Date(secs * 1000).toLocaleString(i18n.language, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const runPreview = async () => {
    setPreview(null);
    setPreviewNote(null);
    setPreviewing(true);
    const r = await commands.previewContext(PREVIEW_DELAY_MS);
    setPreviewing(false);
    if (r.status === "ok") setPreview(r.data);
    else setPreviewNote(t(`privacy.preview.skipped.${r.error}`));
  };

  const neverWatch = async (bundleId: string) => {
    if (!bundleId || s.never_watch.includes(bundleId)) return;
    await commands.deleteScreenMemoryApp(bundleId);
    await save({ ...s, never_watch: [...s.never_watch, bundleId] });
    setPreview(null);
    toast.success(
      t("privacy.neverWatch.added", { app: shortBundle(bundleId) }),
    );
  };

  const deleteAll = async () => {
    const r = await commands.deleteAllAgentData();
    if (r.status === "ok") toast.success(t("privacy.stored.deletedAll"));
    else showError("settings", r.error, { retry: deleteAll });
    refresh();
  };

  const state = status.paused
    ? "paused"
    : s.screen_context || s.screen_memory || s.proactive || s.meetings
      ? "on"
      : "off";

  const route = suggestionRoute(
    s.intelligence,
    status.on_device_ready,
    s.cloud_suggestions,
    paid,
  );

  /** What a capability depends on, or doesn't: part of its tooltip. */
  const aside = (cap: Capability): string | null => {
    switch (cap) {
      case "screen_context":
        return t("privacy.depends.screenContext");
      case "screen_memory":
        return t("privacy.depends.screenMemory");
      case "proactive":
        return s.proactive ? t(`privacy.depends.route.${route}`) : null;
      default:
        return null;
    }
  };

  /** A line under a capability only when there's something to do about it. */
  const dependency = (cap: Capability): React.ReactNode => {
    switch (cap) {
      case "meetings":
        return s.meetings && !s.proactive ? (
          <DependencyNote
            link={{
              section: "privacy",
              label: t("privacy.capabilities.proactive.title"),
              children: t("privacy.capabilities.proactive.title"),
            }}
          >
            {t("privacy.depends.meetingTips")}
          </DependencyNote>
        ) : null;
      default:
        return null;
    }
  };

  /** The summary up top: what reads the screen and what can reach the
   * cloud, each a jump to the switch that controls it. */
  const reads: GlanceItem[] = status.paused
    ? []
    : (["screen_context", "screen_memory", "proactive"] as const)
        .filter((cap) => s[cap] && !UNSUPPORTED.includes(cap))
        .map((cap) => ({
          key: cap,
          label: t(`privacy.glance.items.${cap}`),
          target: {
            section: "privacy",
            label: t(`privacy.capabilities.${cap}.title`),
          },
        }));
  const polish = polishRoute(
    polishOn,
    polishProvider,
    s.intelligence,
    s.on_device_when_possible,
    status.on_device_ready,
  );
  const cloudCandidates: (GlanceItem | false)[] = [
    answersMayUseCloud(s.intelligence, polishProvider) && {
      key: "answers",
      label: t("privacy.glance.items.answers"),
      target: { section: "privacy", label: t("privacy.intelligence.title") },
    },
    polish === "cloud" && {
      key: "polish",
      label: t("privacy.glance.items.polish"),
      target: { section: "account", label: t("account.polish.title") },
    },
    s.proactive &&
      !status.paused &&
      route === "cloud" && {
        key: "proactive",
        label: t("privacy.glance.items.proactive"),
        target: {
          section: "privacy",
          label: t("privacy.capabilities.proactive.title"),
        },
      },
    s.meetings &&
      answersMayUseCloud(s.intelligence, polishProvider) && {
        key: "meetings",
        label: t("privacy.glance.items.meetings"),
        target: {
          section: "privacy",
          label: t("privacy.capabilities.meetings.title"),
        },
      },
    telemetry && {
      key: "telemetry",
      label: t("privacy.glance.items.telemetry"),
      target: { section: "privacy", label: t("privacy.telemetry.label") },
    },
  ];
  const cloud = cloudCandidates.filter((x): x is GlanceItem => !!x);

  /** Free's limit on a capability, as a short hint ("Free: 10 a week"). */
  const freeHint = (cap: Capability): string | null => {
    if (paid || !limits) return null;
    if (cap === "proactive" && limits.suggestions_limit != null)
      return t("privacy.free.perWeek", { limit: limits.suggestions_limit });
    if (cap === "screen_memory" && limits.memory_hours_limit != null)
      return t("privacy.free.hours", { limit: limits.memory_hours_limit });
    if (cap === "meetings" && limits.meetings_limit != null)
      return t("privacy.free.perMonth", { limit: limits.meetings_limit });
    return null;
  };

  /** One capability: what it reads, what leaves the computer, and its switch.
   * Every one is on every plan; Free has limits on some (the hint says which). */
  const capabilityRow = (cap: Capability, Icon: LucideIcon) => {
    const unsupported = UNSUPPORTED.includes(cap);
    const hint = freeHint(cap);
    return (
      <div key={cap} data-search-row className={ROW_RICH}>
        <span className="mt-px grid size-7 shrink-0 place-items-center rounded-full bg-glass-press text-text">
          <Icon width={14} height={14} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ui">
            {t(`privacy.capabilities.${cap}.title`)}
            <InfoTooltip
              text={
                <>
                  {t(`privacy.capabilities.${cap}.reads`)}{" "}
                  {t(`privacy.capabilities.${cap}.leaves`)}
                  {aside(cap) && <> {aside(cap)}</>}
                </>
              }
            />
            {unsupported ? (
              <span className="whitespace-nowrap rounded-full bg-glass-press px-2 py-0.5 text-meta text-ink-2">
                {t("privacy.macOnly")}
              </span>
            ) : (
              hint && (
                <span className="whitespace-nowrap rounded-full bg-glass-press px-2 py-0.5 text-meta text-ink-2">
                  {hint}
                </span>
              )
            )}
          </p>
          {!unsupported && dependency(cap) && (
            <div className="mt-1.5">{dependency(cap)}</div>
          )}
          {/* Free keeps a day of memory; the choices are Pro's. */}
          {cap === "screen_memory" && s.screen_memory && hint && (
            <p className="mt-3.5 text-small text-ink-2">
              {t("privacy.free.retention", {
                limit: limits?.memory_hours_limit,
              })}
            </p>
          )}
          {cap === "screen_memory" && s.screen_memory && !hint && (
            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              <span className="me-0.5 text-small text-ink-2">
                {t("privacy.retention")}
              </span>
              {RETENTION_CHOICES.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => save({ ...s, retention_days: d })}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-meta transition-colors ${
                    s.retention_days === d
                      ? "bg-text text-background"
                      : "bg-glass-press text-ink-2 hover:text-text"
                  }`}
                >
                  {t("privacy.days", { count: d })}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={SWITCH_ALIGN}>
          <Switch
            checked={s[cap]}
            disabled={unsupported}
            ariaLabel={t(`privacy.capabilities.${cap}.title`)}
            onChange={(on) => save({ ...s, [cap]: on })}
          />
        </div>
      </div>
    );
  };

  /** Everything the user has turned down by voice, one row per preference. */
  const learned = Object.entries(s.suggestion_prefs).flatMap(([kind, pref]) =>
    pref
      ? [
          ...(pref.off ? [{ kind, app: null as string | null }] : []),
          ...pref.muted_apps.map((app) => ({ kind, app })),
        ]
      : [],
  );

  const kindLabel = (kind: string) => {
    const key = `privacy.suggestions.kinds.${kind}`;
    return i18n.exists(key) ? t(key) : t("privacy.suggestions.unknownKind");
  };

  /** Forget one preference: "never" back to allowed, or one app un-muted. */
  const undoPref = (kind: string, app: string | null) => {
    const pref = s.suggestion_prefs[kind];
    if (!pref) return;
    const next = {
      off: app === null ? false : pref.off,
      muted_apps:
        app === null
          ? pref.muted_apps
          : pref.muted_apps.filter((b) => b !== app),
    };
    const prefs = { ...s.suggestion_prefs };
    if (!next.off && next.muted_apps.length === 0) delete prefs[kind];
    else prefs[kind] = next;
    save({ ...s, suggestion_prefs: prefs });
  };

  /** What smart writing learned from "Use my words", one row per app and kind. */
  const writingLearned = Object.entries(s.writing_prefs ?? {}).flatMap(
    ([bundle, pref]) =>
      pref
        ? [
            ...(pref.written_reverts > 0
              ? [{ bundle, name: pref.app_name, kind: "written" as const }]
              : []),
            ...(pref.polished_reverts > 0
              ? [{ bundle, name: pref.app_name, kind: "polished" as const }]
              : []),
          ]
        : [],
  );

  /** Forget one: that app is written for (or polished) as eagerly as before. */
  const undoWriting = (bundle: string, kind: "written" | "polished") => {
    const pref = s.writing_prefs?.[bundle];
    if (!pref) return;
    const next = {
      ...pref,
      written_reverts: kind === "written" ? 0 : pref.written_reverts,
      polished_reverts: kind === "polished" ? 0 : pref.polished_reverts,
    };
    const prefs = { ...s.writing_prefs };
    if (next.written_reverts === 0 && next.polished_reverts === 0)
      delete prefs[bundle];
    else prefs[bundle] = next;
    save({ ...s, writing_prefs: prefs });
  };

  const pauseItems: MoreMenuItem[] = [
    {
      key: "hour",
      label: t("privacy.state.pauseHour"),
      onSelect: () => commands.pauseAgent(60).then(refresh),
    },
    {
      key: "day",
      label: t("privacy.state.pauseDay"),
      onSelect: () => commands.pauseAgent(60 * 24).then(refresh),
    },
  ];

  return (
    <Stagger className="max-w-3xl w-full mx-auto">
      <StaggerItem>
        <header className="mb-section">
          <h1 className="text-title font-light">{t("privacy.title")}</h1>
        </header>
      </StaggerItem>

      <div className="space-y-section">
        {/* The promise: four short lines, always in view. */}
        <StaggerItem>
          <ul className="grid grid-cols-2 gap-inline">
            {PROMISES.map(({ key, icon: Icon }) => (
              <li
                key={key}
                className="glass flex items-center gap-3 rounded-card px-item-x py-item-y"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-glass-press text-text">
                  <Icon width={14} height={14} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 text-small text-ink-2">
                  {t(`privacy.promises.${key}`)}
                </span>
              </li>
            ))}
          </ul>
        </StaggerItem>

        {/* State + pause */}
        <StaggerItem>
          <div className="glass rounded-panel p-card">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-glass-press">
                  <ShieldCheck width={15} height={15} strokeWidth={1.75} />
                  <span
                    aria-hidden="true"
                    className={`absolute end-0 top-0 size-2 rounded-full ${
                      state === "on"
                        ? "bg-moss"
                        : state === "paused"
                          ? "bg-warning"
                          : "bg-ink-3"
                    }`}
                  />
                </span>
                <div className="min-w-0">
                  <p className="text-ui font-medium">
                    {t(`privacy.state.${state}`)}
                  </p>
                  {/* "Watching, as you allowed" says it all; a pause or
                      "off" needs its line. */}
                  {state !== "on" && (
                    <p className="truncate text-small text-ink-2">
                      {status.paused && s.paused_until
                        ? t("privacy.state.pausedUntil", {
                            time: time(s.paused_until),
                          })
                        : t(`privacy.state.${state}Detail`)}
                    </p>
                  )}
                </div>
              </div>
              {state !== "off" &&
                (status.paused ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0 whitespace-nowrap"
                    onClick={() => commands.pauseAgent(null).then(refresh)}
                  >
                    {t("privacy.state.resume")}
                  </Button>
                ) : (
                  <MoreMenu
                    className="shrink-0"
                    text={t("privacy.state.pause")}
                    label={t("privacy.state.pause")}
                    items={pauseItems}
                  />
                ))}
            </div>
            {!status.accessibility && IS_LINUX && (
              <div className="mt-4 space-y-2 border-t-[0.5px] border-glass-edge pt-4">
                <p className="text-small text-ink-2">
                  {t("privacy.accessibilityLinux")}
                </p>
                <div className="flex items-center justify-between gap-4">
                  <code className="min-w-0 truncate rounded-chip bg-glass-press px-2 py-1 font-mono text-meta text-ink-2">
                    {LINUX_A11Y_COMMAND}
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0 whitespace-nowrap"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(LINUX_A11Y_COMMAND)
                        .then(() => toast.success(t("privacy.commandCopied")))
                        .catch(() =>
                          toast.error(t("privacy.commandCopyFailed")),
                        )
                    }
                  >
                    {t("privacy.copyCommand")}
                  </Button>
                </div>
                <p className="text-meta text-ink-3">
                  {t("privacy.accessibilityLinuxChrome")}
                </p>
              </div>
            )}
            {!status.accessibility && !IS_LINUX && (
              <div className="mt-4 flex items-center justify-between gap-4 border-t-[0.5px] border-glass-edge pt-4">
                <p className="min-w-0 text-small text-ink-2">
                  {t("privacy.accessibility")}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0 whitespace-nowrap"
                  onClick={() => requestAccessibilityPermission()}
                >
                  {t("privacy.grant")}
                </Button>
              </div>
            )}
          </div>
        </StaggerItem>

        <StaggerItem>
          <AtAGlance reads={reads} cloud={cloud} paused={status.paused} />
        </StaggerItem>

        {/* Capabilities, grouped by what they touch. Each row: what it reads,
            then (smaller) what leaves the Mac. */}
        <StaggerItem className="space-y-label">
          <div className="flex items-center gap-1.5 px-row-x">
            <h2 className="text-section font-medium text-ink-3">
              {t("privacy.capabilities.title")}
            </h2>
            <InfoTooltip text={t("privacy.capabilities.description")} />
          </div>
          {CAPABILITY_GROUPS.map((group) => (
            <div key={group.key} className="glass rounded-panel">
              <p className="px-row-x pt-4.5 text-meta font-medium text-ink-3">
                {t(`privacy.capabilities.groups.${group.key}`)}
              </p>
              <div className="divide-y divide-glass-edge">
                {group.caps.map(({ cap, icon }) => capabilityRow(cap, icon))}
              </div>
            </div>
          ))}
        </StaggerItem>

        {/* Suggestions: one switch, then what it has learned by voice. */}
        <SettingsGroup title={t("privacy.suggestions.title")}>
          {capabilityRow("proactive", Sparkles)}
          <AnimatePresence initial={false}>
            {s.proactive && (
              <motion.div {...expand} className="overflow-hidden">
                <div className={BLOCK}>
                  <p className="flex items-center gap-1.5 text-meta font-medium text-ink-3">
                    {t("privacy.suggestions.learned.title")}
                    <InfoTooltip text={t("privacy.suggestions.teach")} />
                  </p>
                  {learned.length === 0 ? (
                    <p className="mt-1.5 text-small leading-relaxed text-ink-2">
                      {t("privacy.suggestions.learned.empty")}
                    </p>
                  ) : (
                    <ul className="mt-1.5 divide-y divide-glass-edge">
                      {learned.map(({ kind, app }) => (
                        <li
                          key={`${kind}:${app ?? ""}`}
                          className="flex items-center gap-3 py-2.5"
                        >
                          <BellOff
                            width={13}
                            height={13}
                            strokeWidth={1.75}
                            className="shrink-0 text-ink-3"
                            aria-hidden="true"
                          />
                          <span
                            className="min-w-0 flex-1 text-small"
                            title={app ?? undefined}
                          >
                            {app === null
                              ? t("privacy.suggestions.learned.never", {
                                  kind: kindLabel(kind),
                                })
                              : t("privacy.suggestions.learned.notIn", {
                                  kind: kindLabel(kind),
                                  app: appName(app),
                                })}
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="shrink-0 whitespace-nowrap"
                            onClick={() => undoPref(kind, app)}
                          >
                            <Undo2 width={12} height={12} aria-hidden="true" />
                            {t("privacy.suggestions.learned.undo")}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </SettingsGroup>

        {/* Writing: what "Use my words" taught it, per app. */}
        <SettingsGroup title={t("privacy.writing.title")}>
          <div className={BLOCK}>
            <p className="flex items-center gap-1.5 text-meta font-medium text-ink-3">
              {t("privacy.writing.learned")}
              <InfoTooltip text={t("privacy.writing.teach")} />
            </p>
            {writingLearned.length === 0 ? (
              <p className="mt-1.5 text-small leading-relaxed text-ink-2">
                {t("privacy.writing.empty")}
              </p>
            ) : (
              <ul className="mt-1.5 divide-y divide-glass-edge">
                {writingLearned.map(({ bundle, name, kind }) => (
                  <li
                    key={`${bundle}:${kind}`}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <PenLine
                      width={13}
                      height={13}
                      strokeWidth={1.75}
                      className="shrink-0 text-ink-3"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 text-small" title={bundle}>
                      {t(`privacy.writing.less.${kind}`, {
                        app: name || appName(bundle),
                      })}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="shrink-0 whitespace-nowrap"
                      onClick={() => undoWriting(bundle, kind)}
                    >
                      <Undo2 width={12} height={12} aria-hidden="true" />
                      {t("privacy.suggestions.learned.undo")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SettingsGroup>

        {/* Where the intelligence runs: every platform, three choices. */}
        <SettingsGroup
          title={t("privacy.intelligence.title")}
          description={t("privacy.intelligence.description")}
        >
          <div className="flex items-center gap-2 px-row-x py-3.5 text-meta text-ink-3">
            <Cpu
              width={12}
              height={12}
              strokeWidth={1.75}
              className="shrink-0"
              aria-hidden="true"
            />
            {!status.on_device_ready
              ? t("privacy.intelligence.capability.none")
              : onDeviceAi?.engine === "downloaded"
                ? t("privacy.intelligence.capability.downloaded")
                : t("privacy.intelligence.capability.apple")}
          </div>
          <div
            role="radiogroup"
            aria-label={t("privacy.intelligence.title")}
            className="divide-y divide-glass-edge"
          >
            {INTELLIGENCE.map(({ key, icon: Icon }) => {
              const picked = s.intelligence === key;
              // Without an on-device model, "On this computer only" is
              // rules only: say so plainly.
              // Where one can be downloaded, choosing it says which model and
              // starts the download (progress below), as in setup.
              const basic =
                key === "device" && !status.on_device_ready && !toDownload;
              const fetches = key === "device" && toDownload;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  data-search-row
                  onClick={() => {
                    save({ ...s, intelligence: key });
                    if (fetches && !aiDownloading) downloadAi(null);
                  }}
                  className={`${ROW_ONE} w-full text-start`}
                >
                  <span className="mt-px grid size-7 shrink-0 place-items-center rounded-full bg-glass-press text-text">
                    <Icon width={14} height={14} strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-ui">
                      {basic
                        ? t("privacy.intelligence.options.device.titleBasic")
                        : t(`privacy.intelligence.options.${key}.title`)}
                      <InfoTooltip
                        nested
                        text={
                          basic
                            ? t(
                                "privacy.intelligence.options.device.descriptionBasic",
                              )
                            : fetches && !aiDownloading
                              ? t(
                                  "privacy.intelligence.options.device.descriptionDownload",
                                  {
                                    model: toDownload.name,
                                    size: formatModelSize(
                                      onDeviceAi?.size_mb ?? toDownload.size_mb,
                                    ),
                                  },
                                )
                              : t(
                                  `privacy.intelligence.options.${key}.description`,
                                )
                        }
                      />
                    </span>
                    {fetches && aiDownloading && (
                      <span className="mt-0.5 block text-small text-ink-2">
                        {t(
                          "privacy.intelligence.options.device.descriptionDownloading",
                          {
                            model: toDownload.name,
                            size: formatModelSize(
                              onDeviceAi?.size_mb ?? toDownload.size_mb,
                            ),
                          },
                        )}
                      </span>
                    )}
                  </span>
                  <Radio checked={picked} />
                </button>
              );
            })}
          </div>
          {/* Download on-device AI (or, on a Mac, choose it over Apple's). */}
          {onDeviceAi && (
            <OnDeviceAi
              status={onDeviceAi}
              models={reasoningModels}
              settings={s}
              save={save}
              refresh={refresh}
              starting={startingAi}
              download={downloadAi}
              list={false}
            />
          )}
          <AnimatePresence initial={false}>
            {/* Automatic, with an on-device model: also use it for answers? */}
            {s.intelligence === "auto" && status.on_device_ready && (
              <motion.div key="engine" {...expand} className="overflow-hidden">
                <div className="flex items-start justify-between gap-6 px-row-x py-4.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-ui">
                      {onDeviceAi?.engine === "downloaded"
                        ? t("privacy.engine.titleDownloaded")
                        : t("privacy.engine.title")}
                      <InfoTooltip
                        text={
                          onDeviceAi?.engine === "downloaded"
                            ? t("privacy.engine.descriptionDownloaded")
                            : t("privacy.engine.description")
                        }
                      />
                    </p>
                  </div>
                  <div className="shrink-0">
                    <Switch
                      checked={s.on_device_when_possible}
                      ariaLabel={t("privacy.engine.title")}
                      onChange={(on) =>
                        save({ ...s, on_device_when_possible: on })
                      }
                    />
                  </div>
                </div>
              </motion.div>
            )}
            {/* Automatic, no on-device model: the one-time cloud offer's answer. */}
            {s.intelligence === "auto" && !status.on_device_ready && (
              <motion.div key="cloud" {...expand} className="overflow-hidden">
                <div className="flex items-start justify-between gap-6 px-row-x py-4.5">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ui">
                      {t("privacy.intelligence.cloudSuggestions.title")}
                      <InfoTooltip
                        text={t(
                          "privacy.intelligence.cloudSuggestions.description",
                        )}
                      />
                      {!paid && (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-glass-press px-2 py-0.5 text-meta text-ink-2">
                          <Lock width={10} height={10} />
                          {t("account.plans.pro")}
                        </span>
                      )}
                    </p>
                  </div>
                  <Switch
                    checked={paid && s.cloud_suggestions === "accepted"}
                    disabled={!paid}
                    ariaLabel={t("privacy.intelligence.cloudSuggestions.title")}
                    onChange={(on) =>
                      save({
                        ...s,
                        cloud_suggestions: on ? "accepted" : "declined",
                      })
                    }
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </SettingsGroup>

        {/* What Ambient sees */}
        {SCREEN_AGENT && (
          <SettingsGroup
            title={t("privacy.preview.title")}
            description={t("privacy.preview.description")}
          >
            <div className={BLOCK}>
              <div className="flex items-center justify-between gap-4">
                <p className="min-w-0 text-small text-ink-2">
                  {previewing
                    ? t("privacy.preview.switchNow")
                    : t("privacy.preview.hint")}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  disabled={previewing}
                  onClick={runPreview}
                >
                  <Eye width={13} height={13} />
                  {t("privacy.preview.button")}
                </Button>
              </div>
              <AnimatePresence>
                {(preview || previewNote) && (
                  <motion.div {...expand} className="overflow-hidden">
                    {previewNote && (
                      <p className="mt-3 text-small text-ink-2">
                        {previewNote}
                      </p>
                    )}
                    {preview && (
                      <div className="mt-3 rounded-card bg-glass-press px-item-x py-item-y">
                        <div className="flex items-center justify-between gap-3">
                          <p className="min-w-0 truncate text-small">
                            <span className="font-medium">
                              {preview.app?.name}
                            </span>
                            {preview.window_title && (
                              <span className="text-ink-2">
                                {" "}
                                · {preview.window_title}
                              </span>
                            )}
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 whitespace-nowrap"
                            onClick={() =>
                              neverWatch(preview.app?.bundle_id ?? "")
                            }
                          >
                            {t("privacy.neverWatch.this")}
                          </Button>
                        </div>
                        {preview.url && (
                          <p className="mt-0.5 truncate text-meta text-ink-3">
                            {preview.url}
                          </p>
                        )}
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-meta leading-relaxed text-ink-2">
                          {preview.text?.trim() || t("privacy.preview.noText")}
                        </pre>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </SettingsGroup>
        )}

        {/* Never watch */}
        <SettingsGroup
          title={t("privacy.neverWatch.title")}
          description={t("privacy.neverWatch.description")}
        >
          <div className={`flex flex-wrap gap-1.5 ${BLOCK}`}>
            {status.never_watch_defaults.map((id) => (
              <span
                key={id}
                className="rounded-full bg-glass-press px-2.5 py-1 text-meta text-ink-2"
                title={id}
              >
                {shortBundle(id)}
              </span>
            ))}
            {s.never_watch.map((id) => (
              <button
                key={id}
                type="button"
                title={id}
                onClick={() =>
                  save({
                    ...s,
                    never_watch: s.never_watch.filter((b) => b !== id),
                  })
                }
                className="group rounded-full bg-text/90 px-2.5 py-1 text-meta text-background"
              >
                {shortBundle(id)}
                <span className="ms-1 opacity-50 group-hover:opacity-100">
                  ×
                </span>
              </button>
            ))}
          </div>
        </SettingsGroup>

        {/* What's stored */}
        <SettingsGroup
          title={t("privacy.stored.title")}
          description={t("privacy.stored.description")}
        >
          <div className={BLOCK}>
            {/* What's kept, and the way to drop it, on one line. */}
            <div className="flex items-center justify-between gap-4">
              <p className="min-w-0 text-small text-ink-2">
                {status.stats && status.stats.screen_entries > 0
                  ? t("privacy.stored.summary", {
                      count: status.stats.screen_entries,
                      since: status.stats.oldest_ts
                        ? time(status.stats.oldest_ts)
                        : "",
                    })
                  : t("privacy.stored.empty")}
              </p>
              <Button
                variant="danger-ghost"
                size="sm"
                className="shrink-0"
                onClick={deleteAll}
              >
                {t("privacy.stored.deleteAll")}
              </Button>
            </div>
            {status.stats && status.stats.screen_entries > 0 && (
              <>
                <ul className="mt-3 space-y-1.5">
                  {status.stats.by_app.map((a) => (
                    <li
                      key={a.bundle_id}
                      className="flex items-center justify-between gap-4 text-small"
                    >
                      <span className="min-w-0 truncate" title={a.bundle_id}>
                        {shortBundle(a.bundle_id)}
                      </span>
                      <span className="flex shrink-0 items-center gap-3 whitespace-nowrap text-ink-2">
                        {t("privacy.stored.entries", { count: a.entries })}
                        <button
                          type="button"
                          aria-label={t("privacy.stored.deleteApp")}
                          onClick={() =>
                            commands
                              .deleteScreenMemoryApp(a.bundle_id)
                              .then(refresh)
                          }
                          className="text-ink-3 hover:text-text"
                        >
                          <Trash2 width={13} height={13} />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </SettingsGroup>

        <UsageStats />

        {/* Network ledger */}
        <SettingsGroup
          title={t("privacy.ledger.title")}
          description={t("privacy.ledger.description")}
        >
          {ledger.length === 0 ? (
            <p className={`${BLOCK} text-small text-ink-2`}>
              {t("privacy.ledger.empty")}
            </p>
          ) : (
            ledger.map((e) => (
              <div key={e.id} className="px-row-x py-row-y">
                <button
                  type="button"
                  onClick={() =>
                    setOpenLedger(openLedger === e.id ? null : e.id)
                  }
                  className="flex w-full items-center gap-3 text-start text-small"
                >
                  <span className="w-28 shrink-0 tabular-nums text-ink-3">
                    {time(e.ts)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {t(`privacy.ledger.purpose.${e.purpose}`, {
                      defaultValue: e.purpose,
                    })}
                    <span className="text-ink-3"> → {e.destination}</span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums text-ink-3">
                    {t("privacy.ledger.bytes", { count: e.bytes })}
                  </span>
                  <ChevronDown
                    width={13}
                    height={13}
                    className={`shrink-0 text-ink-3 transition-transform ${openLedger === e.id ? "rotate-180" : ""}`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {openLedger === e.id && (
                    <motion.div {...expand} className="overflow-hidden">
                      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-card bg-glass-press p-3 text-meta leading-relaxed text-ink-2">
                        {e.preview}
                      </pre>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))
          )}
        </SettingsGroup>
      </div>
    </Stagger>
  );
};
