import React from "react";
import ReactDOM from "react-dom/client";
import { platform } from "@tauri-apps/plugin-os";
import App from "./App";
import { installCompatShims } from "./lib/compat";
import {
  applyTheme,
  getStoredTheme,
  syncThemeFromSettings,
} from "./lib/utils/theme";

installCompatShims();

// Send uncaught interface errors to the app log (a blank window is otherwise
// silent). Uses the raw invoke so it works even if the bindings failed to load.
function reportError(message: string) {
  try {
    (
      window as unknown as {
        __TAURI_INTERNALS__?: {
          invoke: (c: string, a: unknown) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__
      ?.invoke("frontend_error", { window: "main", message })
      .catch(() => {});
  } catch {
    // Nothing more we can do.
  }
}
window.addEventListener("error", (e) =>
  reportError(`${e.message}\n${e.error?.stack ?? ""}`),
);
window.addEventListener("unhandledrejection", (e) =>
  reportError(`unhandled rejection: ${String(e.reason?.stack ?? e.reason)}`),
);

// Set platform before render so CSS can scope per-platform (e.g. scrollbar styles)
document.documentElement.dataset.platform = platform();

// Apply the last-known theme synchronously before render to avoid a flash of
// the wrong palette, then reconcile with the persisted setting once it loads.
applyTheme(getStoredTheme());
syncThemeFromSettings();

// Initialize i18n
import "./i18n";

// Initialize model store (loads models and sets up event listeners)
import { useModelStore } from "./stores/modelStore";
import { useTranscriptionJobsStore } from "./stores/transcriptionJobsStore";
useModelStore.getState().initialize();
useTranscriptionJobsStore.getState().initialize();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
