import { useEffect } from "react";

/**
 * "Open" on the notes card asks for a meeting to be shown. The Meetings page
 * may not be mounted yet, so the id waits here until it is.
 */
let pending: number | null = null;
const EVENT = "ambient:open-meeting";

export function requestOpenMeeting(id: number) {
  pending = id;
  window.dispatchEvent(new Event(EVENT));
}

/** Calls `open` with a requested meeting, now (on mount) or when asked. */
export function usePendingMeeting(open: (id: number) => void) {
  useEffect(() => {
    const take = () => {
      if (pending === null) return;
      const id = pending;
      pending = null;
      open(id);
    };
    take();
    window.addEventListener(EVENT, take);
    return () => window.removeEventListener(EVENT, take);
  }, [open]);
}
