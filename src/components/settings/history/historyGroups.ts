import type { TFunction } from "i18next";
import type { HistoryEntry } from "@/bindings";

export interface HistoryDayGroup {
  /** Local calendar day, `YYYY-M-D`; stable across renders. */
  key: string;
  label: string;
  entries: HistoryEntry[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** "Today", "Yesterday", then the weekday and date in the app's language. */
export const dayLabel = (
  date: Date,
  now: Date,
  locale: string,
  t: TFunction,
): string => {
  const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (daysAgo === 0) return t("settings.history.today");
  if (daysAgo === 1) return t("settings.history.yesterday");
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: daysAgo < 7 ? "long" : undefined,
      month: "long",
      day: "numeric",
      year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
};

/** Splits entries (newest first) into consecutive local-day groups. */
export const groupByDay = (
  entries: HistoryEntry[],
  locale: string,
  t: TFunction,
): HistoryDayGroup[] => {
  const now = new Date();
  const groups: HistoryDayGroup[] = [];
  for (const entry of entries) {
    const date = new Date(entry.timestamp * 1000);
    const key = dayKey(date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.entries.push(entry);
    } else {
      groups.push({ key, label: dayLabel(date, now, locale, t), entries: [entry] });
    }
  }
  return groups;
};

/** The time of day, e.g. "9:41 AM", in the app's language. */
export const formatTime = (timestamp: number, locale: string): string => {
  const date = new Date(timestamp * 1000);
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toLocaleTimeString();
  }
};

/** Whether an entry's text (raw or post-processed) or file name matches. */
export const matchesQuery = (entry: HistoryEntry, query: string): boolean => {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [entry.transcription_text, entry.post_processed_text, entry.source_name]
    .filter((s): s is string => !!s)
    .some((s) => s.toLocaleLowerCase().includes(needle));
};
