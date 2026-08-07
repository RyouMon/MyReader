import * as Network from "expo-network"
import { usePathname } from "expo-router"
import { useEffect, useRef } from "react"
import { AppState } from "react-native"
import { Notifier } from "react-native-notifier"
import { InAppNotification } from "@/src/domain/notifications/in-app-notification"
import { runSyncLibraries, type SyncLibrariesDeps } from "@/src/domain/sync"
import { applySyncRunReports } from "@/src/domain/sync/hooks/apply-sync-report"
import {
  createSidecarSyncRuntime,
  type SidecarSyncRuntime,
} from "@/src/domain/sync/sidecar-sync-runtime"
import { isRemoteSourceType } from "@/src/domain/types"
import { DataIntegrityError, SyncConfigError } from "@/src/errors"
import i18n from "@/src/i18n"
import { getValidAccessToken } from "@/src/services/auth/onedrive"
import { subscribeLocalSidecarWork } from "@/src/services/core/sync-events"
import { setCachedAuth } from "@/src/services/remote/auth-cache"
import { useAppStore } from "@/src/store/app-store"
import { observeLibrarySync } from "@/src/store/sync-status-observer"
import { cancelIdleWork, scheduleIdleWork } from "@/src/utils/common"

function notifySyncError(title: string, message: string): void {
  Notifier.showNotification({
    title,
    description: message,
    duration: 6000,
    hideOnPress: true,
    Component: InAppNotification,
    componentProps: { kind: "error" },
  })
}

function getSyncDeps(): SyncLibrariesDeps {
  const state = useAppStore.getState()
  return {
    libraries: state.libraries,
    dataSources: state.dataSources,
    syncOnStartup: state.settings.syncOnStartup,
    enableAutoSync: state.settings.enableAutoSync,
    activeLibraryId: state.activeLibraryId,
  }
}

function handleSyncError(err: unknown, label: string): void {
  if (err instanceof SyncConfigError) {
    notifySyncError(i18n.t("sync.configError"), err.message)
    return
  }
  if (err instanceof DataIntegrityError) {
    notifySyncError(i18n.t("sync.dataIntegrityError"), err.message)
    return
  }
  console.warn(`[SyncRuntime] ${label} sync failed`, err)
}

function isReaderRoute(pathname: string): boolean {
  return pathname.startsWith("/reader")
}

/** Passive sync: startup plus event- and lifecycle-driven sidecar scheduling. */
export function SyncRuntime(): null {
  const storeReady = useAppStore((state) => state.storeReady)
  const enableAutoSync = useAppStore((state) => state.settings.enableAutoSync)
  const activeLibraryId = useAppStore((state) => state.activeLibraryId)
  const pathname = usePathname()
  const hasRunStartup = useRef(false)
  const sidecarRuntime = useRef<SidecarSyncRuntime | null>(null)
  const previousPathname = useRef(pathname)
  const previousActiveLibraryId = useRef(activeLibraryId)

  useEffect(() => {
    if (!storeReady || hasRunStartup.current) return
    hasRunStartup.current = true

    const state = useAppStore.getState()
    for (const ds of state.dataSources) {
      if (ds.type === "onedrive") {
        void getValidAccessToken(ds.id)
          .then(({ accessToken, expiresAt }) => {
            setCachedAuth(
              ds.id,
              { Authorization: `Bearer ${accessToken}` },
              expiresAt,
            )
          })
          .catch(() => {})
      }
    }

    const startupHandle = scheduleIdleWork(() => {
      void runSyncLibraries(
        "startup",
        getSyncDeps(),
        undefined,
        observeLibrarySync,
      )
        .then(async (report) => {
          await applySyncRunReports(report.results, { trigger: "startup" })
        })
        .catch((err) => handleSyncError(err, "startup"))
    })

    return () => cancelIdleWork(startupHandle)
  }, [storeReady])

  useEffect(() => {
    if (!storeReady) return

    const runtime = createSidecarSyncRuntime(
      () => {
        const state = useAppStore.getState()
        return {
          libraries: state.libraries,
          dataSources: state.dataSources,
          enableAutoSync: state.settings.enableAutoSync,
          activeLibraryId: state.activeLibraryId,
        }
      },
      (error) => handleSyncError(error, "automatic"),
      observeLibrarySync,
    )
    sidecarRuntime.current = runtime
    const unsubscribeWork = subscribeLocalSidecarWork((work) => {
      if (work.libraryId !== useAppStore.getState().activeLibraryId) return
      runtime.request(
        work.libraryId,
        "push_only",
        work.required ? "content_ready" : "local_change",
        "debounced",
      )
    })
    void runtime.recover().catch((error) => handleSyncError(error, "recovery"))
    let stopSafetySweep: (() => void) | null = null
    const startSafetySweep = () => {
      if (stopSafetySweep) return
      stopSafetySweep = runtime.startSafetySweep(() => {
        const current = useAppStore.getState()
        return current.activeLibraryId
      })
    }
    const stopSafety = () => {
      stopSafetySweep?.()
      stopSafetySweep = null
    }
    const requestActivePull = (
      reason: "app_foregrounded" | "network_reconnected" | "library_activated",
    ) => {
      const current = useAppStore.getState()
      if (!current.settings.enableAutoSync) return
      const activeLibrary = current.libraries.find(
        (library) => library.id === current.activeLibraryId,
      )
      if (!activeLibrary) return
      void runtime
        .requestContextualPull(activeLibrary.id, reason)
        .catch((error) => handleSyncError(error, reason))
    }
    if (AppState.currentState === "active") {
      if (enableAutoSync) startSafetySweep()
      if (enableAutoSync && !useAppStore.getState().settings.syncOnStartup) {
        requestActivePull("app_foregrounded")
      }
    }
    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState === "active") {
          if (useAppStore.getState().settings.enableAutoSync) startSafetySweep()
          requestActivePull("app_foregrounded")
          return
        }
        stopSafety()
        const activeLibraryId = useAppStore.getState().activeLibraryId
        if (activeLibraryId) {
          runtime.flush(activeLibraryId, "app_backgrounding")
        }
      },
    )
    let lastNetworkReachable: boolean | null = null
    const handleNetworkState = (networkState: Network.NetworkState) => {
      const reachable =
        networkState.isInternetReachable ?? networkState.isConnected ?? true
      const current = useAppStore.getState()
      for (const library of current.libraries) {
        if (isRemoteSourceType(library.sourceType)) {
          runtime.setLibraryOnline(library.id, reachable)
          current.setLibrarySyncOnline(library.id, reachable)
        }
      }
      if (reachable && lastNetworkReachable === false) {
        requestActivePull("network_reconnected")
      }
      lastNetworkReachable = reachable
    }
    void Network.getNetworkStateAsync()
      .then(handleNetworkState)
      .catch((error) => handleSyncError(error, "network-state"))
    const networkSubscription =
      Network.addNetworkStateListener(handleNetworkState)

    return () => {
      stopSafety()
      networkSubscription.remove()
      appStateSubscription.remove()
      unsubscribeWork()
      runtime.dispose()
      if (sidecarRuntime.current === runtime) {
        sidecarRuntime.current = null
      }
    }
  }, [storeReady, enableAutoSync])

  useEffect(() => {
    const previous = previousPathname.current
    previousPathname.current = pathname
    if (!isReaderRoute(previous) || isReaderRoute(pathname)) return
    const activeLibraryId = useAppStore.getState().activeLibraryId
    if (activeLibraryId) {
      sidecarRuntime.current?.flush(activeLibraryId, "reader_closed")
    }
  }, [pathname])

  useEffect(() => {
    const previous = previousActiveLibraryId.current
    previousActiveLibraryId.current = activeLibraryId
    if (
      !storeReady ||
      !enableAutoSync ||
      !activeLibraryId ||
      previous === activeLibraryId
    ) {
      return
    }
    const state = useAppStore.getState()
    const library = state.libraries.find(
      (candidate) => candidate.id === activeLibraryId,
    )
    const runtime = sidecarRuntime.current
    if (!library || !runtime) return
    void runtime
      .requestContextualPull(library.id, "library_activated")
      .catch((error) => handleSyncError(error, "library_activated"))
  }, [storeReady, enableAutoSync, activeLibraryId])

  return null
}
