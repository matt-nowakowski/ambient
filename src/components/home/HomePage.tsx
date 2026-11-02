import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  Copy,
  Lightbulb,
  MessageSquareText,
} from "lucide-react";
import { commands, events, type HistoryEntry } from "@/bindings";
import { useSettings } from "../../hooks/useSettings";
import { useOsType } from "../../hooks/useOsType";
import { formatRelativeTime } from "../../utils/dateFormat";
import { copyToClipboard } from "../settings/history/clipboard";
import { pickAndTranscribeFiles } from "../settings/history/transcribeFiles";
import { usePlan } from "../account/usePlan";
import { PlanSummary } from "../account/PlanSummary";
import { PrivacySummary } from "./PrivacySummary";
import { GetStartedCard } from "../getstarted/GetStartedCard";
import { Keycaps } from "../shared/Keycaps";
import { EmptyState } from "../ui/EmptyState";
import { Skeleton } from "../ui/Skeleton";
import { Stagger, StaggerItem, spring } from "../ui/Motion";
import {
  IconSwap,
  NumberPopIn,
  SkeletonReveal,
  TextSwap,
} from "../ui/Transitions";
import { QuickActions } from "./QuickActions";

const RECENT_COUNT = 5;
// Typing vs speaking speeds behind "time saved" (words per minute).
const TYPING_WPM = 40;
const SPEAKING_WPM = 150;
const TIPS = ["holdOrTap", "customWords", "dropFile", "languages"] as const;

/** Idle "listening" bars beside the greeting. */
const Waveform: React.FC = () => (
  <div className="flex h-14 items-center gap-[5px]" aria-hidden="true">
    {[0.35, 0.7, 1, 0.55, 0.85, 0.45, 0.25].map((h, i) => (
      <motion.span
        key={i}
        className="w-[5px] rounded-full bg-text"
        initial={{ height: 14, opacity: 0.35 }}
        animate={{
          height: [14, 14 + 42 * h, 18, 14 + 30 * h, 14],
          opacity: [0.35, 0.9, 0.5, 0.8, 0.35],
        }}
        transition={{
          duration: 2.6,
          repeat: Infinity,
          delay: i * 0.12,
          ease: "easeInOut",
        }}
      />
    ))}
  </div>
);

const greetingKey = () => {
  const h = new Date().getHours();
  if (h < 5) return "home.greeting.night";
  if (h < 12) return "home.greeting.morning";
  if (h < 18) return "home.greeting.afternoon";
  return "home.greeting.evening";
};

interface HomePageProps {
  onOpenHistory: () => void;
  onOpenAccount: () => void;
  onOpenPrivacy: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  onOpenHistory,
  onOpenAccount,
  onOpenPrivacy,
}) => {
  const { t, i18n } = useTranslation();
  const { getSetting } = useSettings();
  const osType = useOsType();
  const { status } = usePlan();
  const [recent, setRecent] = useState<HistoryEntry[] | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [tip, setTip] = useState(0);
  const [actionsOpen, setActionsOpen] = useState(false);

  const binding = getSetting("bindings")?.transcribe?.current_binding ?? "";
  const words = status?.words_this_week ?? 0;
  const minutesSaved = words / TYPING_WPM - words / SPEAKING_WPM;
  const fmt = new Intl.NumberFormat(i18n.language);

  useEffect(() => {
    commands.getHistoryEntries(null, RECENT_COUNT).then((result) => {
      setRecent(result.status === "ok" ? result.data.entries : []);
    });
    const unlisten = events.historyUpdatePayload.listen(({ payload }) => {
      if (payload.action === "added") {
        setRecent((prev) =>
          [payload.entry, ...(prev ?? [])].slice(0, RECENT_COUNT),
        );
      } else if (payload.action === "deleted") {
        setRecent((prev) => prev?.filter((e) => e.id !== payload.id) ?? prev);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTip((n) => (n + 1) % TIPS.length), 9000);
    return () => clearInterval(id);
  }, []);

  const copy = async (entry: HistoryEntry) => {
    const text = entry.post_processed_text ?? entry.transcription_text;
    if (await copyToClipboard(text)) {
      setCopied(entry.id);
      setTimeout(() => setCopied((c) => (c === entry.id ? null : c)), 1400);
    } else {
      toast.error(t("settings.history.copyError"));
    }
  };

  const transcribeFile = async () => {
    try {
      await pickAndTranscribeFiles();
    } catch (error) {
      console.error("Failed to pick a file to transcribe:", error);
      toast.error(t("settings.history.transcribeFailed"));
    }
  };

  const formatMinutes = (m: number) =>
    m < 1
      ? t("home.stats.lessThanMinute")
      : m < 60
        ? t("home.stats.minutes", { count: Math.round(m) })
        : t("home.stats.hours", {
            count: Math.round((m / 60) * 10) / 10,
          });

  return (
    <Stagger className="mx-auto flex w-full max-w-3xl flex-col gap-grid">
      <StaggerItem>
        <GetStartedCard onOpenPrivacy={onOpenPrivacy} />
      </StaggerItem>
      <StaggerItem>
        <section className="glass relative overflow-hidden rounded-panel p-hero">
          <div className="pointer-events-none absolute -end-16 -top-24 size-72 rounded-full bg-[radial-gradient(circle,var(--ambient-a),transparent_70%)] blur-2xl" />
          <div className="relative flex items-center justify-between gap-6">
            <div>
              <h1 className="text-greeting font-light tracking-[-0.02em]">
                {t(greetingKey())}
              </h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2 text-ui font-light text-ink-2">
                {binding ? (
                  <>
                    <span>{t("home.hold")}</span>
                    <Keycaps binding={binding} osType={osType} size="line" />
                    <span>{t("home.anywhere")}</span>
                  </>
                ) : (
                  t("home.noShortcut")
                )}
              </p>
            </div>
            <div className="flex items-center gap-5">
              {/* The bars step back while the quick actions are out. */}
              <motion.div
                animate={{
                  opacity: actionsOpen ? 0 : 1,
                  filter: actionsOpen ? "blur(4px)" : "blur(0px)",
                }}
                transition={{ duration: 0.25 }}
              >
                <Waveform />
              </motion.div>
              <QuickActions
                open={actionsOpen}
                onOpenChange={setActionsOpen}
                onTranscribeFile={transcribeFile}
                onOpenHistory={onOpenHistory}
              />
            </div>
          </div>
        </section>
      </StaggerItem>

      <div className="grid grid-cols-2 gap-grid">
        <StaggerItem>
          <motion.div
            whileHover={{ y: -2 }}
            transition={spring}
            className="glass rounded-panel p-card"
          >
            <p className="text-section font-medium text-ink-3">
              {t("home.stats.words")}
            </p>
            <div className="mt-2 h-7 text-display font-extralight leading-none tracking-[-0.03em] tabular-nums">
              <SkeletonReveal
                loading={!status}
                skeleton={<Skeleton className="h-7 w-24" />}
              >
                <NumberPopIn text={fmt.format(Math.round(words))} />
              </SkeletonReveal>
            </div>
            <p className="mt-2 text-small text-ink-2">
              {t("home.stats.wordsHint")}
            </p>
          </motion.div>
        </StaggerItem>
        <StaggerItem>
          <motion.div
            whileHover={{ y: -2 }}
            transition={spring}
            className="glass rounded-panel p-card"
          >
            <p className="text-section font-medium text-ink-3">
              {t("home.stats.saved")}
            </p>
            <div className="mt-2 h-7 text-display font-extralight leading-none tracking-[-0.03em] tabular-nums">
              <SkeletonReveal
                loading={!status}
                skeleton={<Skeleton className="h-7 w-24" />}
              >
                <NumberPopIn text={formatMinutes(minutesSaved)} />
              </SkeletonReveal>
            </div>
            <p className="mt-2 text-small text-ink-2">
              {t("home.stats.savedHint", {
                typing: TYPING_WPM,
                speaking: SPEAKING_WPM,
              })}
            </p>
          </motion.div>
        </StaggerItem>
      </div>

      <StaggerItem>
        <PlanSummary onOpenAccount={onOpenAccount} />
      </StaggerItem>

      <StaggerItem>
        <PrivacySummary onOpenPrivacy={onOpenPrivacy} />
      </StaggerItem>

      <StaggerItem>
        <section className="glass overflow-hidden rounded-panel">
          <header className="flex items-center justify-between ps-card pe-item-x pt-4 pb-1">
            <h2 className="text-section font-medium text-ink-3">
              {t("home.recent")}
            </h2>
            {recent && recent.length > 0 && (
              <button
                type="button"
                onClick={onOpenHistory}
                className="group flex cursor-pointer items-center gap-1 rounded-full px-inline py-1 text-small font-medium text-ink-2 transition-colors hover:bg-glass-hover hover:text-text"
              >
                {t("home.viewAll")}
                <ArrowRight
                  width={12}
                  height={12}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </button>
            )}
          </header>
          <SkeletonReveal
            loading={recent === null}
            skeleton={
              <div className="flex flex-col gap-3 px-card pt-2 pb-card">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton
                      className="h-3.5"
                      style={{ width: `${85 - i * 15}%` }}
                    />
                  </div>
                ))}
              </div>
            }
          >
            {recent === null ? null : recent.length === 0 ? (
              <EmptyState
                icon={MessageSquareText}
                title={t("home.empty.title")}
                description={t("home.empty.description")}
                className="py-10"
              />
            ) : (
              <ul className="flex flex-col gap-list px-inline pb-inline">
                <AnimatePresence initial={false}>
                  {recent.map((entry) => (
                    <motion.li
                      key={entry.id}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={spring}
                      className="group relative"
                    >
                      <div className="flex items-start gap-3 rounded-control px-item-x py-item-y transition-colors hover:bg-glass-hover">
                        <div className="min-w-0 flex-1">
                          <p className="text-meta text-ink-3">
                            {formatRelativeTime(
                              String(entry.timestamp),
                              i18n.language,
                            )}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-ui">
                            {entry.post_processed_text ??
                              entry.transcription_text}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => copy(entry)}
                          title={t("settings.history.copyToClipboard")}
                          className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-ink-2 opacity-0 transition-all group-hover:opacity-100 hover:bg-glass-press hover:text-text focus-visible:opacity-100 active:scale-90"
                        >
                          <IconSwap
                            swapped={copied === entry.id}
                            a={<Copy width={13} height={13} />}
                            b={<Check width={14} height={14} />}
                          />
                        </button>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </SkeletonReveal>
        </section>
      </StaggerItem>

      <StaggerItem>
        <section className="glass flex items-center gap-3 rounded-panel px-card py-[14px]">
          <Lightbulb
            width={15}
            height={15}
            strokeWidth={1.75}
            className="shrink-0 text-ink-3"
          />
          <div className="relative min-h-5 flex-1 overflow-hidden">
            <p className="text-ui text-ink-2" aria-live="polite">
              <TextSwap text={t(`home.tips.${TIPS[tip]}`)} />
            </p>
          </div>
        </section>
      </StaggerItem>
    </Stagger>
  );
};
