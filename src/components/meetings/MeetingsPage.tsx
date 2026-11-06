import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { showError } from "@/lib/errors";
import {
  ArrowLeft,
  Copy,
  FileText,
  Mail,
  MessageCircle,
  Square,
  Trash2,
  Video,
} from "lucide-react";
import { type as osType } from "@tauri-apps/plugin-os";
import { hasScreenAgent } from "@/lib/agentPlatform";
import { AnimatePresence, motion } from "motion/react";
import {
  commands,
  type Meeting,
  type MeetingListItem,
  type MeetingState,
  type Segment,
  type UsageToday,
} from "@/bindings";
import { BRAND } from "@/lib/brand";
import { Orb } from "../orb/Orb";
import { Button } from "../ui/Button";
import { SettingsGroup } from "../ui/SettingsGroup";
import { Stagger, StaggerItem, easeOutSoft } from "../ui/Motion";
import { useSettings } from "../../hooks/useSettings";
import { openUpgrade } from "../account/usePlan";
import { EmailNotesButton, MeetingsEmailSetting } from "./MeetingsEmail";
import { usePendingMeeting } from "./pendingMeeting";

/** Call detection and call audio: macOS, Windows and Linux. */
const AUTO_DETECTS = hasScreenAgent(osType());

/** How the automatic flow goes, shown while idle. */
const AUTO_STEPS = [
  { key: "join", icon: Video },
  { key: "accept", icon: MessageCircle },
  { key: "summary", icon: FileText },
] as const;

/** `meeting::start`'s error when Free's meetings this month are used. */
const FREE_LIMIT = "meetings.error.freeLimit";

const SCREEN_RECORDING_SETTINGS =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

function toMarkdown(
  m: Meeting,
  t: (k: string) => string,
  when: string,
): string {
  const s = m.body.summary;
  const lines = [`# ${s?.title || t("meetings.untitled")}`, when, ""];
  if (s?.summary) lines.push(s.summary, "");
  const list = (title: string, items?: string[]) => {
    if (items?.length)
      lines.push(`## ${title}`, ...items.map((i) => `- ${i}`), "");
  };
  list(t("meetings.decisions"), s?.decisions);
  list(t("meetings.actionItems"), s?.action_items);
  list(t("meetings.questions"), s?.questions_for_you);
  if (m.body.notes.length)
    lines.push(`## ${t("meetings.notes")}`, ...m.body.notes, "");
  lines.push(`## ${t("meetings.transcript")}`);
  for (const seg of m.body.segments) {
    lines.push(
      `[${clock(seg.start_ms)}] ${seg.speaker === "me" ? t("meetings.you") : t("meetings.them")}: ${seg.text}`,
    );
  }
  return lines.join("\n");
}

export const MeetingsPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<MeetingState | null>(null);
  const [list, setList] = useState<MeetingListItem[]>([]);
  const [open, setOpen] = useState<Meeting | null>(null);
  const [live, setLive] = useState<Meeting | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageToday | null>(null);
  const transcriptEnd = useRef<HTMLDivElement>(null);
  const { getSetting, refreshSettings } = useSettings();
  const agent = getSetting("agent");

  const when = (secs: number) =>
    new Date(secs * 1000).toLocaleString(i18n.language, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const refresh = useCallback(async () => {
    const s = await commands.getMeetingState();
    setState(s);
    const l = await commands.listMeetings();
    if (l.status === "ok") setList(l.data);
    setUsage(await commands.getUsageToday());
    if (s.active && s.id !== null) {
      const m = await commands.getMeeting(s.id);
      if (m.status === "ok") setLive(m.data);
    } else {
      setLive(null);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unlisten = [
      listen<[number, Segment]>("meeting-segment", (e) => {
        const [, seg] = e.payload;
        setLive((m) =>
          m
            ? { ...m, body: { ...m.body, segments: [...m.body.segments, seg] } }
            : m,
        );
      }),
      listen<[number, string]>("meeting-notes", (e) => {
        const [, note] = e.payload;
        setLive((m) =>
          m ? { ...m, body: { ...m.body, notes: [...m.body.notes, note] } } : m,
        );
      }),
      listen("meeting-state", () => refresh()),
      listen<number>("meeting-ended", async (e) => {
        await refresh();
        const m = await commands.getMeeting(e.payload);
        if (m.status === "ok") setOpen(m.data);
      }),
    ];
    return () => unlisten.forEach((p) => p.then((f) => f()));
  }, [refresh]);

  useEffect(() => {
    if (!state?.active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state?.active]);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [live?.body.segments.length]);

  const start = async () => {
    setBusy(true);
    const r = await commands.startMeeting();
    setBusy(false);
    if (r.status === "error" && r.error === FREE_LIMIT) {
      // Free's meetings this month are used: kindly, with the way out.
      toast(
        t(FREE_LIMIT, {
          limit: usage?.meetings_limit ?? BRAND.freeMeetingsPerMonth,
        }),
        {
          action: { label: t("account.upgrade"), onClick: openUpgrade },
        },
      );
    } else if (r.status === "error") {
      showError("meeting", r.error, { retry: start });
    }
    await refresh();
  };

  const stop = async () => {
    setBusy(true);
    const r = await commands.stopMeeting();
    setBusy(false);
    if (r.status === "error") showError("meeting", r.error, { retry: stop });
  };

  // Call detection is the meetings capability (Privacy): with it on,
  // the agent offers to take notes when a call app is in front and the
  // mic is in use. Turning it on here is the same switch.
  const turnOnDetection = async () => {
    if (!agent) return;
    setBusy(true);
    const r = await commands.setAgentSettings({ ...agent, meetings: true });
    setBusy(false);
    if (r.status === "error") showError("settings", r.error);
    await refreshSettings();
  };

  const openMeeting = async (id: number) => {
    const m = await commands.getMeeting(id);
    if (m.status === "ok") {
      setFollowUp(null);
      setOpen(m.data);
    }
  };

  usePendingMeeting(openMeeting);

  const remove = async (id: number) => {
    await commands.deleteMeeting(id);
    setOpen(null);
    refresh();
  };

  const draftFollowUp = async (id: number) => {
    setBusy(true);
    const r = await commands.meetingFollowUp(id);
    setBusy(false);
    if (r.status === "ok") setFollowUp(r.data);
    else showError("meeting", r.error, { retry: () => draftFollowUp(id) });
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(t("meetings.copied"));
  };

  if (!state) return null;

  // ── a past meeting ──
  if (open && !(state.active && state.id === open.id)) {
    const s = open.body.summary;
    const section = (title: string, items?: string[]) =>
      items && items.length > 0 ? (
        <div className="px-row-x py-row-y">
          <p className="text-section font-medium text-ink-3">{title}</p>
          <ul className="mt-2 space-y-1.5">
            {items.map((i, n) => (
              <li key={n} className="text-ui leading-relaxed">
                {i}
              </li>
            ))}
          </ul>
        </div>
      ) : null;
    return (
      <Stagger key={`meeting-${open.id}`} className="max-w-3xl w-full mx-auto">
        <StaggerItem>
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="mb-4 inline-flex items-center gap-1.5 text-small text-ink-2 hover:text-text"
          >
            <ArrowLeft width={13} height={13} />
            {t("meetings.all")}
          </button>
          <header className="mb-section flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-title font-light">
                {s?.title || t("meetings.untitled")}
              </h1>
              <p className="mt-1 text-small text-ink-2">
                {when(open.started)}
                {open.ended &&
                  ` · ${clock((open.ended - open.started) * 1000)}`}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => copy(toMarkdown(open, t, when(open.started)))}
              >
                <Copy width={13} height={13} />
                {t("meetings.copyMarkdown")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy || !s}
                onClick={() => draftFollowUp(open.id)}
              >
                <Mail width={13} height={13} />
                {t("meetings.followUp")}
              </Button>
              <EmailNotesButton id={open.id} disabled={!s} />
            </div>
          </header>
        </StaggerItem>
        <div className="space-y-section">
          <AnimatePresence>
            {followUp && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.26, ease: easeOutSoft }}
              >
                <SettingsGroup title={t("meetings.followUpTitle")}>
                  <div className="px-row-x py-row-y">
                    <p className="whitespace-pre-wrap text-ui leading-relaxed">
                      {followUp}
                    </p>
                    <div className="mt-3 flex justify-end">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => copy(followUp)}
                      >
                        {t("meetings.copy")}
                      </Button>
                    </div>
                  </div>
                </SettingsGroup>
              </motion.div>
            )}
          </AnimatePresence>
          {s ? (
            <SettingsGroup title={t("meetings.summary")}>
              {s.summary && (
                <p className="px-row-x py-row-y text-ui leading-relaxed">
                  {s.summary}
                </p>
              )}
              {section(t("meetings.decisions"), s.decisions)}
              {section(t("meetings.actionItems"), s.action_items)}
              {section(t("meetings.questions"), s.questions_for_you)}
            </SettingsGroup>
          ) : (
            <StaggerItem>
              <p className="text-small text-ink-2">{t("meetings.noSummary")}</p>
            </StaggerItem>
          )}
          {open.body.notes.length > 0 && (
            <SettingsGroup title={t("meetings.notes")}>
              <div className="whitespace-pre-wrap px-row-x py-row-y text-ui leading-relaxed">
                {open.body.notes.join("\n")}
              </div>
            </SettingsGroup>
          )}
          <SettingsGroup title={t("meetings.transcript")}>
            <Transcript segments={open.body.segments} />
          </SettingsGroup>
          <StaggerItem className="flex justify-end">
            <Button
              variant="danger-ghost"
              size="sm"
              onClick={() => remove(open.id)}
            >
              <Trash2 width={13} height={13} />
              {t("meetings.delete")}
            </Button>
          </StaggerItem>
        </div>
      </Stagger>
    );
  }

  // ── list + live ──
  const elapsed = state.started ? now - state.started * 1000 : 0;
  // Call detection is on every plan; Free counts meetings a month.
  const autoState: Detection = !AUTO_DETECTS
    ? "unsupported"
    : agent?.meetings
      ? agent.paused_until && agent.paused_until * 1000 > now
        ? "paused"
        : "on"
      : "off";
  return (
    <Stagger key="list" className="max-w-3xl w-full mx-auto">
      <StaggerItem>
        <header className="mb-section">
          <h1 className="text-title font-light">{t("meetings.title")}</h1>
          <p className="mt-1 max-w-xl text-small text-ink-2">
            {t("meetings.intro")}
          </p>
        </header>
      </StaggerItem>
      <div className="space-y-section">
        <StaggerItem>
          {state.active ? (
            <div className="glass rounded-panel p-card">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="relative grid size-8 shrink-0 place-items-center">
                    <Orb variant="C2" size={22} />
                    <span className="absolute end-0 top-0 size-2 rounded-full bg-[#ef4444]" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-ui font-medium">
                      {t("meetings.live", { time: clock(elapsed) })}
                    </p>
                    <p className="text-small text-ink-2">
                      {state.system_audio
                        ? t("meetings.capturingBoth")
                        : t("meetings.capturingMic")}
                    </p>
                  </div>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  className="shrink-0 whitespace-nowrap"
                  disabled={busy}
                  onClick={stop}
                >
                  <Square width={11} height={11} />
                  {t("meetings.stop")}
                </Button>
              </div>
              {state.active && state.warning && (
                <div className="mt-4 flex items-center justify-between gap-4 border-t-[0.5px] border-glass-edge pt-4">
                  <p className="min-w-0 text-small text-ink-2">
                    {t(state.warning)}
                  </p>
                  {state.warning === "meetings.systemAudio.noPermission" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="shrink-0"
                      onClick={() => openUrl(SCREEN_RECORDING_SETTINGS)}
                    >
                      {t("meetings.openSettings")}
                    </Button>
                  )}
                </div>
              )}
              {state.active && (
                <div className="mt-4 flex items-center justify-between gap-4 border-t-[0.5px] border-glass-edge pt-4">
                  <p className="min-w-0 text-small text-ink-2">
                    {t("meetings.consent")}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() =>
                      copy(
                        t("meetings.consentMessage", { appName: BRAND.name }),
                      )
                    }
                  >
                    {t("meetings.copyConsent")}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <IdleCard
              detection={autoState}
              busy={busy}
              freeLeft={
                usage?.meetings_limit != null
                  ? t("meetings.freeLeft", {
                      left: Math.max(0, usage.meetings_limit - usage.meetings),
                      limit: usage.meetings_limit,
                    })
                  : null
              }
              onTurnOn={turnOnDetection}
              onStart={start}
            />
          )}
        </StaggerItem>

        {state.active && live && (
          <>
            {live.body.notes.length > 0 && (
              <SettingsGroup title={t("meetings.notes")}>
                <div className="whitespace-pre-wrap px-row-x py-row-y text-ui leading-relaxed">
                  {live.body.notes.join("\n")}
                </div>
              </SettingsGroup>
            )}
            <SettingsGroup title={t("meetings.transcript")}>
              {live.body.segments.length === 0 ? (
                <p className="px-row-x py-row-y text-small text-ink-2">
                  {t("meetings.listening")}
                </p>
              ) : (
                <Transcript segments={live.body.segments} />
              )}
              <div ref={transcriptEnd} />
            </SettingsGroup>
          </>
        )}

        <MeetingsEmailSetting />

        <SettingsGroup title={t("meetings.past")}>
          {list.filter((m) => m.id !== state.id).length === 0 ? (
            <p className="px-row-x py-row-y text-small text-ink-2">
              {t("meetings.empty")}
            </p>
          ) : (
            list
              .filter((m) => m.id !== state.id)
              .map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => openMeeting(m.id)}
                  className="flex w-full items-center justify-between gap-4 px-row-x py-row-y text-start transition-colors hover:bg-glass-hover"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-ui">
                      {m.title || t("meetings.untitled")}
                    </span>
                    <span className="mt-0.5 block text-small text-ink-3">
                      {when(m.started)}
                    </span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-small text-ink-3">
                    {m.ended
                      ? clock((m.ended - m.started) * 1000)
                      : t("meetings.unfinished")}
                  </span>
                </button>
              ))
          )}
        </SettingsGroup>
      </div>
    </Stagger>
  );
};

const Transcript: React.FC<{ segments: Segment[] }> = ({ segments }) => {
  const { t } = useTranslation();
  return (
    <div className="max-h-[420px] space-y-2.5 overflow-y-auto px-row-x py-row-y">
      {segments.map((s, i) => (
        <div key={i} className="flex gap-3 text-ui leading-relaxed">
          <span className="w-12 shrink-0 tabular-nums text-ink-3">
            {clock(s.start_ms)}
          </span>
          <span
            className={`w-12 shrink-0 ${s.speaker === "me" ? "text-text" : "text-ink-2"}`}
          >
            {s.speaker === "me" ? t("meetings.you") : t("meetings.them")}
          </span>
          <span className="min-w-0">{s.text}</span>
        </div>
      ))}
    </div>
  );
};

type Detection = "on" | "off" | "paused" | "unsupported";

/**
 * Idle: notes start themselves. While a call app is in front and the mic is
 * in use, the agent offers to take notes; this card says so, and keeps a
 * manual start as the secondary way in.
 */
const IdleCard: React.FC<{
  detection: Detection;
  busy: boolean;
  freeLeft: string | null;
  onTurnOn: () => void;
  onStart: () => void;
}> = ({ detection, busy, freeLeft, onTurnOn, onStart }) => {
  const { t } = useTranslation();
  const auto = detection === "on";
  return (
    <div className="glass rounded-panel p-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="relative grid size-8 shrink-0 place-items-center">
            <Orb variant="B1" size={22} />
            {auto && (
              <span className="absolute end-0 top-0 size-2 rounded-full bg-[#22c55e]" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-ui font-medium">
              {t(`meetings.auto.${detection}`)}
            </p>
            <p className="mt-0.5 text-small text-ink-2">
              {t(`meetings.auto.${detection}Detail`)}
            </p>
            {freeLeft && (
              <p className="mt-0.5 text-small text-ink-3">{freeLeft}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {detection === "off" && (
            <Button
              variant="primary"
              size="sm"
              className="whitespace-nowrap"
              disabled={busy}
              onClick={onTurnOn}
            >
              {t("meetings.auto.turnOn")}
            </Button>
          )}
          <Button
            variant={detection === "off" ? "ghost" : "secondary"}
            size="sm"
            className="whitespace-nowrap"
            disabled={busy}
            onClick={onStart}
            title={t("meetings.startNowHint")}
          >
            {t("meetings.startNow")}
          </Button>
        </div>
      </div>
      {detection !== "unsupported" && (
        <ol className="mt-4 grid grid-cols-3 gap-2 border-t-[0.5px] border-glass-edge pt-4">
          {AUTO_STEPS.map(({ key, icon: Icon }) => (
            <li
              key={key}
              className={`flex items-center gap-2.5 text-small ${auto ? "text-ink-2" : "text-ink-3"}`}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-glass-press text-text">
                <Icon width={13} height={13} strokeWidth={1.75} />
              </span>
              <span className="min-w-0">{t(`meetings.steps.${key}`)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};
