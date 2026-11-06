// The getting-started guide under /docs: what to say and what happens.
// Used by the docs pages, the docs nav, the sitemap and /llms-full.txt, so the
// phrases never drift between them. Only shipped behaviour belongs here.
import type { Metadata } from "next";
import { brand } from "./brand";
import { pageMetadata } from "./seo";
import { askShortcut, defaultShortcut } from "./releases";

export type Say = { say: string; then: string };

export type GuidePage = {
  slug: string;
  path: string;
  /** Short label for the docs nav. */
  nav: string;
  title: string;
  description: string;
  intro: string;
};

const page = (slug: string, nav: string, title: string, description: string, intro: string): GuidePage => ({
  slug,
  path: `/docs/${slug}`,
  nav,
  title,
  description,
  intro,
});

/** In nav order. The first is the docs home. */
export const guidePages = [
  page(
    "getting-started",
    "Getting started",
    "Getting started with the agent",
    `How to talk to ${brand.name}: the Ask shortcut, “Hey ${brand.name}”, hands-free, how it decides what you meant, the answer card, and why there is nothing to connect.`,
    `Hold a key and talk. ${brand.name} decides whether to type, answer, act or look something up. No modes, nothing to connect.`,
  ),
  page(
    "writing",
    "Writing",
    "Smart writing",
    `How ${brand.name} decides, per dictation, whether to type what you said, polish it, or write it for you, and how to take it back.`,
    "Dictate as usual. Each time, it types what you said, polishes it, or writes it for you, in any app and any language. A small chip says which, and one click takes it back.",
  ),
  page(
    "answers",
    "Answers",
    "Answers",
    `Ask ${brand.name} a question, or about what’s on your screen, and get a short answer with sources.`,
    "Ask out loud. A short answer appears in the top right, with sources. It searches the web only when it has to.",
  ),
  page(
    "actions",
    "Actions",
    "Actions",
    `Reminders, calendar events, apps, links, browser searches and your own Shortcuts, by voice with ${brand.name}.`,
    "Say what you want done. It uses your own reminders, calendar, browser and shortcuts. One click undoes it.",
  ),
  page(
    "recall",
    "Recall",
    "Recall",
    `Ask ${brand.name} what you said, saw or saved. It looks on your computer, with nothing to connect.`,
    "Ask about something you said, read or saved. It looks where your things already are.",
  ),
  page(
    "meetings",
    "Meetings",
    "Meetings",
    `Meeting notes for any call with ${brand.name}: a live transcript of you and them, nudges, a summary and a follow-up email. No bot joins.`,
    "Notes for any call, taken on your computer. No bot joins.",
  ),
  page(
    "suggestions",
    "Suggestions",
    "Suggestions",
    `Every moment where ${brand.name} offers a next step, and how to answer it by voice.`,
    "When it can help, it offers one next step. Say “yes” or “not now”, and it learns. Off until you turn it on.",
  ),
  page(
    "privacy",
    "Privacy",
    "Privacy controls",
    `What ${brand.name} reads, what it never reads, what it keeps and what it sends, and the switches that control each.`,
    "Nothing reads your screen until you turn it on. Here is what each switch does, and what is never read.",
  ),
] as const satisfies readonly GuidePage[];

export type GuideSlug = (typeof guidePages)[number]["slug"];

export function guidePage(slug: GuideSlug): GuidePage {
  return guidePages.find((p) => p.slug === slug)!;
}

export function guideMetadata(slug: GuideSlug): Metadata {
  const p = guidePage(slug);
  return pageMetadata({ title: p.title, description: p.description, path: p.path });
}

/** The two shortcuts, as the app ships them. */
export const guideShortcuts = {
  dictate: { mac: defaultShortcut.mac, other: defaultShortcut.windows },
  ask: { mac: askShortcut.mac, other: askShortcut.windows },
};

/** The three ways to talk to the agent. */
export const talkingWays = [
  {
    k: "Hold the Ask shortcut",
    v: `${askShortcut.mac} on Mac, ${askShortcut.windows} on Windows and Linux. Whatever you say is for ${brand.name}.`,
  },
  {
    k: `Say “Hey ${brand.name}”`,
    v: `Start with it on the dictation key and it goes to ${brand.name} instead of being typed. Use it in ChatGPT, Claude or Cursor, where your words are your prompt, and in Slack or Mail, where requests are for people.`,
  },
  {
    k: "Hands-free (optional)",
    v: `Turn it on and just say “Hey ${brand.name}, what’s on my calendar?” No key. On every plan.`,
  },
] as const;

/** Hands-free, the details. */
export const handsFree = [
  { k: "Listens on your computer", v: "Only the first couple of seconds after you start speaking are checked for the phrase. Everything else is dropped at once." },
  { k: "Nothing sent", v: `Nothing is recorded or sent until you say “Hey ${brand.name}”.` },
  { k: "Off by default", v: "Your computer shows its mic indicator while it’s on. It pauses during meeting notes." },
  { k: "One breath or two", v: `Say it all at once, or say “Hey ${brand.name}”, pause, and ask.` },
] as const;

export const greetingsNote = `Greetings work in many languages: “Hola ${brand.name}”, “Hallo ${brand.name}”, or just “${brand.name}, …”.`;

/** The recurring point: you don't connect anything. */
export const nothingToConnect = {
  title: "Nothing to connect.",
  lead: `${brand.name} works with the apps you already use, because it works on your computer.`,
  body: "No integrations. No sign-ins. No bots on your calls. It uses what’s already there:",
  sources: [
    { k: "Your screen", v: "The text of the window in front of you." },
    { k: "Your open windows", v: "Every app you have open, read when you ask." },
    { k: "Spotlight", v: "Your files: Spotlight on a Mac (Mail and notes too), Windows Search, or Tracker on Linux." },
    { k: "Calendar and Reminders", v: "Your own: Calendar and Reminders on a Mac; Outlook and notifications on Windows; GNOME Calendar and notifications on Linux." },
    { k: "Your Shortcuts", v: "Run by name: Shortcuts on a Mac, Start menu shortcuts or Power Automate flows on Windows, your scripts on Linux." },
    { k: "Your browser", v: "Drive and Gmail searches open in the browser you’re already signed in to." },
  ],
} as const;

/** First-run setup, step by step, as the app ships it. */
export const setupSteps = [
  { k: "Welcome", v: "Pick every language you’ll speak, and the language of the app." },
  { k: "Permissions", v: "The microphone, and on a Mac, Accessibility so your shortcut works and text lands where you type." },
  { k: "Speech model", v: "Turns your voice into text, on your computer. It downloads while you finish setup." },
  { k: "Where should the AI run?", v: "For polishing, drafts, answers and suggestions: in the cloud, on this computer, or No AI. Speech recognition always stays on your computer." },
  { k: "A few more choices", v: "Tidy up dictation with AI, share anonymous usage counts, email me tips. All optional, all off unless you turn them on." },
  { k: "Demo", v: "Your shortcut, and what it does: types, answers, acts, remembers and offers help. Change the shortcut here." },
  { k: "Try it", v: "Dictate into a practice note: hold the keys, then tap them. Plain dictation, so you feel the speed." },
  { k: "All set", v: "Where it lives (menu bar or tray), start at login, and whether it’s your dictation app." },
] as const;

/** How routing decides. */
export const routingRules = [
  {
    k: "Writing is the default",
    v: "Talking to a person? Your words are typed at your cursor, polished if AI polish is on. When unsure, it types.",
  },
  {
    k: "AI chat apps",
    v: `In ChatGPT, Claude, Gemini, Perplexity and Cursor, it always types your prompt. Start with “Hey ${brand.name}” to talk to ${brand.name} instead.`,
  },
  {
    k: "Messages and email",
    v: "In Slack, Mail, Gmail, Outlook, Teams, Notion, Linear and Google Docs, requests are messages to people. “Can you send me the deck?” gets typed.",
  },
  {
    k: "The Ask shortcut",
    v: "Always goes to the agent. It never types.",
  },
] as const;

export const platformNote = `Everything works on macOS, Windows and Linux (the agent is in beta on Windows and Linux). On Windows and Linux, reminders are notifications at the time you asked, and events open as an .ics file in your calendar app.`;

export const trySaying: Record<Exclude<GuideSlug, "getting-started" | "privacy">, Say[]> = {
  writing: [
    { say: "Running ten minutes late, start without me.", then: "Typed as you said it. Plain speech never waits on a model." },
    { say: "So um the build is uh green now, let’s ship it.", then: "Polished: “The build is green now. Let’s ship it.”" },
    { say: "Tell him I can’t make it, be polite.", then: "Written for you: a proper message, typed where your cursor is." },
    { say: "Reply that Thursday works.", then: "Under a message, it drafts the reply to the sender, not to you. “Odpisz, że wszystko ok” works too." },
    { say: "Make this more formal.", then: "With text selected, it rewrites the selection. The chip reads “Rewritten · Undo rewrite · Edit”." },
    { say: "Shorter.", then: "After it writes something, click Edit and say what to change: “shorter”, “warmer”." },
    { say: "Use my words.", then: "Swaps in exactly what you said. “Undo that” and “just what I said” work too." },
  ],
  answers: [
    { say: "What’s the difference between UTC and GMT?", then: "A short answer in the card. It already knows this, so no web search is made." },
    { say: "What’s the weather in Lisbon tomorrow?", then: "It searches the web, answers in a sentence or two and lists the sources it used." },
    { say: "What’s the capital gains rate in the UK?", then: "Current facts mean a web search. Each source is a link you can open." },
    { say: "Summarise this.", then: "Summarises the window in front of you: an article, a thread, a document." },
    { say: "What does this error mean?", then: "Reads the error on screen and explains it in plain words, with a likely fix." },
    { say: "Translate this into Spanish.", then: "Translates the text in front of you. Press Insert to paste it where your cursor was." },
    { say: "How many weeks until March 3rd?", then: "Worked out on the spot." },
    { say: "Make it shorter.", then: "Said within 90 seconds of an answer, it’s a follow-up. The card updates in place." },
    { say: `Hey ${brand.name}, what does this paragraph mean?`, then: `In ChatGPT or Claude, “Hey ${brand.name}” makes it answer instead of typing your prompt.` },
  ],
  actions: [
    { say: "Remind me at 5 to call Sam.", then: "A reminder at 5 pm: in Reminders on a Mac, a notification on Windows and Linux. Undo appears for a few seconds." },
    { say: "Add lunch with Ana on Friday at 1.", then: "An event on Friday at 1 pm, in your default calendar." },
    { say: "Remind me tomorrow at 9 to send the invoice.", then: "Dates like “tomorrow”, “Friday” and “at 9” are read in your local time." },
    { say: "Open Figma.", then: "Opens the app." },
    { say: "Open nytimes.com.", then: "Opens the site in your default browser." },
    { say: "Search for flights to Lisbon in March.", then: "Opens the search in your browser, so you see the results yourself." },
    { say: "Run my standup shortcut.", then: "Runs your shortcut with that name: Shortcuts on a Mac, a Start menu shortcut or Power Automate flow on Windows, a script on Linux." },
    { say: "Open Linear and file a ticket for the login bug.", then: "Not yet. It tells you computer use is coming soon and does nothing." },
  ],
  recall: [
    { say: "What did I say about pricing yesterday?", then: "Answers from your dictation history, with when you said it." },
    { say: "What was that number on the page I just closed?", then: "Looks in the last two minutes of what was on screen, kept in memory only." },
    { say: "What did Priya say about the launch date?", then: "Looks in your meeting notes and transcripts." },
    { say: "Find the Q3 deck.", then: "Finds matching files on your computer, plus a one-click Drive search in your browser." },
    { say: "Find the email from Sam about the contract.", then: "Mail messages through Spotlight on a Mac, plus a one-click Gmail search." },
    { say: "Where did I see the Acme invoice number?", then: "Searches the text of the windows you have open, in every app." },
    { say: "What was that article about battery recycling I read last week?", then: "Looks in screen memory, if you’ve turned it on." },
  ],
  meetings: [
    { say: "Yes.", then: "When it asks “Take notes for this call?”, this starts the notes." },
    { say: "Yes.", then: "On a “They asked…” nudge, this is Find it: it looks for the thing they asked for." },
    { say: "Yes.", then: "On a promise you made, this is Remind me: it adds a reminder so you follow through." },
    { say: "Not now.", then: "Dismisses the nudge. The call goes on." },
    { say: "Don’t show me these.", then: "Turns that kind of nudge off. Turn it back on in Privacy." },
    { say: "Remind me Friday at 10 to send Priya the deck.", then: "The Ask shortcut works during a call too." },
  ],
  suggestions: [
    { say: "Yes.", then: "Accepts the suggestion. “Yeah, do it”, “sure” and “go ahead” work too." },
    { say: "Not now.", then: "Dismisses this one. It may offer it again another time." },
    { say: "Don’t show me these.", then: "Turns that kind of suggestion off everywhere." },
    { say: "Not here.", then: "Stops that kind of suggestion in this app only. “Not in this app” works too." },
    { say: "Don’t suggest that in Slack.", then: "Mutes it in the app you name." },
    { say: "Stop.", then: "Turns that kind of suggestion off." },
  ],
};

/** Every moment a suggestion can appear, with the line it shows. */
export const suggestionMoments = [
  { k: "A long email thread", v: "“Long thread. Summarise it?”" },
  { k: "An email that needs a reply", v: "“Draft a reply to this?” Say the gist and get the full email in your tone." },
  { k: "A question waiting for you in chat", v: "“Reply to Ana?” Say what to say." },
  { k: "A date in an email or Slack", v: "“There’s a date in this. Add it to your calendar?”" },
  { k: "A deadline in a message", v: "“Due Friday. Want a reminder?” Say “remind me”." },
  { k: "A long draft you’re writing", v: "“Tighten this draft?” The shorter version appears with Replace, to swap it in." },
  { k: "A product page", v: "“Check if it’s cheaper elsewhere?”" },
  { k: "A search you keep rephrasing", v: "“Want me to just answer that?”" },
  { k: "A long article", v: "“Summarise this page?”" },
  { k: "A page in another language", v: "“Translate this page?”" },
  { k: "Spreadsheet formula errors", v: "“Fix these formula errors?”" },
  { k: "A stack trace, failing test or new terminal error", v: "“Explain this error?”" },
  { k: "A pull request in GitHub, GitLab or Bitbucket", v: "“Review this pull request?”" },
  { k: "A git diff in your terminal", v: "“Write a commit message for this?”" },
  { k: "A meeting in the next 10 minutes", v: "“Meeting coming up. Brief you?” From your own Calendar." },
  { k: "A call starting", v: "“Take notes for this call?” when a call app is open and the microphone is in use." },
] as const;

/** Smart writing: the three outcomes, as the chip names them. */
export const writingOutcomes = [
  { k: "As said", v: "Your exact words, with your custom words applied. No chip. Used whenever it isn’t sure." },
  { k: "Polished", v: "Messy speech cleaned up, in your words. Chip: “Polished · Use my words”. Needs AI polish on (off by default, so dictation is instant)." },
  { k: "Written for you", v: "An instruction turned into the message. Chip: “Written for you · Use my words · Edit”. Works with AI polish off." },
  { k: "Rewritten", v: "Selected text rewritten as you asked. Chip: “Rewritten · Undo rewrite · Edit”." },
] as const;

/** Styles and words it follows. */
export const writingYours = [
  { k: "App and site styles", v: "Casual for Slack, polished for Gmail, as said in your terminal. In Account → Writing." },
  { k: "Learns your fixes", v: "Correct the same word twice and it offers to remember it. In Settings → Advanced → Learn from my corrections." },
  { k: "Custom words", v: "Names and terms spelled your way, in Settings → Advanced." },
] as const;

/** The Writing setting, in Account. */
export const writingSettings = [
  { k: "Smart (default)", v: `${brand.name} decides each time.` },
  { k: "Always as I said", v: `Your exact words. It only writes for you when you ask ${brand.name} by name.` },
  { k: "Always polish", v: "AI polish on every dictation." },
] as const;
