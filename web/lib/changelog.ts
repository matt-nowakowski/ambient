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
    version: "0.1.7",
    date: "2026-11-03",
    title: "Your desktop colleague",
    summary:
      "Ambient now knows when to type what you said and when to write it for you, offers help from your first day, and Free gets the whole colleague with weekly limits.",
    sections: [
      {
        heading: "Smart writing",
        items: [
          "Each time you dictate, Ambient decides: type it as you said it, tidy it up, or write it for you. “Tell him I can't make it, be polite” becomes a proper message.",
          "A small note shows what it did. Click “Use my words”, or just say it, to get your exact words back.",
          "Select text and say “make this more formal” or “shorter”; “Undo rewrite” brings your original back.",
          "Edit by voice: say “warmer” or “shorter” right after.",
          "It learns where you prefer your own words. Choose Smart, Always as I said, or Always polish in Settings.",
        ],
      },
      {
        heading: "Free gets the colleague",
        items: [
          "Every agent feature is now on Free, with weekly limits: 25 AI uses, 10 suggestions, 2 meetings a month and the last 24 hours of recall. Hands-free “Hey Ambient” included.",
          "Pro removes the limits. Home shows what's left, and Ambient tells you kindly when you reach one.",
          "Background decisions, like working out what you meant, never use up your AI uses.",
        ],
      },
      {
        heading: "Getting started",
        items: [
          "Setup introduces Ambient as your desktop colleague, and a new step shows how it offers help, with the switch to turn suggestions on.",
          "AI polish is on by default for new installs, with a clear switch during setup. Your existing choice doesn't change.",
          "Your first suggestion comes with a one-time tip on how to answer it.",
        ],
      },
    ],
  },
  {
    version: "0.1.6",
    date: "2026-11-03",
    title: "A colleague, not a command line",
    summary:
      "Ask anything and Ambient answers, does it, or tells you why not and what it can do instead. It also speaks up more, in better moments, and learns what you want.",
    sections: [
      {
        heading: "The agent",
        items: [
          "Requests always get a response: “remind me tomorrow morning…”, “can we reply saying…”, questions with nothing selected. If it can't do something, it says why and offers an alternative.",
          "Suggestions like a colleague: summarise a long thread, “Reply to Ana?” (say “yes, tell them Thursday works”), translate a page, explain an error. Never the same offer twice on one window, and quieter when you dismiss.",
          "A reliable on-device judge on Macs with Apple Intelligence, and visible cloud suggestions when you choose Cloud.",
          "Reminders on every system: Reminders on Mac, notifications on Windows and Linux, with a clear fallback and Undo.",
          "Report a bug by voice: “Hey Ambient, report a bug…”, or 👍/👎 on any answer, or Send feedback in the menu.",
        ],
      },
      {
        heading: "Meetings",
        items: [
          "When a call ends, a card says your notes are ready: open, copy, or email them to yourself (signed in).",
        ],
      },
      {
        heading: "Privacy",
        items: [
          "“What you've told me”: the suggestions you've turned off, with Undo, instead of a long list of switches.",
          "Optional anonymous usage counts (never what you say, type or see), off unless you turn them on.",
        ],
      },
      {
        heading: "App",
        items: [
          "A full-size Dock icon on macOS, and setup stays in front after the intro.",
          "Setup picks a speech model that's already on your computer.",
          "Clear, translated error messages with Try again, instead of technical ones.",
          "First launch tidies up: ejects the installer and offers to move it to the Bin.",
          "Windows and Linux: the intro, glass and animations, with Ctrl key hints; screen memory key protected by Windows.",
          "Translations reviewed in every language.",
        ],
      },
    ],
  },
  {
    version: "0.1.5",
    date: "2026-11-03",
    title: "The agent on Windows and Linux",
    summary:
      "Every agent feature now runs on macOS, Windows and Linux (in beta on Windows and Linux). A new Intelligence setting decides where the AI runs.",
    sections: [
      {
        heading: "Windows and Linux (beta)",
        items: [
          "Ask about what's on screen, recall what you've seen and find your files, with suggestions, meeting notes from the call's audio and call detection.",
          "Windows reads windows through UI Automation, finds files with Windows Search, reads upcoming meetings from Outlook, and runs Start menu shortcuts or Power Automate flows.",
          "Linux reads windows through AT-SPI (we show you how to turn it on), finds files with Tracker or locate, reads meetings from GNOME Calendar, and runs your apps or scripts.",
          "The answer card floats above your apps without taking focus.",
        ],
      },
      {
        heading: "Intelligence: where the AI runs",
        items: [
          "Automatic (default), On this computer only, or Cloud, in Privacy. Every feature works with each choice.",
          "On this computer only now covers AI polish too: nothing is sent for AI at all.",
          "Suggestions from the cloud: an opt-in for computers without an on-device model (Pro). Redacted, listed in your request log, off until you say yes.",
          "“This Mac” is now “this computer” throughout.",
        ],
      },
    ],
  },
  {
    version: "0.1.4",
    date: "2026-11-02",
    title: "Suggestions that think, replies that land",
    summary:
      "Ambient now looks at any window you stay on and offers help when it can, judged on your Mac. Replies open the reply box for you, and a proper Dock icon.",
    sections: [
      {
        heading: "The agent",
        items: [
          "Suggestions for far more situations. On Macs with Apple Intelligence, an on-device model decides whether it can help with the window you're on; nothing is sent to decide.",
          "New suggestions: help filling in forms, translate a page in another language, summarise long documents, reply to a question in chat, explain a terminal error.",
          "Long email threads are recognised in Google Workspace mail too, and in Arc.",
          "Replies understand how people actually ask: “please reply to this email saying…”, “let them know…”, “write back…”. With no reply box open, Ambient opens one (Mail and Gmail) and writes the reply into it.",
          "Cards close reliably when you click elsewhere, with a quicker, softer fade.",
        ],
      },
      {
        heading: "Privacy",
        items: [
          "Chrome, Brave and Edge: Ambient now steps back from crypto wallets in the side panel and extension pop-ups too.",
        ],
      },
      {
        heading: "Fixes",
        items: [
          "Dictation never pastes what was already on your clipboard instead of what you said.",
          "A proper Ambient icon in the Dock instead of a tiny dot.",
          "Search (⌘K) highlights the matching setting in its real shape.",
          "The Pro card's corners are clean.",
        ],
      },
    ],
  },
  {
    version: "0.1.3",
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
