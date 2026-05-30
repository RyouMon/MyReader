import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { Notifier } from "react-native-notifier";

import { InAppNotification } from "../domain/notifications/in-app-notification";
import { SyncConfigError } from "../errors";
import { useAppStore } from "../store/app-store";

import i18n from "@/src/i18n";
import { queryClient } from "@/src/services/query/query-client";
import { refreshMetadataIfStale } from "../domain/library/metadata";
import { runSync, type SyncDeps } from "../domain/sync/scheduler";
import { getBooksForLibrary, libraryQueryKeys } from "../features/library/hooks/useLibraryQuery";
import { getValidAccessToken } from "../services/auth/onedrive";
import { setCachedAuth } from "../services/remote/auth-cache";
import { cancelIdleWork, scheduleIdleWork } from "../utils/common";

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

function getSyncDeps(): SyncDeps {
  const state = useAppStore.getState();
  return {
    libraries: state.libraries,
    dataSources: state.dataSources,
    syncEnabled: state.settings.syncEnabled,
    getBooksForLibrary,
  };
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

    const startupSyncHandle = scheduleIdleWork(() => {
      void runSync("startup", getSyncDeps()).catch((err) => handleSyncError(err, "startup"));
    });

    if (state.settings.syncEnabled) {
      for (const library of state.libraries) {
        if (library.dataSourceId && library.sourceType !== "local") {
          void refreshMetadataIfStale(library, state.dataSources)
            .then((result) => {
              if (result.changed) {
                queryClient.invalidateQueries({ queryKey: libraryQueryKeys.books(library.id) });
              }
            })
            .catch(() => {});
        }
      }
    }

    return () => cancelIdleWork(startupSyncHandle);
  }, [storeReady]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      const prev = lastStateRef.current;
      lastStateRef.current = next;
      if (prev !== "active" && next === "active" && hasRunStartup.current) {
        void runSync("foreground", getSyncDeps()).catch((err) => handleSyncError(err, "foreground"));
      }
    });
    return () => subscription.remove();
  }, []);
}
