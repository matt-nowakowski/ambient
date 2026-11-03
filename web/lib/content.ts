// Shared page copy, used by the pages, JSON-LD and /llms.txt so they never drift.
import { brand, freeMeetingsPerMonth, freeWordsFeature, freeWordsLabel } from "./brand";

export const description = `${brand.name} is a live agent on your desktop, like a colleague. Talk to it and it answers or acts, and it nudges you when it can help. Meeting notes with no bot, free dictation in any app, and speech recognition on your computer.`;

/** The hero eyebrow pill. */
export const heroEyebrow = "A live agent on your desktop";

/** The hero headline, one line at desktop widths. */
export const heroTitle = ["Your desktop colleague."] as const;

export const heroSub = "You talk, it writes, answers and acts. And when it can help, it nudges you.";

export const apps = ["Slack", "Gmail", "Notion", "Linear", "Cursor", "VS Code", "Google Docs", "Messages", "ChatGPT", "Figma"];

/** Shortcuts as the app ships them on macOS. */
export const shortcuts = { dictate: "⌥ Space", ask: "⌃ ⌥ Space" };

/** Honest platform note for the agent features. */
export const macFirst = "Dictation and the agent run on macOS, Windows and Linux (the agent is in beta on Windows and Linux).";

/** Free dictation (the landing-page grid). */
export const features = [
  { title: "Local & private", body: "Transcription runs on-device. Your audio never leaves your computer.", orb: "B1" },
  { title: "Works offline", body: "No connection, no problem. On a plane, on a train, behind a firewall.", orb: "G5" },
  { title: "Any app", body: "Push-to-talk or toggle with one global shortcut. Text lands where your cursor is.", orb: "C2" },
  { title: "99 languages", body: "Dictate in your language with Whisper models, or translate any of them to English.", orb: "G2" },
  { title: "Custom words", body: "Add names, jargon and product terms so they come out spelled your way.", orb: "S2" },
  { title: "AI polish", body: "Punctuation, no filler words, “scratch that” applied. No API key.", orb: "S1" },
  { title: "Every desktop", body: "macOS, Windows and Linux. Including the one other dictation tools forget.", orb: "M1" },
  { title: "Open-source core", body: "The transcription engine is MIT-licensed. Read the code that hears you.", orb: "C3" },
] as const;

/** The voice agent: one key, four outcomes. Used by the landing demo and the features page. */
export const agentModes = [
  {
    k: "Write",
    say: "hey can we push the sync to thursday",
    body: "Talking to someone? Polished text, pasted at your cursor.",
  },
  {
    k: "Answer",
    say: "what’s the difference between UTC and GMT",
    body: "A short answer with sources. It searches the web only when needed.",
  },
  {
    k: "Act",
    say: "add lunch with Ana on Friday at 1",
    body: "Reminders, calendar events, apps, links and your Shortcuts.",
  },
  {
    k: "Recall",
    say: "what did I say about pricing yesterday",
    body: "What you said, saw or saved, found on your Mac.",
  },
] as const;

export const agent = {
  eyebrow: "Talk to it",
  title: "Ask anything. It answers or does it.",
  body: `Hold a key and talk. ${brand.name} works out whether to write, answer, act or recall.`,
  handsFree: `Or turn on hands-free and just say “Hey ${brand.name}, …”. No key. Optional.`,
  /** Short chip for the landing page. */
  handsFreeChip: `Hands-free: “Hey ${brand.name}, …”`,
};

export const meetings = {
  eyebrow: "Meetings",
  title: "Notes for any call. No bot joins.",
  body: `Zoom, Meet, Teams, FaceTime or Slack huddles. You and them, transcribed on your computer.`,
  /** The landing page shows these as chips. */
  chips: [
    { k: "Live notes", orb: "S2" },
    { k: "Nudges when asked", orb: "S1" },
    { k: "Summary and action items", orb: "B1" },
    { k: "Audio never saved", orb: "G5" },
  ],
  points: [
    { k: "While you talk", v: "Rolling notes, and a nudge when you’re asked or promise something." },
    { k: "After the call", v: "Summary, decisions, action items and a follow-up email." },
    { k: "Audio", v: "Never saved." },
  ],
};

export const suggestions = {
  eyebrow: "Suggestions",
  title: "It nudges you, like a colleague.",
  body: "You don't have to ask. When it notices a moment it can help, it offers once. Say “yes”, “not now”, or ignore it, and it learns what you want.",
  /** One line for the landing page. */
  short: "When it can help, it offers once. Say “yes”, or ignore it. It learns.",
  /** The examples as short chips, for the landing page. */
  chips: ["Summarise a long thread", "Reply to Ana?", "Explain a failing test", "Translate a page", "Add a date to your calendar", "Tighten a draft", "Prep for a meeting"],
  promiseShort: "Off until you turn it on. Nothing sent unless you accept.",
  examples: [
    "A long email thread: “Want me to summarise these 40 messages?”",
    "Someone waiting on you: “Reply to Ana?”, then just say what to say",
    "A failing test or a stack trace: the likely fix",
    "A page in another language: translate it",
    "A date in an email or chat: add it to your calendar",
    "A long draft: tighten it",
    "A meeting in a few minutes: prep notes",
  ],
  promise: "Off until you turn it on. Decided on your computer, or by the cloud only if you choose. Nothing is sent unless you accept.",
};

/** Writing: dictation as an assistant. The landing page's compact section. */
export const writing = {
  eyebrow: "Writing, in any app",
  title: "Say it rough. It writes it right.",
  body: "Free dictation on your computer, in any app. AI polish tidies your words, or writes the message for you.",
  chips: ["On your computer", "Works offline", "99 languages", "Custom words"],
  caption: `AI polish: unlimited with Pro, ${brand.freePolishPerWeek} uses a week on Free`,
};

/** Where Recall looks. Nothing to connect. */
export const sources = [
  { title: "Open windows", body: "The text of the windows open in every app, read when you ask." },
  { title: "The last two minutes", body: "A short rolling buffer, in memory only, for “what was that number I just closed?”." },
  { title: "Screen memory", body: "What was on screen, saved as text, encrypted on your Mac. Kept 7 days by default." },
  { title: "Spotlight", body: "Your files, Mail messages and notes, through the Mac’s own index." },
  { title: "Calendar", body: "Your events, read through macOS." },
  { title: "Dictation history", body: "Everything you’ve said to it." },
  { title: "Drive and Gmail", body: "Searched in the browser you’re already signed in to. No login handed over." },
] as const;

/** The privacy promise. The highlights lead; the points are the rest of the rules. */
export const trust = {
  eyebrow: "Privacy",
  title: "What it hears, sees, keeps and sends.",
  /** The landing-page headline and line. */
  short: { title: "Your voice never leaves your computer.", body: "Nothing reads your screen until you turn it on." },
  body: "Nothing reads your screen until you turn it on. Here is exactly how it behaves.",
  /** The landing page: four promises, as icons with short labels. */
  promises: [
    { k: "Your voice stays here", v: "Speech recognition runs on your computer.", orb: "B1" },
    { k: "Passwords never read", v: "Nor password managers or crypto wallets.", orb: "S3" },
    { k: "Secrets removed first", v: "Cards, API keys and codes, before anything is sent.", orb: "M2" },
    { k: "Every request on record", v: "See exactly what was sent.", orb: "S1" },
  ],
  highlights: [
    {
      k: "Your voice stays on your computer",
      v: `Speech recognition runs on your computer. We never send or store your audio.`,
      orb: "B1",
    },
    {
      k: "Passwords are never read",
      v: "Not in any app. Password managers and Keychain are never watched.",
      orb: "S3",
    },
    {
      k: "Crypto wallets are never read",
      v: "MetaMask, Ledger Live, Phantom, Exodus, Electrum, Trezor and other wallet apps and extensions are skipped, always.",
      orb: "C3",
    },
    {
      k: "Recovery phrases are dropped",
      v: `A window showing a recovery phrase or a private key is dropped entirely: not stored, not used, not sent. ${brand.name} shows that it paused there.`,
      orb: "G3",
    },
    {
      k: "Secrets removed first",
      v: "Card numbers, API keys, passwords and one-time codes are removed on your Mac before any text is sent.",
      orb: "M2",
    },
    {
      k: "Every request on the record",
      v: `The network ledger shows every request ${brand.name} made and exactly what it sent.`,
      orb: "S1",
    },
  ],
  points: [
    { k: "Off until you turn it on", v: "Screen reading is switched on one capability at a time, by you. Text only, never screenshots." },
    {
      k: "Never-watch list",
      v: "Password managers, Keychain, Messages, WhatsApp, Signal, Telegram and private or incognito windows, by default. Add any app you like.",
    },
    {
      k: "Hands-free is opt-in",
      v: `Off by default. It listens on your Mac, and nothing is recorded or sent until you say “Hey ${brand.name}”.`,
    },
    { k: "Suggestions stay local", v: "Suggestions are decided on your computer unless you choose Cloud. Nothing is sent unless you accept one." },
    {
      k: "Stored on your computer, encrypted",
      v: "Screen memory is kept 7 days by default, meetings until you delete them. Delete everything with one click.",
    },
    {
      k: "On this computer only",
      v: "An optional Intelligence mode: AI runs on your device (Apple Intelligence on a Mac) and web search is off, so nothing is sent.",
    },
    { k: "Invisible in screen shares", v: "The HUD doesn’t appear in screen shares or recordings. One key pauses everything." },
    { k: "No bots, no accounts", v: "No bot joins your calls and there is nothing to connect. The only account is the email you sign in with for Pro." },
  ],
};

/** The landing page's one-line mention of what's next. */
export const comingSoonChip = "Coming soon: it uses your apps for you";

export const comingSoon = {
  label: "Coming soon · computer use",
  title: "Next, it uses your apps for you.",
  body: `Say what you want done. ${brand.name} uses the apps on your screen, the way you would.`,
  examples: ["Open Linear and file a ticket for the login bug", "Move these rows into the sheet"],
  points: [
    { k: "Clicks and types for you", v: "Through macOS accessibility, in the apps you already use." },
    { k: "Shows each step", v: "You see what it is doing as it goes." },
    { k: "Asks first", v: "Before anything that can’t be undone: sending, deleting or buying." },
    { k: "Stops when you move", v: "Touch the keyboard or mouse and it stops at once." },
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
    tagline: "The whole colleague, with weekly limits",
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
      "On-device speech recognition, works offline",
      "macOS, Windows and Linux",
      `${brand.trialDays}-day trial of everything, no card`,
      `Then ${brand.freePolishPerWeek} AI uses a week, shared across polish, answers, actions, Ask and meeting summaries`,
      `${freeMeetingsPerMonth} meetings a month`,
    ],
  },
  pro: {
    name: "Pro",
    tagline: "No limits",
    /** The landing page's short list. */
    key: ["No limits on AI or meetings (fair use)", "Cloud suggestions, if you choose", "Longer recall", "Everything in Free"],
    monthly: brand.pricing.proMonthly,
    yearlyPerMonth: brand.pricing.proYearlyPerMonth,
    yearlyTotal: brand.pricing.proYearlyTotal,
    features: [
      "Unlimited AI polish (fair use), no API key",
      "The voice agent: write, answer, act, recall",
      "Unlimited meeting notes (fair use) with live nudges",
      "Suggestions at the right moment",
      "Finds your own things, nothing to connect",
      "On-device mode with Apple Intelligence",
      "Computer use, coming soon",
      "Everything in Free",
    ],
  },
  team: {
    name: "Team",
    perUser: brand.pricing.teamYearlyPerUser,
    note: "Billed annually.",
    features: ["Everything in Pro", "Centralized billing & invoicing", "Pro for every seat"],
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
    intro: `One shortcut. ${brand.name} decides from what you say whether to write, answer, act or recall. The Ask shortcut (${shortcuts.ask}) always goes to the agent. Free includes ${brand.freePolishPerWeek} AI uses a week.`,
    items: [
      { title: "Write", body: "Talking to someone? Your words are polished and pasted where your cursor is, exactly like dictation.", orb: "C2" },
      { title: "Answer", body: "Ask a question and a glass answer card appears near the top right, with sources. It searches the web only when the answer needs it.", orb: "B2" },
      { title: "Answer about this", body: "“Summarise this” or “what does this error mean” uses the text of the window in front of you.", orb: "B3" },
      { title: "Act", body: "“Remind me at 5 to call Sam” or “add lunch with Ana Friday at 1” lands in your Mac’s own Reminders and Calendar. It also opens apps and links, and runs your Shortcuts by name.", orb: "S3" },
      { title: "Recall", body: "“What did I say about pricing yesterday?” is answered from your dictations, meetings and, if you turn it on, screen memory.", orb: "G3" },
      { title: "Writing stays the default", body: "When it isn’t sure, it writes. Dictating an email stays dictating.", orb: "C1" },
      { title: `“Hey ${brand.name}”`, body: `Start with it to talk to ${brand.name} from ChatGPT, Cursor, Slack or Mail, where your words would otherwise be typed.`, orb: "M3" },
      { title: "Hands-free (optional)", body: `Turn it on and just say “Hey ${brand.name}, what’s on my calendar?” No key. It listens on your Mac, and nothing is sent until you say it.`, orb: "G1" },
    ],
  },
  {
    id: "meetings",
    heading: "Meetings",
    pro: true,
    intro: `Notes for any call, with no bot joining and nothing to connect. Free includes ${freeMeetingsPerMonth} meetings a month.`,
    items: [
      { title: "Any call", body: "Zoom, Google Meet, Microsoft Teams, FaceTime and Slack huddles. If it plays on your Mac, it works.", orb: "C3" },
      { title: "You and them", body: "Your microphone and your Mac’s audio are transcribed separately on your Mac, so it knows who said what.", orb: "M2" },
      { title: "Notes as you talk", body: "Rolling notes build during the call, so you can look back mid-meeting.", orb: "S2" },
      { title: "Live nudges", body: "They asked you for something: Find it. You promised something: Remind me. Plus follow-up questions worth asking.", orb: "S1" },
      { title: "After the call", body: "A summary, decisions, action items, questions for you, and a follow-up email draft ready to send.", orb: "B1" },
      { title: "Audio never saved", body: "The audio is transcribed on your Mac and thrown away. Only the text is kept, on your Mac.", orb: "G5" },
    ],
  },
  {
    id: "suggestions",
    heading: "Suggestions",
    pro: true,
    intro: "Switch it on and it nudges you when it can help, with one next step. Say “yes” or “not now”, and it learns. Decided on your computer unless you choose Cloud, and nothing is sent unless you accept.",
    items: [
      { title: "Email", body: "Long threads: summarise them. Replies: dictate the gist, get the email. A date in an email or Slack message: add it to your calendar.", orb: "B4" },
      { title: "Writing", body: "A long draft: tighten it.", orb: "S4" },
      { title: "Browsing", body: "A long page: summarise it. A product page: check prices elsewhere. Rephrasing the same search: just answer it.", orb: "G2" },
      { title: "Work", body: "A spreadsheet formula error, a stack trace or a failing test: explain it and suggest a fix.", orb: "M3" },
      { title: "Meeting prep", body: "A few minutes before an event in your calendar, it offers a short brief to get you ready.", orb: "C4" },
      { title: "Quiet by design", body: "One line, Enter or Esc, gone in seconds. Dismiss a kind of suggestion and it backs off.", orb: "G4" },
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
    heading: "Dictation, unlimited and free",
    intro: "Unlimited, on every platform, transcribed on your computer.",
    items: [
      { title: "On-device transcription", body: "Speech-to-text runs locally with open models (Whisper, Parakeet, Moonshine, SenseVoice and more) with GPU acceleration where available. Your audio never leaves your computer.", orb: "B1" },
      { title: "Works offline", body: "Once a model is downloaded, dictation needs no connection at all.", orb: "G5" },
      { title: "99 languages", body: "Pick the languages you speak. Whisper models cover 99 of them, and can translate what you say into English.", orb: "G2" },
      { title: "Choose your model", body: "Trade speed for accuracy: small, fast models for quick notes, larger ones for long-form writing. Switch any time.", orb: "S2" },
      { title: "Any app", body: "Text is pasted wherever your cursor is: email, chat, docs, code editors, the terminal.", orb: "C2" },
      { title: "Push-to-talk or toggle", body: "Hold the shortcut while you speak, or tap once to start and again to stop. The shortcut is yours to choose.", orb: "C1" },
      { title: "Custom words", body: "Add names, jargon and product terms so they come out spelled your way.", orb: "S4" },
      { title: "History and files", body: "Every transcription is kept on your device: search it, play it back, re-transcribe it. Drop in an audio file to get the text.", orb: "C3" },
      { title: "AI polish", body: "Punctuation, no filler words, lists formatted, “scratch that” applied. Hosted with nothing to set up, or on your Mac with Apple Intelligence. Only text is sent, never audio.", orb: "S1" },
      { title: "macOS, Windows, Linux", body: "Native builds for all three, plus command-line flags for scripting and Wayland shortcuts.", orb: "M1" },
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
    url: "/media/ambient-launch-v4.mp4",
    poster: { light: "/media/ambient-launch-v4.jpg", dark: "/media/ambient-launch-v4-dark.jpg" },
  },
  vertical: {
    url: "/media/ambient-launch-v4-vertical.mp4",
    poster: { light: "/media/ambient-launch-v4-vertical.jpg", dark: "/media/ambient-launch-v4-vertical-dark.jpg" },
  },
};
