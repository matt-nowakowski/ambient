/** The Settings page's tabs, in order. Shared by the page and global search. */
export const SETTINGS_TABS = [
  { id: "general", labelKey: "sidebar.general" },
  { id: "advanced", labelKey: "sidebar.advanced" },
  { id: "postprocessing", labelKey: "sidebar.postProcessing" },
  { id: "about", labelKey: "sidebar.about" },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

/** Post Process only shows once post-processing is on. */
export const settingsTabVisible = (
  tab: SettingsTab,
  postProcessEnabled: boolean,
) => tab !== "postprocessing" || postProcessEnabled;
