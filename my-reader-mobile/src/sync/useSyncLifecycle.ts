import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { Notifier } from "react-native-notifier";

import { useAppStore } from "../store/app-store";
import { SyncConfigError } from "../errors";
import { InAppNotification } from "../notifications/in-app-notification";

import { runSync } from "./scheduler";
import i18n from "@/src/i18n";

function notifySyncConfigError(message: string): void {
  Notifier.showNotification({
    title: i18n.t("sync.configError"),
    description: message,
    duration: 6000,
    hideOnPress: true,
    Component: InAppNotification,
    componentProps: { kind: "error" },
  });
}

function handleSyncError(err: unknown, trigger: string): void {
  if (err instanceof SyncConfigError) {
    notifySyncConfigError(err.message);
    return;
  }
  console.warn(`[MyReader] ${trigger} sync failed`, err);
}

/**
 * Wire the foreground-triggered sync scheduler to app lifecycle events.
 *
 * - Fires `startup` once after store hydration completes.
 * - Fires `foreground` whenever the OS transitions active again from the
 *   background / inactive state.
 * - Respects `settings.syncEnabled`; the scheduler itself short-circuits
 *   disabled auto runs, this hook just avoids unnecessary work.
 */
export function useSyncLifecycle(): void {
  const storeReady = useAppStore((state) => state.storeReady);
  const hasRunStartup = useRef(false);
  const lastStateRef = useRef<AppStateStatus>(AppState.currentState ?? "active");

  useEffect(() => {
    if (!storeReady || hasRunStartup.current) return;
    hasRunStartup.current = true;
    void runSync("startup").catch((err) => handleSyncError(err, "startup"));
  }, [storeReady]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      const prev = lastStateRef.current;
      lastStateRef.current = next;
      if (prev !== "active" && next === "active" && hasRunStartup.current) {
        void runSync("foreground").catch((err) => handleSyncError(err, "foreground"));
      }
    });
    return () => subscription.remove();
  }, []);
}
