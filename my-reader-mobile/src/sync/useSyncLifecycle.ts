import { useEffect, useRef } from "react";
import { AppState, Appearance, type AppStateStatus } from "react-native";
import { Notifier } from "react-native-notifier";

import { useAppStore } from "../store/app-store";
import { getThemePalette } from "../design/tokens";
import { SyncConfigError } from "../errors";

import { runSync } from "./scheduler";

function notifySyncConfigError(message: string): void {
  const themeMode = useAppStore.getState().settings.themeMode;
  const scheme = (themeMode === "system" ? Appearance.getColorScheme() : themeMode) ?? "light";
  const palette = getThemePalette(scheme);

  Notifier.showNotification({
    title: "同步配置有误",
    description: message,
    duration: 6000,
    hideOnPress: true,
    componentProps: {
      containerStyle: {
        backgroundColor: palette.surface,
        borderColor: palette.border,
        borderWidth: 1,
        borderLeftColor: palette.error,
        borderLeftWidth: 3,
      },
      titleStyle: { fontWeight: "700", color: palette.text },
      descriptionStyle: { opacity: 0.9, color: palette.textMuted },
    },
  });
}

function handleSyncError(err: unknown, trigger: string): void {
  if (err instanceof SyncConfigError) {
    notifySyncConfigError(err.message);
  } else {
    console.warn(`[MyReader] ${trigger} sync failed`, err);
  }
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
  const hydrated = useAppStore((state) => state.hydrated);
  const hasRunStartup = useRef(false);
  const lastStateRef = useRef<AppStateStatus>(AppState.currentState ?? "active");

  useEffect(() => {
    if (!hydrated || hasRunStartup.current) return;
    hasRunStartup.current = true;
    void runSync("startup").catch((err) => handleSyncError(err, "startup"));
  }, [hydrated]);

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
