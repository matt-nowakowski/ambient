import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { toast, Toaster } from "sonner";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { platform } from "@tauri-apps/plugin-os";
import {
  checkAccessibilityPermission,
  checkMicrophonePermission,
} from "tauri-plugin-macos-permissions-api";
import { ModelStateEvent, RecordingErrorEvent } from "./lib/types/events";
import "./App.css";
import SecureInputWarning from "./components/SecureInputWarning";
import Footer from "./components/footer";
import { OnboardingFlow } from "./components/onboarding/OnboardingFlow";
import ModelMigration from "./components/onboarding/ModelMigration";
import {
  ReplaceModel,
  ReturningPermissions,
} from "./components/onboarding/StandaloneScreens";
import {
  clearOnboardingProgress,
  type OnboardingStep as OnboardingPreviewStep,
} from "./components/onboarding/onboardingStore";
import { DebugSettings, ModelsSettings } from "./components/settings";
import { HomePage } from "./components/home";
import { PageTransition } from "./components/ui/Motion";
import { MotionConfig } from "motion/react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FileDropOverlay } from "./components/FileDropOverlay";
import { Sidebar, SidebarSection, SECTIONS_CONFIG } from "./components/Sidebar";
import { GlobalSearch, useSearchJump } from "./components/search/GlobalSearch";
import { WhatsNewGate } from "./components/whats-new";
import { useSettings } from "./hooks/useSettings";
import { useSettingsStore } from "./stores/settingsStore";
import { commands } from "@/bindings";
import { deleteRetiredModel } from "@/lib/models/retired";
import { getLanguageDirection, initializeRTL } from "@/lib/utils/rtl";
import { toastIcons } from "./components/ui/ToastIcons";
import { StartupScreen } from "./components/shared/StartupScreen";
import { AgentTour } from "./components/getstarted/AgentTour";
import {
  listenForMilestones,
  useGetStarted,
} from "./components/getstarted/store";

/** Startup diagnostics go to the app log (see `frontend_error`). */
function logStartup(message: string) {
  commands.frontendError("main", message).catch(() => {});
}

/** The agent tour: once, the first time the main app shows (after setup, or
 * after updating into the agent). Milestones are recorded from here on. */
function AgentTourGate() {
  const { tourSeen, openTour } = useGetStarted();
  useEffect(() => {
    listenForMilestones();
    if (!tourSeen) {
      const id = setTimeout(openTour, 900); // after the app has settled in
      return () => clearTimeout(id);
    }
  }, [tourSeen, openTour]);
  return <AgentTour />;
}

// flow is first-run onboarding; the rest are single screens for returning users.
type OnboardingStep =
  | "flow"
  | "permissions"
  | "migration"
  | "replaceModel"
  | "done";

const renderSettingsContent = (
  section: SidebarSection,
  onPreviewOnboarding: (step: OnboardingPreviewStep) => void,
  onRunOnboarding: () => void,
  onRunModelMigration: () => void,
  onSectionChange: (section: SidebarSection) => void,
) => {
  if (section === "home") {
    return (
      <HomePage
        onOpenHistory={() => onSectionChange("history")}
        onOpenAccount={() => onSectionChange("account")}
        onOpenPrivacy={() => onSectionChange("privacy")}
      />
    );
  }
  if (section === "models") {
    return (
      <ModelsSettings onChangeLanguages={() => onSectionChange("settings")} />
    );
  }
  if (section === "debug") {
    return (
      <DebugSettings
        onPreviewOnboarding={onPreviewOnboarding}
        onRunOnboarding={onRunOnboarding}
        onRunModelMigration={onRunModelMigration}
      />
    );
  }

  const ActiveComponent =
    SECTIONS_CONFIG[section]?.component || SECTIONS_CONFIG.settings.component;
  return <ActiveComponent />;
};

function App() {
  const { t, i18n } = useTranslation();
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep | null>(
    null,
  );
  const [onboardingPreview, setOnboardingPreview] =
    useState<OnboardingPreviewStep | null>(null);
  // Set when a returning user's selected model is a retired (ONNX) model that
  // is still on disk: they must update it before the app can transcribe.
  const [migrationModelId, setMigrationModelId] = useState<string | null>(null);
  const [currentSection, setCurrentSection] = useState<SidebarSection>("home");
  const showHistory = useCallback(() => setCurrentSection("history"), []);
  const { settings, updateSetting } = useSettings();
  const direction = getLanguageDirection(i18n.language);
  const refreshAudioDevices = useSettingsStore(
    (state) => state.refreshAudioDevices,
  );
  const refreshOutputDevices = useSettingsStore(
    (state) => state.refreshOutputDevices,
  );
  const hasCompletedPostOnboardingInit = useRef(false);
  const settingsScrollRef = useRef<HTMLDivElement>(null);
  // Reset the scroll position whenever the active section changes.
  useLayoutEffect(() => {
    settingsScrollRef.current?.scrollTo({ top: 0 });
  }, [currentSection]);
  // A global search result scrolls to (and highlights) its row.
  useSearchJump(currentSection, settingsScrollRef);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  // Initialize RTL direction when language changes
  useEffect(() => {
    initializeRTL(i18n.language);
  }, [i18n.language]);

  // Initialize Enigo, shortcuts, and refresh audio devices when main app loads
  useEffect(() => {
    if (onboardingStep === "done" && !hasCompletedPostOnboardingInit.current) {
      hasCompletedPostOnboardingInit.current = true;
      Promise.all([
        commands.initializeEnigo(),
        commands.initializeShortcuts(),
      ]).catch((e) => {
        console.warn("Failed to initialize:", e);
      });
      refreshAudioDevices();
      refreshOutputDevices();
    }
  }, [onboardingStep, refreshAudioDevices, refreshOutputDevices]);

  // Handle keyboard shortcuts for debug mode toggle
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl+Shift+D (Windows/Linux) or Cmd+Shift+D (macOS)
      const isDebugShortcut =
        event.shiftKey &&
        event.key.toLowerCase() === "d" &&
        (event.ctrlKey || event.metaKey);

      if (isDebugShortcut) {
        event.preventDefault();
        const currentDebugMode = settings?.debug_mode ?? false;
        updateSetting("debug_mode", !currentDebugMode);
      }
    };

    // Add event listener when component mounts
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup event listener when component unmounts
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [settings?.debug_mode, updateSetting]);

  // Listen for recording errors from the backend and show a toast
  useEffect(() => {
    const unlisten = listen<RecordingErrorEvent>("recording-error", (event) => {
      const { error_type, detail } = event.payload;

      if (error_type === "microphone_permission_denied") {
        const currentPlatform = platform();
        const platformKey = `errors.micPermissionDenied.${currentPlatform}`;
        const description = t(platformKey, {
          defaultValue: t("errors.micPermissionDenied.generic"),
        });
        toast.error(t("errors.micPermissionDeniedTitle"), { description });
      } else if (error_type === "no_input_device") {
        toast.error(t("errors.noInputDeviceTitle"), {
          description: t("errors.noInputDevice"),
        });
      } else {
        toast.error(
          t("errors.recordingFailed", { error: detail ?? "Unknown error" }),
        );
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Listen for paste failures and show a toast.
  // The technical error detail is logged to ambient.log on the Rust side
  // (see actions.rs `error!("Failed to paste transcription: ...")`),
  // so we show a localized, user-friendly message here instead of the raw error.
  useEffect(() => {
    const unlisten = listen("paste-error", () => {
      toast.error(t("errors.pasteFailedTitle"), {
        description: t("errors.pasteFailed"),
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // The backend refused a dictation for the Free weekly cap and raised this
  // window: land on Account, where the upgrade lives.
  useEffect(() => {
    const unlisten = listen("plan-limit-reached", () => {
      setCurrentSection("account");
      toast(t("account.limitToast"), {
        description: t("account.limitReached"),
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Listen for transcription failures and show a toast.
  // The payload is the backend error message (also logged to ambient.log).
  useEffect(() => {
    const unlisten = listen<string>("transcription-error", (event) => {
      toast.error(t("errors.transcriptionFailedTitle"), {
        description: event.payload,
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Listen for model loading failures and show a toast
  useEffect(() => {
    const unlisten = listen<ModelStateEvent>("model-state-changed", (event) => {
      if (event.payload.event_type === "loading_failed") {
        toast.error(
          t("errors.modelLoadFailed", {
            model:
              event.payload.model_name || t("errors.modelLoadFailedUnknown"),
          }),
          {
            description: event.payload.error,
          },
        );
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  const revealMainWindowForPermissions = async () => {
    try {
      await commands.showMainWindowCommand();
    } catch (e) {
      console.warn("Failed to show main window for permission onboarding:", e);
    }
  };

  const getMigrationModelId = async (
    selectedModel: string,
  ): Promise<string | null> => {
    const retired = await commands.getRetiredModels();
    return retired.some((m) => m.id === selectedModel) ? selectedModel : null;
  };

  // Returning users land in the app unless their model needs updating. The
  // window may start hidden, so bring it forward for the update screen.
  const finishReturningUser = async (retiredModelId: string | null) => {
    if (retiredModelId) {
      await revealMainWindowForPermissions();
      setOnboardingStep("migration");
    } else {
      setOnboardingStep("done");
    }
  };

  const checkOnboardingStatus = async () => {
    // Never leave the window empty: if a check below hangs, carry on to the
    // app after a few seconds and log where it stopped.
    let stage = "settings";
    let settled = false;
    const watchdog = setTimeout(() => {
      if (settled) return;
      logStartup(
        `startup check stuck at "${stage}" after 8 s; continuing to the app`,
      );
      setOnboardingStep((s) => s ?? "done");
    }, 8000);
    try {
      const settingsResult = await commands.getAppSettings();
      const hasCompletedOnboarding =
        settingsResult.status === "ok" &&
        settingsResult.data.onboarding_completed === true;
      const currentPlatform = platform();

      if (hasCompletedOnboarding) {
        // Returning user - check if they need to grant permissions first
        stage = "retired models";
        const retiredModelId = await getMigrationModelId(
          settingsResult.data.selected_model ?? "",
        );
        setMigrationModelId(retiredModelId);

        if (currentPlatform === "macos") {
          try {
            stage = "macOS permissions";
            const [hasAccessibility, hasMicrophone] = await Promise.all([
              checkAccessibilityPermission(),
              checkMicrophonePermission(),
            ]);
            if (!hasAccessibility || !hasMicrophone) {
              stage = "show window (permissions)";
              await revealMainWindowForPermissions();
              setOnboardingStep("permissions");
              return;
            }
          } catch (e) {
            console.warn("Failed to check macOS permissions:", e);
            // If we can't check, proceed to main app and let them fix it there
          }
        }

        if (currentPlatform === "windows") {
          try {
            const microphoneStatus =
              await commands.getWindowsMicrophonePermissionStatus();
            if (
              microphoneStatus.supported &&
              microphoneStatus.overall_access === "denied"
            ) {
              await revealMainWindowForPermissions();
              setOnboardingStep("permissions");
              return;
            }
          } catch (e) {
            console.warn("Failed to check Windows microphone permissions:", e);
            // If we can't check, proceed to main app and let them fix it there
          }
        }

        stage = "finish returning user";
        await finishReturningUser(retiredModelId);
      } else {
        // New user - start full onboarding
        setOnboardingStep("flow");
      }
    } catch (error) {
      console.error("Failed to check onboarding status:", error);
      logStartup(`startup check failed at "${stage}": ${String(error)}`);
      setOnboardingStep("flow");
    } finally {
      settled = true;
      clearTimeout(watchdog);
    }
  };

  // Debug: the real onboarding from Welcome, for testing it end to end.
  const runOnboarding = () => {
    clearOnboardingProgress();
    setOnboardingStep("flow");
  };

  // Debug: the real model migration screen. It leads with the selected model
  // if that's retired, otherwise with the first retired model on disk.
  const runModelMigration = async () => {
    const retired = await commands.getRetiredModels();
    if (retired.length === 0) {
      toast.info(t("settings.debug.modelMigration.noRetired"));
      return;
    }
    const selected = settings?.selected_model;
    setMigrationModelId(
      retired.find((m) => m.id === selected)?.id ?? retired[0].id,
    );
    setOnboardingStep("migration");
  };

  const handleModelSelected = async () => {
    // Reached when the user picks a different model instead of updating.
    for (const model of await commands.getRetiredModels()) {
      await deleteRetiredModel(model.id);
    }
    setOnboardingStep("done");
  };

  // Rendered once around every step below (including onboarding) so
  // toast.error() calls surface to the user. sonner renders via a portal, so
  // its position in the tree doesn't affect layout. Without this, errors during
  // onboarding (e.g. a model download failing because the model host is
  // unreachable) are silently swallowed and the wizard just appears to "blink".
  const toaster = (
    <Toaster
      theme="system"
      gap={8}
      icons={toastIcons}
      toastOptions={{
        unstyled: true,
        // Every variant shares one glass surface (styles/transitions.css,
        // "Ambient toasts") and the transitions.dev "Toast" motion (t-toast-sonner):
        // rise in with fade, blur and scale. Status shows as a tiny dot.
        classNames: {
          toast: "t-toast-sonner ambient-toast",
        },
      }}
    />
  );

  // Still checking onboarding status: show that we're starting, never a blank window.
  if (onboardingStep === null) {
    return <StartupScreen />;
  }

  // Select the content for the current step. The Toaster is rendered once, in a
  // stable wrapper around this node, so crossing between onboarding steps and
  // the main app never remounts it (which would drop any in-flight toast).
  let content: ReactNode;
  if (onboardingPreview) {
    // Previews render in the same top-level slot as real onboarding, inert:
    // no prompts, downloads or setting writes.
    content = (
      <>
        <OnboardingFlow
          preview
          previewStep={onboardingPreview}
          onComplete={() => setOnboardingPreview(null)}
        />
        <button
          type="button"
          onClick={() => setOnboardingPreview(null)}
          className="fixed top-4 end-4 z-50 rounded-full border border-line bg-background px-4 py-2 text-ui font-medium text-text shadow-lg hover:bg-logo-primary/20 cursor-pointer"
        >
          {t("settings.debug.onboardingPreview.exitButton")}
        </button>
      </>
    );
  } else if (onboardingStep === "flow") {
    content = <OnboardingFlow onComplete={() => setOnboardingStep("done")} />;
  } else if (onboardingStep === "permissions") {
    content = (
      <ReturningPermissions
        onComplete={() => finishReturningUser(migrationModelId)}
      />
    );
  } else if (onboardingStep === "migration" && migrationModelId) {
    content = (
      <ModelMigration
        inUseModelId={migrationModelId}
        onComplete={() => setOnboardingStep("done")}
        onChooseAnother={() => setOnboardingStep("replaceModel")}
      />
    );
  } else if (onboardingStep === "replaceModel") {
    content = (
      <ReplaceModel
        onBack={() => setOnboardingStep("migration")}
        onComplete={handleModelSelected}
      />
    );
  } else {
    content = (
      <div dir={direction} className="h-screen flex select-none cursor-default">
        {/* macOS: the window has no title bar; this strip drags it, and the
            traffic lights float over its left end. */}
        {platform() === "macos" && (
          <div
            data-tauri-drag-region
            className="fixed inset-x-0 top-0 z-50 h-[38px]"
          />
        )}
        <ErrorBoundary context="What's New">
          <WhatsNewGate />
        </ErrorBoundary>
        <ErrorBoundary context="Agent tour">
          <AgentTourGate />
        </ErrorBoundary>
        <ErrorBoundary context="Search">
          <GlobalSearch onNavigate={setCurrentSection} />
        </ErrorBoundary>
        {/* Inset layout (shadcn "inset" sidebar): the sidebar sits on the
            window backdrop; the page floats in a rounded panel beside it. */}
        <Sidebar
          activeSection={currentSection}
          onSectionChange={setCurrentSection}
        />
        <main className="glass flex min-w-0 flex-1 flex-col overflow-hidden rounded-window my-2 me-2 bg-[var(--inset-surface)]!">
          <div ref={settingsScrollRef} className="flex-1 overflow-y-auto">
            {/* Models fills the window: its table scrolls, not the page. */}
            <div
              className={`flex flex-col items-center px-8 pt-8 pb-10 gap-4 ${currentSection === "models" ? "h-full" : ""}`}
            >
              <SecureInputWarning />
              <PageTransition
                id={currentSection}
                className={`w-full ${currentSection === "models" ? "h-full" : ""}`}
              >
                {renderSettingsContent(
                  currentSection,
                  setOnboardingPreview,
                  runOnboarding,
                  runModelMigration,
                  setCurrentSection,
                )}
              </PageTransition>
            </div>
          </div>
          <Footer onShowHistory={showHistory} />
        </main>
        <FileDropOverlay onDropped={showHistory} />
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-backdrop" aria-hidden="true" />
      <div className="relative z-[1]">
        {toaster}
        {content}
      </div>
    </MotionConfig>
  );
}

export default App;
