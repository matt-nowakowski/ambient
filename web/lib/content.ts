// Shared page copy, used by the pages, JSON-LD and /llms.txt so they never drift.
import { brand, freeMeetingsPerMonth, freeWordsFeature, freeWordsLabel } from "./brand";

export const description = `${brand.name} is a live agent on your desktop. Talk to it: it answers, acts, and nudges you when it can help. Meeting notes with no bot, and free dictation in any app.`;

/** The hero eyebrow pill. */
export const heroEyebrow = "A live agent on your desktop";

/** The hero headline, one line at desktop widths. */
export const heroTitle = ["Your desktop colleague."] as const;

export const heroSub = "You talk. It writes, answers and acts, and nudges you when it can help.";

export const apps = ["Slack", "Gmail", "Notion", "Linear", "Cursor", "VS Code", "Google Docs", "Messages", "ChatGPT", "Figma"];

/** Shortcuts as the app ships them on macOS. */
export const shortcuts = { dictate: "⌥ Space", ask: "⌃ ⌥ Space" };

/** Honest platform note for the agent features. */
export const macFirst = "macOS, Windows and Linux. Agent in beta on Windows and Linux.";

/** Free dictation (the landing-page grid). */
export const features = [
  { title: "Local & private", body: "Your audio never leaves your computer.", orb: "B1" },
  { title: "Works offline", body: "On a plane, a train, behind a firewall.", orb: "G5" },
  { title: "Any app", body: "One shortcut. Text lands at your cursor.", orb: "C2" },
  { title: "99 languages", body: "Dictate in yours, or translate to English.", orb: "G2" },
  { title: "Custom words", body: "Names and jargon, spelled your way.", orb: "S2" },
  { title: "AI polish", body: "Punctuation fixed, filler gone. No API key.", orb: "S1" },
  { title: "Every desktop", body: "macOS, Windows and Linux.", orb: "M1" },
  { title: "Open-source core", body: "The engine that hears you is MIT-licensed.", orb: "C3" },
] as const;

/** The voice agent: one key, four outcomes. Used by the landing demo and the features page. */
export const agentModes = [
  {
    k: "Write",
    say: "hey can we push the sync to thursday",
    body: "Your words at your cursor, polished if you like.",
  },
  {
    k: "Answer",
    say: "what’s the difference between UTC and GMT",
    body: "A short answer with sources. Web only when needed.",
  },
  {
    k: "Act",
    say: "add lunch with Ana on Friday at 1",
    body: "Reminders, calendar, apps, links, Shortcuts.",
  },
  {
    k: "Recall",
    say: "what did I say about pricing yesterday",
    body: "What you said, saw or saved.",
  },
] as const;

export const agent = {
  eyebrow: "Talk to it",
  title: "Ask anything. It answers or does it.",
  body: "Hold a key and talk. It writes, answers, acts or recalls.",
  handsFree: `Or go hands-free: “Hey ${brand.name}, …”. Optional.`,
  /** Short chip for the landing page. */
  handsFreeChip: `Hands-free: “Hey ${brand.name}, …”`,
};

export const meetings = {
  eyebrow: "Meetings",
  title: "Notes for any call. No bot joins.",
  body: "Zoom, Meet, Teams, FaceTime, Slack huddles. Transcribed on your computer.",
  /** The landing page shows these as chips. */
  chips: [
    { k: "Live notes", orb: "S2" },
    { k: "Nudges when asked", orb: "S1" },
    { k: "Summary and action items", orb: "B1" },
    { k: "Audio never saved", orb: "G5" },
  ],
  points: [
    { k: "While you talk", v: "Rolling notes, and a nudge when you’re asked." },
    { k: "After the call", v: "Summary, action items, follow-up email." },
    { k: "Audio", v: "Never saved." },
  ],
};

export const suggestions = {
  eyebrow: "Suggestions",
  title: "It nudges you, like a colleague.",
  body: "When it can help, it offers once. Say “yes”, “not now”, or ignore it. It learns.",
  /** One line for the landing page. */
  short: "It offers once. Say “yes”, or ignore it. It learns.",
  /** The examples as short chips, for the landing page. */
  chips: ["Summarise a long thread", "Reply to Ana?", "Remind me?", "Explain a failing test", "Translate a page", "Add a date to your calendar", "Tighten a draft", "Prep for a meeting"],
  promiseShort: "On by default, off in Privacy. Decided on your computer.",
  examples: [
    "Long thread: “Summarise these 40 messages?”",
    "Someone waiting: “Reply to Ana?”",
    "Failing test: the likely fix",
    "Foreign page: translate it",
    "A date: add it to your calendar",
    "A deadline: “Remind me?”",
    "Long draft: tighten it",
    "Meeting soon: prep notes",
  ],
  promise: "On by default, off with one switch. Decided on your computer, or in the cloud if you choose (Pro).",
};

/** Writing: dictation as an assistant. The landing page's compact section. */
export const writing = {
  eyebrow: "Writing, in any app",
  title: "Say it rough. It writes it right.",
  body: "Free dictation in any app. AI polish tidies it, or writes it for you.",
  chips: ["On your computer", "Works offline", "99 languages", "Custom words"],
  caption: `AI polish: unlimited with Pro, ${brand.freePolishPerWeek} uses a week on Free`,
};

/** Where Recall looks. Nothing to connect. */
export const sources = [
  { title: "Open windows", body: "Read when you ask." },
  { title: "The last two minutes", body: "In memory only. “What was that number?”" },
  { title: "Screen memory", body: "Text, encrypted. 24 hours on Free, 7 days on Pro." },
  { title: "Your files", body: "Spotlight, Windows Search or Tracker." },
  { title: "Calendar", body: "Calendar, Outlook or GNOME Calendar." },
  { title: "Dictation history", body: "Everything you’ve said to it." },
  { title: "Drive and Gmail", body: "Via your signed-in browser. No login shared." },
] as const;

/** The privacy promise. The highlights lead; the points are the rest of the rules. */
export const trust = {
  eyebrow: "Privacy",
  title: "What it hears, sees, keeps and sends.",
  /** The landing-page headline and line. */
  short: { title: "Your voice never leaves your computer.", body: "It reads your window, redacted. Never private pages." },
  body: "It reads the window you’re in, redacted. Never private pages or apps you exclude.",
  /** The landing page: four promises, as icons with short labels. */
  promises: [
    { k: "Your voice stays here", v: "Speech recognition on your computer.", orb: "B1" },
    { k: "Passwords never read", v: "Nor password managers or crypto wallets.", orb: "S3" },
    { k: "Secrets removed first", v: "Cards, keys and codes, before sending.", orb: "M2" },
    { k: "Every request on record", v: "See exactly what was sent.", orb: "S1" },
  ],
  highlights: [
    {
      k: "Your voice stays on your computer",
      v: "We never send or store your audio.",
      orb: "B1",
    },
    {
      k: "Passwords are never read",
      v: "In any app. Password managers are never watched.",
      orb: "S3",
    },
    {
      k: "Crypto wallets are never read",
      v: "MetaMask, Ledger, Phantom and other wallets. Always skipped.",
      orb: "C3",
    },
    {
      k: "Recovery phrases are dropped",
      v: "The whole window is dropped: not stored, not sent.",
      orb: "G3",
    },
    {
      k: "Secrets removed first",
      v: "Cards, API keys, passwords and codes, removed before sending.",
      orb: "M2",
    },
    {
      k: "Every request on the record",
      v: "The network ledger shows what was sent.",
      orb: "S1",
    },
  ],
  points: [
    { k: "The window you’re in, redacted", v: "Text only, secrets removed, never screenshots. Off in Privacy." },
    {
      k: "Never-watch list",
      v: "Password managers and private windows by default. Add any app.",
    },
    {
      k: "Hands-free is opt-in",
      v: `Off by default. Nothing sent until “Hey ${brand.name}”.`,
    },
    { k: "Suggestions stay local", v: "Decided on your computer. Cloud only if you choose (Pro)." },
    {
      k: "Private pages left alone",
      v: "Banking, medical and ID pages, in any language. Not read.",
    },
    {
      k: "Stored on your computer, encrypted",
      v: "Screen memory: 24 hours Free, 7 days Pro. Delete all in one click.",
    },
    {
      k: "On this computer only",
      v: "AI runs on your device, web search off. Nothing sent.",
    },
    { k: "Or no AI at all", v: "No model runs anywhere. Plain dictation." },
    { k: "Invisible in screen shares", v: "Hidden from shares and recordings. One key pauses all." },
    { k: "No bots, no accounts", v: "Nothing to connect. Free needs no account." },
  ],
};

/** The landing page's one-line mention of what's next. */
export const comingSoonChip = "Soon: it uses your apps";

export const comingSoon = {
  label: "Coming soon · computer use",
  title: "Next, it uses your apps for you.",
  body: `Say what you want done. ${brand.name} uses the apps on your screen, the way you would.`,
  examples: ["Open Linear and file a ticket for the login bug", "Move these rows into the sheet"],
  points: [
    { k: "Clicks and types for you", v: "In the apps you already use." },
    { k: "Shows each step", v: "Live, as it works." },
    { k: "Asks first", v: "Before sending, deleting or buying." },
    { k: "Stops when you move", v: "Touch the keyboard and it stops." },
  ],
};

// Compared as of November 2026, from each product's own site and docs. Sources
// for every competitor cell are listed beside it. "—" means we couldn't verify
// it from their public pages. Re-check before changing anything here.
export const comparedAsOf = "November 2026";

export const competitors = ["Wispr Flow", "Cluely"] as const;

export type Cell = boolean | string;

export const compareRows: { label: string; us: Cell; them: [Cell, Cell] }[] = [
  {
    label: "Answers about what’s on screen",
    us: true,
    // docs.wisprflow.ai Command Mode: uses the text box and selected text. support.cluely.com: "questions about your screen".
    them: ["Selected text", true],
  },
  {
    label: "Acts on your computer",
    us: "Calendar, reminders, apps",
    // Neither documents creating events, reminders or opening apps.
    them: ["—", "—"],
  },
  {
    label: "Nudges you when it can help",
    us: "Decided on your computer",
    // wisprflow.ai/post/wispr-flow-notetaker: "Briefs you before each meeting". support.cluely.com: suggestions when you click.
    them: ["Meeting briefs", "On request, in calls"],
  },
  {
    label: "Meeting notes, no bot joins",
    us: true,
    // wisprflow.ai/notetaker/record-meetings-without-a-bot. cluely.com: "Cluely never joins your meetings".
    them: [true, true],
  },
  {
    label: "Speech recognition",
    us: "On your computer",
    // wisprflow.ai/data-controls: "Transcription always occurs on the cloud." Cluely: not stated.
    them: ["In the cloud", "—"],
  },
  {
    label: "Reads the screen as",
    us: "Text, never screenshots",
    // docs.wisprflow.ai Context Awareness: "Flow works from text and does not take screenshots." Cluely: not stated in its docs.
    them: ["Text", "—"],
  },
  {
    label: "Dictation in any app",
    us: true,
    // wisprflow.ai/pricing: "Speech-to-text in any app". Cluely: no dictation documented.
    them: [true, "—"],
  },
  {
    label: "Free plan",
    us: freeWordsLabel,
    // wisprflow.ai/pricing: "Limited words per week". cluely.com/pricing: "Limited AI responses", "Limited meeting notetaking".
    them: ["Limited words per week", "Limited responses and notes"],
  },
  {
    label: "Paid plan, monthly",
    us: `$${brand.pricing.proMonthly}/mo`,
    // wisprflow.ai/pricing (Pro). cluely.com/pricing (Pro).
    them: ["$15/mo", "$19.99/mo"],
  },
  {
    label: "Paid plan, annual",
    us: `$${brand.pricing.proYearlyPerMonth}/mo`,
    // wisprflow.ai/pricing. cluely.com/pricing: "from $11.99/mo billed annually".
    them: ["$12/mo", "From $11.99/mo"],
  },
  {
    label: "Platforms",
    us: "macOS, Windows, Linux (agent in beta on Windows and Linux)",
    // docs.wisprflow.ai supported devices. cluely.com/download, support.cluely.com system requirements.
    them: ["macOS, Windows, iPhone, Android", "macOS, Windows, iPhone"],
  },
];

export const tiers = {
  free: {
    name: "Free",
    tagline: "The whole colleague, with weekly limits.",
    price: 0,
    note: "No account needed.",
    /** The landing page's short list. */
    key: [
      freeWordsFeature,
      `${brand.freePolishPerWeek} AI uses a week`,
      "Suggestions, screen reading, hands-free",
      `${freeMeetingsPerMonth} meetings a month`,
    ],
    features: [
      freeWordsFeature,
      "On-device speech, works offline",
      "macOS, Windows and Linux",
      `${brand.trialDays}-day Pro trial, no card`,
      "Every agent feature",
      `${brand.freePolishPerWeek} AI uses a week`,
      `Up to ${brand.freeSuggestionsPerWeek} suggestions a week`,
      "24 hours of screen memory",
      `${freeMeetingsPerMonth} meetings a month`,
    ],
  },
  pro: {
    name: "Pro",
    tagline: "No limits.",
    /** The landing page's short list. */
    key: ["No limits on AI or meetings (fair use)", "Cloud suggestions, if you choose", "Longer recall", "Everything in Free"],
    monthly: brand.pricing.proMonthly,
    yearlyPerMonth: brand.pricing.proYearlyPerMonth,
    yearlyTotal: brand.pricing.proYearlyTotal,
    features: [
      "Everything in Free, no limits",
      "Unlimited AI uses (fair use)",
      "Unlimited suggestions, cloud optional",
      "Unlimited meetings (fair use)",
      "Screen memory for 7 days, up to 30",
      "Computer use, soon",
    ],
  },
  team: {
    name: "Team",
    tagline: "For the whole team.",
    perUser: brand.pricing.teamYearlyPerUser,
    note: "Billed annually.",
    features: ["Everything in Pro", "One bill for everyone", "Pro for every seat"],
  },
};

export const platforms = ["macOS", "Windows", "Linux"] as const;

export type FeatureGroup = {
  id: string;
  heading: string;
  intro?: string;
  pro?: boolean;
  items: readonly { title: string; body: string; orb: string }[];
};

/** Everything the app does today (the /features page). Only shipped capabilities. */
export const featureGroups: FeatureGroup[] = [
  {
    id: "agent",
    heading: "The agent",
    pro: true,
    intro: `One shortcut: it writes, answers, acts or recalls. ${shortcuts.ask} always asks. ${brand.freePolishPerWeek} AI uses a week on Free.`,
    items: [
      { title: "Write", body: "Your words at your cursor, polished if you like.", orb: "C2" },
      { title: "Answer", body: "A glass card with up to three sources. Web only when needed.", orb: "B2" },
      { title: "Answer about this", body: "“Summarise this” uses the window in front of you.", orb: "B3" },
      { title: "Act", body: "Reminders, calendar events, apps, links and your shortcuts.", orb: "S3" },
      { title: "Recall", body: "From your dictations, meetings and screen memory.", orb: "G3" },
      { title: "Writing stays the default", body: "Unsure? It writes. Dictation stays dictation.", orb: "C1" },
      { title: `“Hey ${brand.name}”`, body: `Ask ${brand.name} from inside ChatGPT, Cursor or Slack.`, orb: "M3" },
      { title: "Hands-free (optional)", body: "No key. Nothing sent until you say it.", orb: "G1" },
    ],
  },
  {
    id: "meetings",
    heading: "Meetings",
    pro: true,
    intro: `No bot, nothing to connect. ${freeMeetingsPerMonth} meetings a month on Free.`,
    items: [
      { title: "Any call", body: "Zoom, Meet, Teams, FaceTime, Slack huddles.", orb: "C3" },
      { title: "You and them", body: "Knows who said what.", orb: "M2" },
      { title: "Notes as you talk", body: "Rolling notes during the call.", orb: "S2" },
      { title: "Live nudges", body: "Asked for something? Find it. Promised? Remind me.", orb: "S1" },
      { title: "After the call", body: "Summary, action items and a follow-up email.", orb: "B1" },
      { title: "Audio never saved", body: "Only the text is kept, on your computer.", orb: "G5" },
    ],
  },
  {
    id: "suggestions",
    heading: "Suggestions",
    pro: true,
    intro: `One next step, when it can help. It learns. ${brand.freeSuggestionsPerWeek} a week on Free.`,
    items: [
      { title: "Email and chat", body: "Summarise threads, draft replies, add dates.", orb: "B4" },
      { title: "Writing", body: "Tighten a long draft.", orb: "S4" },
      { title: "Browsing", body: "Summarise, translate, compare prices.", orb: "G2" },
      { title: "Work", body: "Errors and failing tests, explained and fixed.", orb: "M3" },
      { title: "Meeting prep", body: "A short brief before each meeting.", orb: "C4" },
      { title: "Quiet by design", body: "One line, gone in seconds. Dismiss it and it backs off.", orb: "G4" },
    ],
  },
  {
    id: "recall",
    heading: "Finds your own things",
    pro: true,
    intro: "Nothing to connect. It looks where your things already are.",
    items: sources.map((s, i) => ({ ...s, orb: ["C2", "M1", "B1", "S5", "C5", "G1", "B5"][i] })),
  },
  {
    id: "dictation",
    heading: "Writing, unlimited and free",
    intro: "Any app, any language, transcribed on your computer.",
    items: [
      { title: "Smart writing", body: "“Reply that Thursday works” becomes a proper message.", orb: "C1" },
      { title: "Styles per app and site", body: "Casual in Slack, polished in Gmail.", orb: "M2" },
      { title: "Edit by voice", body: "Say “shorter” or “warmer”. It rewrites.", orb: "S5" },
      { title: "On-device transcription", body: "Whisper, Parakeet and more, on your computer.", orb: "B1" },
      { title: "Works offline", body: "No connection needed.", orb: "G5" },
      { title: "99 languages", body: "Or translate what you say into English.", orb: "G2" },
      { title: "Choose your model", body: "Fast or accurate. Switch any time.", orb: "S2" },
      { title: "Any app", body: "Text lands at your cursor, anywhere.", orb: "C2" },
      { title: "Push-to-talk or toggle", body: "Hold to talk, or tap to start and stop.", orb: "C1" },
      { title: "Custom words", body: "Names and jargon, spelled your way.", orb: "S4" },
      { title: "History and files", body: "Search, replay, or transcribe a file.", orb: "C3" },
      { title: "AI polish", body: "Punctuation fixed, filler gone. Off by default.", orb: "S1" },
      { title: "On-device AI (optional)", body: "A 1.1 GB model runs AI on your computer.", orb: "B1" },
      { title: "macOS, Windows, Linux", body: "Native on all three.", orb: "M1" },
    ],
  },
];

/**
 * The launch video on the landing page. null renders nothing.
 *
 * `horizontal` is the 16:9 cut everyone gets; `vertical` (optional) is a 9:16
 * cut shown at phone width (≤ 640px). Each cut has a poster per colour scheme;
 * either may be left out and the other is used, and a vertical cut without
 * posters falls back to the horizontal ones (cropped to fit).
 *
 * `url` is normally a self-hosted .mp4/.webm under /media/ (redirected to R2),
 * played in the site's own player. A YouTube, Vimeo or Mux URL also works and
 * is embedded with that service's player (horizontal only).
 *
 * `captions` (optional) is a WebVTT file. It is fetched cross-origin from R2,
 * so the bucket needs a CORS rule allowing GET from the site's origin.
 */
export type VideoPoster = { light?: string; dark?: string };
export type VideoCut = { url: string; poster?: VideoPoster };
export type VideoCaptions = { src: string; srcLang?: string; label?: string };
export type LaunchVideo = {
  title: string;
  horizontal: VideoCut;
  vertical?: VideoCut;
  captions?: VideoCaptions;
};
// Versioned filenames in R2 (served immutable); upload a new name for a new cut.
export const launchVideo: LaunchVideo | null = {
  title: `${brand.name} launch video`,
  horizontal: {
    url: "/media/ambient-launch-v6.mp4",
    poster: { light: "/media/ambient-launch-v6.jpg", dark: "/media/ambient-launch-v6-dark.jpg" },
  },
  vertical: {
    url: "/media/ambient-launch-v6-vertical.mp4",
    poster: { light: "/media/ambient-launch-v6-vertical.jpg", dark: "/media/ambient-launch-v6-vertical-dark.jpg" },
  },
};
