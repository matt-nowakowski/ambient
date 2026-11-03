import { commands } from "@/bindings";
import { toast } from "sonner";
import i18n from "@/i18n";

/**
 * The one place a failure becomes words for people. Raw errors (reqwest debug
 * dumps, OS error codes, panics) go to the log only; the UI gets a short,
 * translated message for the kind of failure, with an action when there is
 * one (Try again, or Open settings).
 */
export type ErrorKind =
  | "offline"
  | "timeout"
  | "notFound"
  | "diskFull"
  | "checksum"
  | "permission"
  | "server"
  | "unknown";

/** Where it went wrong: picks the toast's title. */
export type ErrorContext =
  | "download"
  | "signIn"
  | "billing"
  | "update"
  | "transcription"
  | "recording"
  | "model"
  | "meeting"
  | "file"
  | "settings"
  | "generic";

// Checked in order: the first match wins. File-system kinds come before the
// network ones, since a failed download can carry both ("… os error 28 …").
const PATTERNS: [ErrorKind, RegExp][] = [
  [
    "diskFull",
    /no space left|enospc|disk (?:is )?full|not enough (?:disk )?space|storage ?full|insufficient (?:disk|storage)|os error (?:28|112)\b/i,
  ],
  [
    "permission",
    /permission denied|access is denied|access denied|eacces|eperm|operation not permitted|read-only file system|os error (?:1|5|13|30)\b/i,
  ],
  [
    "checksum",
    /corrupt|verif(?:y|ication) failed|failed to verify|checksum|sha-?256|hash mismatch|integrity/i,
  ],
  [
    "timeout",
    /timed? ?out|timeout|no response within|transfer stalled|deadline/i,
  ],
  [
    "offline",
    /dns error|failed to lookup|lookup address|could not resolve|connecterror|connection refused|connection reset|connection closed|network is unreachable|no route to host|not connected to the internet|offline|error sending request|kind: (?:request|connect)|:network\b|network ?error|failed to fetch|load failed|nodename nor servname|os error (?:51|60|61|65|10051|10060|10061|11001)\b/i,
  ],
  [
    "notFound",
    /\b404\b|not found|no such (?:file|object|key)|mirror missing|missing on (?:the )?server/i,
  ],
  [
    "server",
    /\b5\d\d\b|server returned http|server error|:server\b|bad gateway|service unavailable|internal error/i,
  ],
];

const asText = (raw: unknown): string => {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (raw instanceof Error) return `${raw.name}: ${raw.message}`;
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
};

/** What kind of failure a raw error is, from its text. */
export const errorKind = (raw: unknown): ErrorKind => {
  const text = asText(raw);
  for (const [kind, pattern] of PATTERNS) if (pattern.test(text)) return kind;
  return "unknown";
};

/** Contexts whose "offline" is about a download server. */
const DOWNLOADS: ErrorContext[] = ["download", "update"];

/**
 * A short, translated sentence for a raw error. A raw value that is itself a
 * translation key (some commands return those) is translated as is.
 */
export const friendlyMessage = (
  raw: unknown,
  context: ErrorContext = "generic",
): string => {
  const text = asText(raw);
  if (text && /^[a-zA-Z][\w-]*(?:\.[\w-]+)+$/.test(text) && i18n.exists(text))
    return i18n.t(text);
  const kind = errorKind(text);
  if (kind === "offline" && DOWNLOADS.includes(context))
    return i18n.t("errors.friendly.offlineDownload");
  return i18n.t(`errors.friendly.${kind}`);
};

/** The toast title for a context. */
export const errorTitle = (context: ErrorContext): string =>
  i18n.t(`errors.titles.${context}`);

/** Raw detail to the app log (and the console), never to the UI. */
export const logError = (context: ErrorContext, raw: unknown) => {
  const message = `[${context}] ${asText(raw)}`;
  console.error(message);
  commands.frontendError("ui-error", message).catch(() => {
    // Logging must never throw into the caller.
  });
};

interface ShowErrorOptions {
  /** Overrides the context's title (already translated). */
  title?: string;
  /** Offer "Try again". */
  retry?: () => void;
  /** Offer "Open settings" (permission failures, or as the action otherwise missing). */
  openSettings?: () => void;
  /** Toast id, so a repeated failure replaces the last toast. */
  id?: string | number;
}

/**
 * Log the raw error and show a friendly toast with an action. The one entry
 * point for user-facing failure toasts.
 */
export const showError = (
  context: ErrorContext,
  raw: unknown,
  options: ShowErrorOptions = {},
) => {
  logError(context, raw);
  const kind = errorKind(raw);
  const action =
    kind === "permission" && options.openSettings
      ? {
          label: i18n.t("errors.actions.openSettings"),
          onClick: options.openSettings,
        }
      : options.retry
        ? { label: i18n.t("errors.actions.retry"), onClick: options.retry }
        : options.openSettings
          ? {
              label: i18n.t("errors.actions.openSettings"),
              onClick: options.openSettings,
            }
          : undefined;
  return toast.error(options.title ?? errorTitle(context), {
    id: options.id,
    description: friendlyMessage(raw, context),
    action,
  });
};
