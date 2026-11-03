import React, { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { FeedbackSource } from "@/bindings";
import type { SidebarSection } from "../Sidebar";
import { requestOpenMeeting } from "../meetings/pendingMeeting";
import { FeedbackDialog, type FeedbackRequest } from "./FeedbackDialog";

const OPEN_EVENT = "ambient:open-feedback";

/** Open the Send feedback dialog from anywhere in the main window. */
export function openFeedback(source: FeedbackSource = "dialog") {
  window.dispatchEvent(
    new CustomEvent<FeedbackRequest>(OPEN_EVENT, { detail: { source } }),
  );
}

/** Mounted once in the main window: opens the feedback dialog (tray, About,
 * a 👎 in the HUD) and the meeting a notes card's "Open" asked for. */
export const FeedbackGate: React.FC<{
  onNavigate: (section: SidebarSection) => void;
}> = ({ onNavigate }) => {
  const [request, setRequest] = useState<FeedbackRequest | null>(null);

  useEffect(() => {
    const local = (e: Event) =>
      setRequest((e as CustomEvent<FeedbackRequest>).detail);
    window.addEventListener(OPEN_EVENT, local);
    const unlisten = [
      listen<{ source: FeedbackSource; card_id?: string }>(
        "open-feedback",
        (e) =>
          setRequest({
            source: e.payload.source,
            cardId: e.payload.card_id ?? null,
          }),
      ),
      listen<number>("open-meeting", (e) => {
        onNavigate("meetings");
        requestOpenMeeting(e.payload);
      }),
    ];
    return () => {
      window.removeEventListener(OPEN_EVENT, local);
      unlisten.forEach((p) => p.then((f) => f()));
    };
  }, [onNavigate]);

  return <FeedbackDialog request={request} onClose={() => setRequest(null)} />;
};
