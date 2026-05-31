import { useEffect, useRef } from "react";
import { usePathname } from "expo-router";

import { SyncConfigError } from "@/src/errors";
import { getBooksForLibrary } from "@/src/features/library/hooks/useLibraryQuery";
import { getValidAccessToken } from "@/src/services/auth/onedrive";
import { setCachedAuth } from "@/src/services/remote/auth-cache";
import { useAppStore } from "@/src/store/app-store";
import { cancelIdleWork, scheduleIdleWork } from "@/src/utils/common";
import {
  LIBRARY_SYNC_INTERVAL_MS,
  READING_SYNC_INTERVAL_MS,
  runSyncLibraries,
  type ScheduledSyncTarget,
  type SyncLibrariesDeps,
} from "@/src/domain/sync";
import { applySyncRunReports } from "@/src/hooks/apply-sync-report";
import { InAppNotification } from "@/src/domain/notifications/in-app-notification";
import i18n from "@/src/i18n";
import { Notifier } from "react-native-notifier";

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

function getSyncDeps(): SyncLibrariesDeps {
  const state = useAppStore.getState();
  return {
    libraries: state.libraries,
    dataSources: state.dataSources,
    syncOnStartup: state.settings.syncOnStartup,
    enableAutoSync: state.settings.enableAutoSync,
    activeLibraryId: state.activeLibraryId,
    getBooksForLibrary,
  };
}

function handleSyncError(err: unknown, label: string): void {
  if (err instanceof SyncConfigError) {
    notifySyncConfigError(err.message);
    return;
  }
  console.warn(`[SyncRuntime] ${label} sync failed`, err);
}

function isReaderRoute(pathname: string): boolean {
  return pathname.startsWith("/reader");
}

function isLibraryBrowsingRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/library") ||
    pathname.startsWith("/library-book") ||
    pathname.includes("/(tabs)/library")
  );
}

/** Passive sync: startup + scheduled myreader ticks. */
export function SyncRuntime(): null {
  const storeReady = useAppStore((state) => state.storeReady);
  const enableAutoSync = useAppStore((state) => state.settings.enableAutoSync);
  const pathname = usePathname();
  const hasRunStartup = useRef(false);

  useEffect(() => {
    if (!storeReady || hasRunStartup.current) return;
    hasRunStartup.current = true;

    const state = useAppStore.getState();
    for (const ds of state.dataSources) {
      if (ds.type === "onedrive") {
        void getValidAccessToken(ds.id)
          .then(({ accessToken, expiresAt }) => {
            setCachedAuth(ds.id, { Authorization: `Bearer ${accessToken}` }, expiresAt);
          })
          .catch(() => {});
      }
    }

    const startupHandle = scheduleIdleWork(() => {
      void runSyncLibraries("startup", getSyncDeps())
        .then((report) => {
          applySyncRunReports(report.results, { trigger: "startup" });
        })
        .catch((err) => handleSyncError(err, "startup"));
    });

    return () => cancelIdleWork(startupHandle);
  }, [storeReady]);

  useEffect(() => {
    if (!storeReady || !enableAutoSync) return;

    let scheduledTarget: ScheduledSyncTarget | null = null;
    if (isReaderRoute(pathname)) {
      scheduledTarget = "reading";
    } else if (isLibraryBrowsingRoute(pathname)) {
      scheduledTarget = "library";
    }

    if (!scheduledTarget) return;

    const intervalMs =
      scheduledTarget === "reading" ? READING_SYNC_INTERVAL_MS : LIBRARY_SYNC_INTERVAL_MS;

    const tick = () => {
      void runSyncLibraries("scheduled", getSyncDeps(), scheduledTarget!)
        .then((report) => {
          applySyncRunReports(report.results, { trigger: "scheduled" });
        })
        .catch((err) => handleSyncError(err, scheduledTarget!));
    };

    const handle = setInterval(tick, intervalMs);
    return () => clearInterval(handle);
  }, [storeReady, enableAutoSync, pathname]);

  return null;
}
