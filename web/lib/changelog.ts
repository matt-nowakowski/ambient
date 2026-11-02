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
