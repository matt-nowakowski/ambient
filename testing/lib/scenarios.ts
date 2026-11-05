/**
 * Scenario files (testing/scenarios/*.json) and how one becomes what the
 * app's test mode reads (src-tauri/src/testing/mod.rs `Scenario`).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Os = "macos" | "windows" | "linux";
/** A value that may differ per OS (app ids, app names). */
export type PerOs<T> = T | Partial<Record<Os, T>>;

export type Focus = {
  role?: string;
  editable?: boolean;
  secure?: boolean;
  value?: string;
  caret?: number;
  selection?: string;
};

export type Screen = {
  app: PerOs<string>;
  bundle: PerOs<string>;
  title?: string;
  url?: string;
  text?: string;
  focus?: Focus;
  frame_urls?: string[];
  frame_titles?: string[];
  ui_labels?: string[];
  private_window?: boolean;
  untrusted?: boolean;
  reply_button?: boolean;
};

/** Settings by outcome; `raw` is merged last, as is. */
export type Settings = {
  intelligence?: "auto" | "device" | "cloud" | "none";
  polish?: boolean;
  writing?: "smart" | "as_said" | "polish";
  routing?: boolean;
  proactive?: boolean;
  screen_context?: boolean;
  cloud_suggestions?: "unasked" | "accepted" | "declined";
  languages?: string[];
  app_language?: string;
  raw?: Record<string, unknown>;
};

export type Route =
  | "write"
  | "polish"
  | "draft"
  | "answer"
  | "act"
  | "remind"
  | "recall"
  | "help"
  | "report"
  | "dismiss"
  | "did_you_mean"
  | "handled"
  | "suggest"
  | "quiet"
  | "back_off";

/** Things that must not happen. */
export type MustNot =
  | "opened_browser"
  | "typed"
  | "typed_verbatim"
  | "answered"
  | "suggested"
  | "model_call"
  | "read_screen"
  | "silent";

export type Expect = {
  route?: Route | Route[];
  /** For route act: the action's kind (open_app, open_url, web_search, reminder, calendar_event, close_window, unsupported…). */
  act?: string | string[];
  /** For route suggest: the suggestion's kind (draft_reply, summarise_thread, add_to_calendar…). */
  suggestion?: string | string[];
  /** The draft, answer or typed text is addressed to this person (LLM judge). */
  recipient?: string;
  /** The output is in this language (ISO 639-1; LLM judge). */
  language?: string;
  /** Case-insensitive substrings the output must contain. */
  contains?: string[];
  /** Case-insensitive substrings the output must not contain. */
  not_contains?: string[];
  must_not?: MustNot[];
  /** Case-insensitive substrings of some card's text or i18n key ("private", "hud.notice.cantCloseWindow"). */
  shows?: string[];
  /** Anything else, judged by the model against the output. */
  judge?: string;
};

export type Case = {
  id: string;
  /** What this checks, in a sentence (shown on failure). */
  about?: string;
  tags?: string[];
  lang?: string;
  /** OSes where this applies (default: all). */
  os?: Os[];
  kind?: "dictation" | "screen";
  key?: "dictate" | "ask" | "polish";
  screen?: string | Screen | null;
  say?: string;
  now?: string;
  card?: { kind: string; question?: string; text?: string };
  settings?: Settings;
  plan?: "free" | "pro";
  me?: { name?: string; email?: string };
  expect: Expect;
  /** A known bug this guards against (test-feedback.md item). */
  regression?: string;
};

export type FileSpec = {
  defaults?: Partial<Case>;
  screens?: Record<string, Screen>;
  cases: Case[];
};

export type Loaded = Case & { file: string; screenDef: Screen | null };

export function hostOs(): Os {
  return process.platform === "darwin"
    ? "macos"
    : process.platform === "win32"
      ? "windows"
      : "linux";
}

export function loadAll(dir: string): Loaded[] {
  const shared: Record<string, Screen> = {};
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const specs = files.map((f) => ({
    f,
    spec: JSON.parse(readFileSync(join(dir, f), "utf8")) as FileSpec,
  }));
  for (const { spec } of specs) Object.assign(shared, spec.screens ?? {});
  const out: Loaded[] = [];
  const seen = new Set<string>();
  for (const { f, spec } of specs) {
    for (const c of spec.cases) {
      const merged: Case = {
        ...spec.defaults,
        ...c,
        settings: { ...spec.defaults?.settings, ...c.settings },
        tags: [...(spec.defaults?.tags ?? []), ...(c.tags ?? [])],
        expect: c.expect,
      };
      if (seen.has(merged.id))
        throw new Error(`duplicate scenario id ${merged.id}`);
      seen.add(merged.id);
      const s = merged.screen;
      let screenDef: Screen | null = null;
      if (typeof s === "string") {
        screenDef = shared[s] ?? null;
        if (!screenDef) throw new Error(`${merged.id}: unknown screen ${s}`);
      } else if (s) screenDef = s;
      if (merged.lang && !merged.tags!.includes(merged.lang))
        merged.tags!.push(merged.lang);
      out.push({ ...merged, file: f, screenDef });
    }
  }
  return out;
}

function pick<T>(v: PerOs<T> | undefined, os: Os): T | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "object" && !Array.isArray(v)) {
    const per = v as Partial<Record<Os, T>>;
    if ("macos" in per || "windows" in per || "linux" in per)
      return per[os] ?? per.macos ?? per.windows ?? per.linux;
  }
  return v as T;
}

export function settingsPatch(s: Settings = {}): Record<string, unknown> {
  // An agent user's usual setup: reading the screen and suggestions on.
  const agent: Record<string, unknown> = {
    screen_context: true,
    proactive: true,
  };
  const patch: Record<string, unknown> = { agent };
  if (s.intelligence) agent.intelligence = s.intelligence;
  if (s.routing !== undefined) agent.routing = s.routing;
  if (s.proactive !== undefined) agent.proactive = s.proactive;
  if (s.screen_context !== undefined) agent.screen_context = s.screen_context;
  if (s.cloud_suggestions) agent.cloud_suggestions = s.cloud_suggestions;
  if (s.polish !== undefined) patch.post_process_enabled = s.polish;
  if (s.writing) patch.writing_mode = s.writing;
  if (s.languages) patch.spoken_languages = s.languages;
  if (s.app_language) patch.app_language = s.app_language;
  return deepMerge(patch, s.raw ?? {});
}

function deepMerge(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    out[k] =
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      cur &&
      typeof cur === "object"
        ? deepMerge(
            cur as Record<string, unknown>,
            v as Record<string, unknown>,
          )
        : v;
  }
  return out;
}

/** What the app's test mode reads. */
export function resolve(c: Loaded, os: Os, apiBase: string) {
  const sc = c.screenDef;
  return {
    id: c.id,
    kind: c.kind ?? "dictation",
    key: c.key ?? "dictate",
    transcript: c.say ?? "",
    now: c.now ?? "2026-11-05T10:00",
    screen: sc
      ? {
          app: pick(sc.app, os) ?? "",
          bundle: pick(sc.bundle, os) ?? "",
          title: sc.title ?? "",
          url: sc.url ?? null,
          text: sc.text ?? null,
          focus: sc.focus ?? {},
          frame_urls: sc.frame_urls ?? [],
          frame_titles: sc.frame_titles ?? [],
          ui_labels: sc.ui_labels ?? [],
          private_window: sc.private_window ?? false,
          untrusted: sc.untrusted ?? false,
          reply_button: sc.reply_button ?? false,
        }
      : null,
    card: c.card
      ? {
          kind: c.card.kind,
          question: c.card.question ?? "",
          text: c.card.text ?? "",
        }
      : null,
    settings: settingsPatch(c.settings),
    plan: c.plan ?? "pro",
    me: {
      name: c.me?.name ?? "Matt Nowakowski",
      email: c.me?.email ?? "matt@example.com",
    },
    api_base: apiBase,
  };
}

export function applies(c: Case, os: Os) {
  return !c.os || c.os.length === 0 || c.os.includes(os);
}
