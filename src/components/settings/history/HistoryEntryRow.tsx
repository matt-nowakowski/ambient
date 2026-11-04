import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AudioLines,
  Check,
  Copy,
  FileAudio,
  RotateCcw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { HistoryEntry } from "@/bindings";
import type { ActiveJobStatus } from "@/stores/transcriptionJobsStore";
import { formatDateTime } from "@/utils/dateFormat";
import { AudioPlayer } from "../../ui/AudioPlayer";
import { spring } from "../../ui/Motion";
import { IconSwap, Shimmer } from "../../ui/Transitions";
import { formatTime } from "./historyGroups";

// Long text folds to this many lines until "Show more".
const FOLDED_LINES = 4;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/25";

const ActionButton: React.FC<{
  onClick: () => void;
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  tone?: "default" | "danger";
  children: React.ReactNode;
}> = ({ onClick, label, disabled, pressed, tone = "default", children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={label}
    aria-label={label}
    aria-pressed={pressed}
    className={`grid size-7 shrink-0 cursor-pointer place-items-center rounded-full transition-[background-color,color,transform] duration-150 active:scale-90 disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100 ${focusRing} ${
      tone === "danger"
        ? "text-ink-2 hover:bg-error-wash hover:text-error"
        : pressed
          ? "text-text hover:bg-glass-press"
          : "text-ink-2 hover:bg-glass-press hover:text-text"
    }`}
  >
    {children}
  </button>
);

/** The Details rows for one entry: only what was actually recorded. */
function detailLines(
  entry: HistoryEntry,
  t: (key: string) => string,
): [string, string][] {
  const d = entry.details;
  const ms = (v?: number | null) =>
    v == null ? null : v >= 1000 ? (v / 1000).toFixed(1) + " s" : v + " ms";
  const rows: [string, string][] = [];
  if (d.speech_model) {
    rows.push([t("settings.history.detail.model"), d.speech_model]);
  }
  if (d.write_decision) {
    rows.push([
      t("settings.history.detail.decided"),
      t("settings.history.detail." + d.write_decision),
    ]);
  }
  const recorded = ms(d.recording_ms);
  if (recorded) rows.push([t("settings.history.detail.recorded"), recorded]);
  const total = ms(d.total_ms);
  if (total) rows.push([t("settings.history.detail.total"), total]);
  return rows;
}

interface HistoryEntryRowProps {
  entry: HistoryEntry;
  job?: ActiveJobStatus;
  onToggleSaved: () => void;
  onCopyText: () => Promise<boolean>;
  getAudioUrl: (fileName: string) => Promise<string | null>;
  deleteAudio: (id: number) => Promise<void>;
  retryTranscription: (id: number) => Promise<void>;
  cancelTranscription: (id: number) => Promise<void>;
}

export const HistoryEntryRow: React.FC<HistoryEntryRowProps> = ({
  entry,
  job,
  onToggleSaved,
  onCopyText,
  getAudioUrl,
  deleteAudio,
  retryTranscription,
  cancelTranscription,
}) => {
  const { t, i18n } = useTranslation();
  const [showCopied, setShowCopied] = useState(false);
  // Pressed cancel: a running job stops after its current chunk.
  const [cancelling, setCancelling] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  // The recording's URL once asked for; the player shows while it's set.
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  // Queued or being transcribed in the background.
  const retrying = job !== undefined;
  useEffect(() => {
    if (!retrying) setCancelling(false);
  }, [retrying]);
  const hasTranscription = entry.transcription_text.trim().length > 0;
  const folded = hasTranscription && !retrying && !expanded;

  // Offer "Show more" only when the folded text is actually cut off.
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || !folded) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [folded, entry.transcription_text]);

  const handleCopyText = async () => {
    if (!hasTranscription) return;
    const copied = await onCopyText();
    if (!copied) {
      toast.error(t("settings.history.copyError"));
      return;
    }
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  };

  const handleDeleteEntry = async () => {
    try {
      await deleteAudio(entry.id);
    } catch (error) {
      console.error("Failed to delete entry:", error);
      toast.error(t("settings.history.deleteError"));
    }
  };

  // Loads the recording and opens the player, which starts playing it.
  const togglePlayer = async () => {
    if (audioSrc) {
      setAudioSrc(null);
      return;
    }
    if (audioLoading) return;
    setAudioLoading(true);
    const url = await getAudioUrl(entry.file_name);
    setAudioLoading(false);
    if (url) setAudioSrc(url);
  };

  let progressText = t("settings.history.transcribing");
  if (job?.state === "queued") {
    progressText = t("settings.history.waiting");
  } else if (job?.state === "running" && job.percent > 0) {
    progressText = t("settings.history.transcribingPercent", {
      percent: job.percent,
    });
  }

  const playerOpen = audioSrc !== null;
  const pinActions = retrying || playerOpen;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailRows = detailLines(entry, t);

  return (
    <div className="group relative rounded-control px-item-x py-item-y transition-colors duration-150 hover:bg-glass-hover focus-within:bg-glass-hover">
      <div className="flex h-6 items-center gap-2">
        <time
          dateTime={new Date(entry.timestamp * 1000).toISOString()}
          title={formatDateTime(String(entry.timestamp), i18n.language)}
          className="shrink-0 text-meta tabular-nums text-ink-3"
        >
          {formatTime(entry.timestamp, i18n.language)}
        </time>
        <AnimatePresence initial={false}>
          {entry.saved && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={spring}
              className="grid shrink-0 place-items-center text-ink-2"
              title={t("settings.history.saved")}
            >
              <Star width={11} height={11} fill="currentColor" />
            </motion.span>
          )}
        </AnimatePresence>
        {entry.source_name && (
          <span
            className="flex min-w-0 items-center gap-1 rounded-full bg-glass-hover px-2 py-0.5 text-meta text-ink-2"
            title={entry.source_name}
          >
            <FileAudio width={11} height={11} className="shrink-0" />
            <span className="truncate">{entry.source_name}</span>
          </span>
        )}

        <div
          className={`ms-auto flex shrink-0 items-center transition-opacity duration-150 ${
            pinActions
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          }`}
        >
          <ActionButton
            onClick={handleCopyText}
            disabled={!hasTranscription || retrying}
            label={t("settings.history.copyToClipboard")}
          >
            <IconSwap
              swapped={showCopied}
              a={<Copy width={13} height={13} />}
              b={<Check width={14} height={14} />}
            />
          </ActionButton>
          <ActionButton
            onClick={onToggleSaved}
            pressed={entry.saved}
            label={
              entry.saved
                ? t("settings.history.unsave")
                : t("settings.history.save")
            }
          >
            <IconSwap
              swapped={entry.saved}
              a={<Star width={14} height={14} fill="none" />}
              b={<Star width={14} height={14} fill="currentColor" />}
            />
          </ActionButton>
          <ActionButton
            onClick={togglePlayer}
            disabled={audioLoading}
            pressed={playerOpen}
            label={
              playerOpen
                ? t("settings.history.hidePlayer")
                : t("settings.history.playRecording")
            }
          >
            <IconSwap
              swapped={playerOpen}
              a={<AudioLines width={14} height={14} />}
              b={<X width={14} height={14} />}
            />
          </ActionButton>
          {retrying ? (
            <ActionButton
              onClick={() => {
                setCancelling(true);
                void cancelTranscription(entry.id);
              }}
              disabled={cancelling}
              label={t("settings.history.cancelTranscription")}
            >
              <X width={14} height={14} />
            </ActionButton>
          ) : (
            <ActionButton
              onClick={() => retryTranscription(entry.id)}
              label={t("settings.history.retranscribe")}
            >
              <RotateCcw width={13} height={13} />
            </ActionButton>
          )}
          <ActionButton
            onClick={handleDeleteEntry}
            label={t("settings.history.delete")}
            tone="danger"
          >
            <Trash2 width={13} height={13} />
          </ActionButton>
        </div>
      </div>

      <p
        ref={textRef}
        className={`mt-0.5 w-full text-ui leading-[1.55] ${
          retrying
            ? ""
            : hasTranscription
              ? "cursor-text select-text whitespace-pre-wrap break-words text-text"
              : "text-ink-3"
        }`}
        style={
          folded
            ? {
                display: "-webkit-box",
                WebkitLineClamp: FOLDED_LINES,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }
            : undefined
        }
      >
        {retrying ? (
          <Shimmer text={progressText} />
        ) : hasTranscription ? (
          entry.transcription_text
        ) : entry.source_name ? (
          // Cancelled, interrupted by a quit, or failed.
          t("settings.history.notTranscribed")
        ) : (
          t("settings.history.transcriptionFailed")
        )}
      </p>
      {detailRows.length > 0 && (
        <button
          type="button"
          onClick={() => setDetailsOpen(!detailsOpen)}
          aria-expanded={detailsOpen}
          className={
            "-mx-1.5 mt-1 cursor-pointer rounded-full px-1.5 py-0.5 text-small font-medium text-ink-3 transition-colors hover:text-text " +
            focusRing
          }
        >
          {t("settings.history.details")}
        </button>
      )}

      {detailsOpen && detailRows.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-card border-[0.5px] border-glass-edge bg-glass-strong px-3 py-2 text-meta">
          {detailRows.map(([label, value]) => (
            <React.Fragment key={label}>
              <dt className="text-ink-3">{label}</dt>
              <dd className="truncate text-text">{value}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}

      {hasTranscription && !retrying && (expanded || overflows) && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className={`-mx-1.5 mt-1 cursor-pointer rounded-full px-1.5 py-0.5 text-small font-medium text-ink-3 transition-colors hover:text-text ${focusRing}`}
        >
          {/* The chevron flips like transitions.dev's accordion. */}
          <span
            className="t-acc inline-flex items-center gap-1"
            data-open={expanded ? "true" : "false"}
          >
            {expanded
              ? t("settings.history.showLess")
              : t("settings.history.showMore")}
            <span className="t-acc-chevron" aria-hidden="true">
              <svg
                viewBox="0 0 16 16"
                width={12}
                height={12}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 6.5L8 10.5L12 6.5" />
              </svg>
            </span>
          </span>
        </button>
      )}

      <AnimatePresence initial={false}>
        {audioSrc && (
          <motion.div
            key="player"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <div className="mt-2.5 rounded-full border-[0.5px] border-glass-edge bg-glass-strong px-3.5 py-1.5 shadow-card">
              <AudioPlayer src={audioSrc} autoPlay className="w-full" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
