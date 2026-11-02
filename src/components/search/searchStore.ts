import { create } from "zustand";
import { useOsType } from "@/hooks/useOsType";
import type { SidebarSection } from "../Sidebar";
import type { SettingsTab } from "../settings/settingsTabs";

/** Where a search result points. */
export interface SearchTarget {
  section: SidebarSection;
  tab?: SettingsTab;
  /** Translated label of the row or group to scroll to and highlight. */
  label?: string;
}

interface SearchState {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Set when a result is chosen; consumed by the page it points at. */
  target: SearchTarget | null;
  /** Bumped on every jump, so choosing the same result twice still jumps. */
  nonce: number;
  jump: (target: SearchTarget) => void;
  /** The page has handled the jump. */
  clear: () => void;
}

export const useSearch = create<SearchState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  target: null,
  nonce: 0,
  jump: (target) => set((s) => ({ target, nonce: s.nonce + 1, open: false })),
  clear: () => set({ target: null }),
}));

/** The search shortcut as shown: "⌘K" on macOS, "Ctrl K" elsewhere. */
export const useSearchShortcutLabel = () =>
  useOsType() === "macos" ? "⌘K" : "Ctrl K";
