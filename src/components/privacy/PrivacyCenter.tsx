import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowUpRight,
  AudioLines,
  ChevronDown,
  Eye,
  History,
  KeyRound,
  Laptop,
  ListChecks,
  Lock,
  Mic,
  ScanText,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { requestAccessibilityPermission } from "tauri-plugin-macos-permissions-api";
import { type as osType } from "@tauri-apps/plugin-os";
import {
  commands,
  type AgentSettings,
  type AgentStatus,
  type ContextSnapshot,
  type LedgerEntry,
} from "@/bindings";
import { Button } from "../ui/Button";
import { Switch } from "../ui/Switch";
import { MoreMenu, type MoreMenuItem } from "../ui/MoreMenu";
import { SettingsGroup } from "../ui/SettingsGroup";
import { isPaid, usePlan } from "../account/usePlan";
import { useGetStarted } from "../getstarted/store";

const RETENTION_CHOICES = [1, 3, 7, 14, 30];
/** The guarantees, always shown at the top: four short lines. */
const PROMISES = [
  { key: "voice", icon: Mic },
  { key: "text", icon: ScanText },
  { key: "sensitive", icon: KeyRound },
  { key: "ledger", icon: ListChecks },
] as const;
const PREVIEW_DELAY_MS = 3000;

/** "com.tinyspeck.slackmacgap" → "slackmacgap"; good enough without a name lookup. */
const shortBundle = (id: string) => id.split(".").pop() || id;

type Capability =
  | "screen_context"
  | "screen_memory"
  | "proactive"
  | "meetings"
  | "wake_word"
  | "on_device_only";
/** Reading other apps' windows is macOS-only for now (Windows UI Automation is P6). */
const MAC_ONLY: Capability[] = [
  "screen_context",
  "screen_memory",
  "proactive",
  "on_device_only",
];
const IS_MAC = osType() === "macos";
/** Capabilities grouped by what they touch, each with its icon. */
const CAPABILITY_GROUPS: {
  key: "screen" | "listening" | "local";
  caps: { cap: Capability; icon: LucideIcon }[];
}[] = [
  {
    key: "screen",
    caps: [
      { cap: "screen_context", icon: ScanText },
      { cap: "screen_memory", icon: History },
      { cap: "proactive", icon: Sparkles },
    ],
  },
  {
    key: "listening",
    caps: [
      { cap: "meetings", icon: Users },
      { cap: "wake_word", icon: AudioLines },
    ],
  },
  { key: "local", caps: [{ cap: "on_device_only", icon: Laptop }] },
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

  const refresh = useCallback(async () => {
    setStatus(await commands.getAgentStatus());
    const l = await commands.getNetworkLedger(50);
    if (l.status === "ok") setLedger(l.data);
  }, []);

  useEffect(() => {
    useGetStarted.getState().mark("privacy");
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  if (!status) return null;
  const s = status.settings;

  const save = async (next: AgentSettings) => {
    setStatus({ ...status, settings: next });
    const r = await commands.setAgentSettings(next);
    if (r.status === "error") toast.error(r.error);
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
    else toast.error(r.error);
    refresh();
  };

  const state = status.paused
    ? "paused"
    : s.screen_context || s.screen_memory || s.proactive || s.meetings
      ? "on"
      : "off";

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
    <div className="max-w-3xl w-full mx-auto">
      <header className="mb-section">
        <h1 className="text-title font-light">{t("privacy.title")}</h1>
        <p className="mt-1 max-w-xl text-small text-ink-2">
          {t("privacy.promise")}
        </p>
      </header>

      <div className="space-y-section">
        {/* The promise: four short lines, always in view. */}
        <ul className="grid grid-cols-2 gap-2">
          {PROMISES.map(({ key, icon: Icon }) => (
            <li
              key={key}
              className="glass flex items-center gap-2.5 rounded-card px-3 py-2.5"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-glass-press text-text">
                <Icon width={14} height={14} strokeWidth={1.75} />
              </span>
              <span className="text-small text-ink-2">
                {t(`privacy.promises.${key}`)}
              </span>
            </li>
          ))}
        </ul>

        {/* State + pause */}
        <div className="glass rounded-panel px-card py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-glass-press">
                <ShieldCheck width={15} height={15} strokeWidth={1.75} />
                <span
                  aria-hidden="true"
                  className={`absolute end-0 top-0 size-2 rounded-full ${
                    state === "on"
                      ? "bg-[#22c55e]"
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
                <p className="truncate text-small text-ink-2">
                  {status.paused && s.paused_until
                    ? t("privacy.state.pausedUntil", {
                        time: time(s.paused_until),
                      })
                    : t(`privacy.state.${state}Detail`)}
                </p>
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
          {!status.accessibility && (
            <div className="mt-3 flex items-center justify-between gap-4 border-t-[0.5px] border-glass-edge pt-3">
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

        {/* Capabilities, grouped by what they touch. Each row: what it reads,
            then (smaller) what leaves the Mac. */}
        <div className="space-y-label">
          <div className="px-row-x">
            <h2 className="text-section font-medium text-ink-3">
              {t("privacy.capabilities.title")}
            </h2>
            <p className="mt-1 text-meta text-ink-3">
              {t("privacy.capabilities.description")}
            </p>
          </div>
          {CAPABILITY_GROUPS.map((group) => (
            <div key={group.key} className="glass rounded-panel">
              <p className="px-row-x pt-3 pb-1 text-meta font-medium text-ink-3">
                {t(`privacy.capabilities.groups.${group.key}`)}
              </p>
              <div className="divide-y divide-glass-edge">
                {group.caps.map(({ cap, icon: Icon }) => {
                  const proOnly = cap !== "on_device_only";
                  const unsupported = !IS_MAC && MAC_ONLY.includes(cap);
                  const locked = (proOnly && !paid) || unsupported;
                  return (
                    <div
                      key={cap}
                      data-search-row
                      className="flex items-start gap-3 px-row-x py-row-y"
                    >
                      <span className="mt-px grid size-7 shrink-0 place-items-center rounded-full bg-glass-press text-text">
                        <Icon width={14} height={14} strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ui">
                          {t(`privacy.capabilities.${cap}.title`)}
                          {unsupported ? (
                            <span className="rounded-full bg-glass-press px-2 py-0.5 text-meta text-ink-2">
                              {t("privacy.macOnly")}
                            </span>
                          ) : (
                            locked && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-glass-press px-2 py-0.5 text-meta text-ink-2">
                                <Lock width={10} height={10} />
                                {t("account.plans.pro")}
                              </span>
                            )
                          )}
                        </p>
                        <p className="mt-0.5 text-small text-ink-2">
                          {t(`privacy.capabilities.${cap}.reads`)}
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-meta text-ink-3">
                          <ArrowUpRight
                            width={11}
                            height={11}
                            strokeWidth={1.75}
                            className="shrink-0"
                            aria-hidden="true"
                          />
                          {t(`privacy.capabilities.${cap}.leaves`)}
                        </p>
                        {cap === "screen_memory" && s.screen_memory && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="text-small text-ink-2">
                              {t("privacy.retention")}
                            </span>
                            {RETENTION_CHOICES.map((d) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() =>
                                  save({ ...s, retention_days: d })
                                }
                                className={`rounded-full px-2.5 py-0.5 text-meta transition-colors ${
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
                      <Switch
                        checked={s[cap]}
                        disabled={locked}
                        ariaLabel={t(`privacy.capabilities.${cap}.title`)}
                        onChange={(on) => save({ ...s, [cap]: on })}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Where AI runs (Apple Intelligence: Mac only) */}
        {IS_MAC && (
          <SettingsGroup title={t("privacy.engine.title")}>
            <div className="flex items-start justify-between gap-6 px-row-x py-row-y">
              <p className="max-w-lg text-small text-ink-2">
                {status.on_device_ready
                  ? t("privacy.engine.description")
                  : t("privacy.engine.unavailable")}
              </p>
              <Switch
                checked={s.on_device_when_possible && status.on_device_ready}
                disabled={!status.on_device_ready}
                ariaLabel={t("privacy.engine.title")}
                onChange={(on) => save({ ...s, on_device_when_possible: on })}
              />
            </div>
          </SettingsGroup>
        )}

        {/* Suggestions: what it has learned */}
        {s.proactive && (
          <SettingsGroup
            title={t("privacy.suggestions.title")}
            description={t("privacy.suggestions.description")}
          >
            {status.suggestion_kinds.map((kind) => {
              const pref = s.suggestion_prefs[kind];
              const muted = pref?.muted_apps ?? [];
              return (
                <div
                  key={kind}
                  className="flex items-center justify-between gap-6 px-row-x py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-ui">
                      {t(`privacy.suggestions.kinds.${kind}`)}
                    </p>
                    {muted.length > 0 && (
                      <button
                        type="button"
                        className="mt-0.5 text-meta text-ink-3 hover:text-text"
                        onClick={() =>
                          save({
                            ...s,
                            suggestion_prefs: {
                              ...s.suggestion_prefs,
                              [kind]: {
                                off: pref?.off ?? false,
                                muted_apps: [],
                              },
                            },
                          })
                        }
                      >
                        {t("privacy.suggestions.mutedIn", {
                          apps: muted.map(shortBundle).join(", "),
                        })}{" "}
                        ×
                      </button>
                    )}
                  </div>
                  <Switch
                    checked={!pref?.off}
                    ariaLabel={t(`privacy.suggestions.kinds.${kind}`)}
                    onChange={(on) =>
                      save({
                        ...s,
                        suggestion_prefs: {
                          ...s.suggestion_prefs,
                          [kind]: { off: !on, muted_apps: muted },
                        },
                      })
                    }
                  />
                </div>
              );
            })}
          </SettingsGroup>
        )}

        {/* What Ambient sees */}
        {IS_MAC && (
          <SettingsGroup
            title={t("privacy.preview.title")}
            description={t("privacy.preview.description")}
          >
            <div className="px-row-x py-row-y">
              <div className="flex items-center justify-between gap-4">
                <p className="text-small text-ink-2">
                  {previewing
                    ? t("privacy.preview.switchNow")
                    : t("privacy.preview.hint")}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={previewing}
                  onClick={runPreview}
                >
                  <Eye width={13} height={13} />
                  {t("privacy.preview.button")}
                </Button>
              </div>
              <AnimatePresence>
                {(preview || previewNote) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    {previewNote && (
                      <p className="mt-3 text-small text-ink-2">
                        {previewNote}
                      </p>
                    )}
                    {preview && (
                      <div className="mt-3 rounded-card bg-glass-press p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-small">
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
          <div className="flex flex-wrap gap-1.5 px-row-x py-row-y">
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
          <div className="px-row-x py-row-y">
            {status.stats && status.stats.screen_entries > 0 ? (
              <>
                <p className="text-small text-ink-2">
                  {t("privacy.stored.summary", {
                    count: status.stats.screen_entries,
                    since: status.stats.oldest_ts
                      ? time(status.stats.oldest_ts)
                      : "",
                  })}
                </p>
                <ul className="mt-3 space-y-1">
                  {status.stats.by_app.map((a) => (
                    <li
                      key={a.bundle_id}
                      className="flex items-center justify-between text-small"
                    >
                      <span title={a.bundle_id}>
                        {shortBundle(a.bundle_id)}
                      </span>
                      <span className="flex items-center gap-3 text-ink-2">
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
            ) : (
              <p className="text-small text-ink-2">
                {t("privacy.stored.empty")}
              </p>
            )}
            <div className="mt-4 flex justify-end">
              <Button variant="danger-ghost" size="sm" onClick={deleteAll}>
                {t("privacy.stored.deleteAll")}
              </Button>
            </div>
          </div>
        </SettingsGroup>

        {/* Network ledger */}
        <SettingsGroup
          title={t("privacy.ledger.title")}
          description={t("privacy.ledger.description")}
        >
          {ledger.length === 0 ? (
            <p className="px-row-x py-row-y text-small text-ink-2">
              {t("privacy.ledger.empty")}
            </p>
          ) : (
            ledger.map((e) => (
              <div key={e.id} className="px-row-x py-2.5">
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
                  <span className="tabular-nums text-ink-3">
                    {t("privacy.ledger.bytes", { count: e.bytes })}
                  </span>
                  <ChevronDown
                    width={13}
                    height={13}
                    className={`text-ink-3 transition-transform ${openLedger === e.id ? "rotate-180" : ""}`}
                  />
                </button>
                {openLedger === e.id && (
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-card bg-glass-press p-3 text-meta leading-relaxed text-ink-2">
                    {e.preview}
                  </pre>
                )}
              </div>
            ))
          )}
        </SettingsGroup>
      </div>
    </div>
  );
};
