import { brand, upstream } from "./brand";

export type Release = {
  version: string;
  date: string; // ISO yyyy-mm-dd
  title: string;
  summary: string;
  sections: { heading: string; items: string[] }[];
};

/** Newest first. Add a new object at the top for each release. */
export const changelog: Release[] = [
  {
    version: "0.1.2",
    date: "2026-11-02",
    title: "Smoother setup, a smarter agent",
    summary:
      "Fixes from our first full test run: setup keeps you in front, dictation stops when you pause, and the agent always answers back.",
    sections: [
      {
        heading: "Dictation",
        items: [
          "Tap-to-talk now stops on its own after a pause (adjustable, or off) as well as on the shortcut.",
          "Custom words are spelled exactly as you added them, even when they're heard slightly differently.",
          "AI polish is faster: the connection is ready before you finish speaking.",
          "Dictating with no text box selected shows “Did you mean to type this?” with Copy, instead of losing the text.",
        ],
      },
      {
        heading: "The agent",
        items: [
          "It always shows that it heard you: a listening card for the shortcut and for “Hey Ambient”, and a clear note when it can't help.",
          "Follow-up questions keep the context of the last answer.",
          "“Reply saying…” and “draft an email…” now write the reply instead of typing your instruction.",
          "Sources show only real pages, emails and files, never internal ones.",
          "Actions fit the moment: Insert only when you're in a text box, Reply, Add to calendar, Open link, Copy code.",
          "Answer cards close when you click elsewhere, and fade out instead of snapping shut.",
          "Say “yes” or “not now” to a suggestion without pressing anything, and long email threads in Gmail and Mail get a summary offer.",
          "Web search is more reliable, and says so when it can't reach the web.",
          "Ask “what can I say?” to see examples.",
        ],
      },
      {
        heading: "Privacy",
        items: [
          "Steps back automatically from crypto wallets (including browser extensions like MetaMask), password managers and banking sites.",
          "A clearer Privacy page, with a single Pause menu.",
        ],
      },
      {
        heading: "App",
        items: [
          "Search everything with ⌘K: every page and setting is one jump away.",
          "Setup brings Ambient back to the front after each permission, and records full shortcut combinations.",
          "A redesigned “What can I say?”, Meetings and Account, with billing and sign-out in a ⋯ menu.",
          "Your plan shows what's left today, not what you've used.",
          "Fixes for the sidebar highlight, card corners, equal-height cards and a leftover Dock dot after quitting.",
        ],
      },
    ],
  },
  {
    version: "0.1.1",
    date: "2026-11-02",
    title: "Release pipeline",
    summary:
      "No app changes. Installers for every platform now come from one automated, signed and notarized release build.",
    sections: [
      {
        heading: "Changes",
        items: [
          "macOS disk images are notarized and stapled, so they open offline without a Gatekeeper warning.",
        ],
      },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-11-02",
    title: `First release of ${brand.name}`,
    summary: `A voice agent that writes, answers and acts. ${brand.name} is built on ${upstream.name} by ${upstream.author} (${upstream.license}): speech recognition runs on your computer, and the agent answers, acts and takes meeting notes when you ask it to.`,
    sections: [
      {
        heading: "Dictation (free, unlimited)",
        items: [
          "On-device speech-to-text in about 100 languages, with push-to-talk or toggle shortcuts.",
          "AI polish cleans up what you say before it's typed.",
          "History: search, play back, copy and re-transcribe; transcribe audio files.",
          "A new design throughout: glass surfaces, light and dark themes.",
        ],
      },
      {
        heading: "The agent (Pro, macOS)",
        items: [
          "One shortcut writes, answers, acts or recalls, decided by what you say and which app you're in.",
          "Answers in a glass card with sources; web search only when needed.",
          "Reminders and calendar events in your own apps, opening apps and links, running your Shortcuts.",
          "Meeting notes for any call with no bot joining: you and them, notes, summary, action items and live nudges.",
          "Suggestions at the right moment: long threads, drafts, dates, prices, errors, pull requests, spreadsheets, meetings.",
          "Privacy Center: per-feature opt-ins, never-watch list, what's stored, and every request that left your Mac.",
        ],
      },
      {
        heading: "Known limitations",
        items: [
          "Screen reading, suggestions and meeting call audio are macOS-only for now; Windows and Linux get dictation, answers and actions.",
          "Computer use (operating apps for you) is coming soon.",
          "On Wayland, global shortcuts are limited: bind the command-line toggle to a desktop shortcut (see Linux setup).",
        ],
      },
    ],
  },
];
