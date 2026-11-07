import { create } from "zustand";

export type ModelsTab = "voice" | "reasoning";

const KEY = "models.tab";

/** The tab Models opened on last time: a convenience, so a missing or
 * blocked localStorage just means Voice models. */
const load = (): ModelsTab => {
  try {
    return localStorage.getItem(KEY) === "reasoning" ? "reasoning" : "voice";
  } catch {
    return "voice";
  }
};

export const useModelsTab = create<{
  tab: ModelsTab;
  setTab: (tab: ModelsTab) => void;
}>((set) => ({
  tab: load(),
  setTab: (tab) => {
    try {
      localStorage.setItem(KEY, tab);
    } catch {
      // Remembering is optional.
    }
    set({ tab });
  },
}));
