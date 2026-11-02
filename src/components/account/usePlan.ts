import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  commands,
  events,
  type PlanStatus,
  type PolishUsage,
} from "@/bindings";

/** Live plan + weekly usage; updates on the backend's `plan-changed` events. */
export const usePlan = () => {
  const [status, setStatus] = useState<PlanStatus | null>(null);

  const reload = useCallback(async () => {
    try {
      setStatus(await commands.getPlanStatus());
    } catch (e) {
      console.error("Failed to load plan status:", e);
    }
  }, []);

  useEffect(() => {
    reload();
    const unlisten = Promise.all([
      listen<PlanStatus>("plan-changed", (e) => setStatus(e.payload)),
      listen<PlanStatus>("plan-limit-reached", (e) => setStatus(e.payload)),
    ]);
    return () => {
      unlisten.then((fns) => fns.forEach((fn) => fn()));
    };
  }, [reload]);

  return { status, setStatus, reload };
};

/**
 * Opens the pricing page for an upgrade. Signed in, checkout is prefilled with
 * the account's email, and the app checks for the purchase whenever its window
 * regains focus for the next hour.
 */
export const openUpgrade = async () => openUrl(await commands.upgradeUrl());

export const isPaid = (status: PlanStatus | null) =>
  status !== null && status.plan !== "free";

/** Days left on a trial (rounded up), or null when not on a trial. */
export const trialDaysLeft = (status: PlanStatus | null) => {
  if (status?.plan !== "trial" || !status.license_expires_at) return null;
  const secs = status.license_expires_at - Date.now() / 1000;
  return Math.max(0, Math.ceil(secs / 86400));
};

/**
 * Free's weekly hosted-polish allowance, from the server. Only fetched on
 * Free (Pro and the trial are unlimited), and refreshed after each dictation.
 */
export const usePolishUsage = (status: PlanStatus | null) => {
  const [usage, setUsage] = useState<PolishUsage | null>(null);
  const free = status !== null && !isPaid(status);

  const reload = useCallback(async () => {
    const result = await commands.getPolishUsage();
    if (result.status === "ok") setUsage(result.data);
  }, []);

  useEffect(() => {
    if (!free) return setUsage(null);
    reload();
    const unlisten = events.historyUpdatePayload.listen((e) => {
      if (e.payload.action === "added") reload();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [free, reload]);

  return usage;
};
