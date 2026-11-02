import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";

/** Things worth doing once, ticked off as the user does them for real. */
export const STEPS = [
  "answer", // ask the agent a question
  "reminder", // set a reminder (or event) by voice
  "about_screen", // "summarise this"
  "suggestion", // accept a suggestion
  "meeting", // take meeting notes
  "privacy", // look at the Privacy Center
] as const;
export type Step = (typeof STEPS)[number];

const KEY = "ambient.getStarted";

interface Saved {
  done: Step[];
  tourSeen: boolean;
  dismissed: boolean;
}

interface GetStarted extends Saved {
  tourOpen: boolean;
  mark: (step: Step) => void;
  openTour: () => void;
  closeTour: () => void;
  dismiss: () => void;
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw)
      return {
        done: [],
        tourSeen: false,
        dismissed: false,
        ...JSON.parse(raw),
      };
  } catch {
    // Storage unavailable: start fresh.
  }
  return { done: [], tourSeen: false, dismissed: false };
}

function save(s: Saved) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        done: s.done,
        tourSeen: s.tourSeen,
        dismissed: s.dismissed,
      }),
    );
  } catch {
    // Not critical.
  }
}

export const useGetStarted = create<GetStarted>((set, get) => ({
  ...load(),
  tourOpen: false,
  mark: (step) => {
    if (get().done.includes(step)) return;
    set({ done: [...get().done, step] });
    save(get());
  },
  openTour: () => set({ tourOpen: true }),
  closeTour: () => {
    set({ tourOpen: false, tourSeen: true });
    save(get());
  },
  dismiss: () => {
    set({ dismissed: true });
    save(get());
  },
}));

/** Milestones from the app ("agent-milestone" events) → checklist steps. */
const FROM_MILESTONE: Record<string, Step> = {
  answer: "answer",
  recall: "answer",
  about_screen: "about_screen",
  reminder: "reminder",
  event: "reminder",
  suggestion: "suggestion",
  meeting: "meeting",
};

let listening = false;
/** Call once at startup (App): records milestones wherever the user is. */
export function listenForMilestones() {
  if (listening) return;
  listening = true;
  listen<string>("agent-milestone", (e) => {
    const step = FROM_MILESTONE[e.payload];
    if (step) useGetStarted.getState().mark(step);
    // "summarise this" is also an answer.
    if (e.payload === "about_screen") useGetStarted.getState().mark("answer");
  });
}
