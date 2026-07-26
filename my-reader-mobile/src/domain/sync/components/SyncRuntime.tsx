import { useEffect, useRef } from "react"
import { usePathname } from "expo-router"
import * as Network from "expo-network"
import { AppState } from "react-native"

import { InAppNotification } from "@/src/domain/notifications/in-app-notification"
import {
  runSyncLibraries,
  type SidecarSyncScheduler,
  type SyncLibrariesDeps,
} from "@/src/domain/sync"
import {
  createAutomaticSidecarSyncScheduler,
  recoverPendingSidecarWork,
  requestContextualSidecarPull,
  startSidecarPullSafetySweep,
} from "@/src/domain/sync/automatic-sidecar-sync"
import { applySyncRunReports } from "@/src/domain/sync/hooks/apply-sync-report"
import { subscribeLibrarySidecarWork } from "@/src/domain/sync/sidecar-work"
import { isRemoteSourceType } from "@/src/domain/types"
import { SyncConfigError } from "@/src/errors"
import i18n from "@/src/i18n"
import { getValidAccessToken } from "@/src/services/auth/onedrive"
import { setCachedAuth } from "@/src/services/remote/auth-cache"
import { useAppStore } from "@/src/store/app-store"
import { cancelIdleWork, scheduleIdleWork } from "@/src/utils/common"
import { Notifier } from "react-native-notifier"

function notifySyncConfigError(message: string): void {
  Notifier.showNotification({
    title: i18n.t("sync.configError"),
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
    notifySyncConfigError(err.message)
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
  const dataSources = useAppStore((state) => state.dataSources)
  const pathname = usePathname()
  const hasRunStartup = useRef(false)
  const sidecarScheduler = useRef<SidecarSyncScheduler | null>(null)
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
      void runSyncLibraries("startup", getSyncDeps())
        .then((report) => {
          applySyncRunReports(report.results, { trigger: "startup" })
        })
        .catch((err) => handleSyncError(err, "startup"))
    })

    return () => cancelIdleWork(startupHandle)
  }, [storeReady])

  useEffect(() => {
    if (!storeReady || !enableAutoSync) return

    const scheduler = createAutomaticSidecarSyncScheduler(
      () => {
        const state = useAppStore.getState()
        return {
          libraries: state.libraries,
          dataSources: state.dataSources,
          enableAutoSync: state.settings.enableAutoSync,
        }
      },
      (error) => handleSyncError(error, "automatic"),
    )
    sidecarScheduler.current = scheduler
    const unsubscribeWork = subscribeLibrarySidecarWork((work) => {
      scheduler.request({
        libraryId: work.libraryId,
        mode: "push_only",
        reason: work.reason,
        timing: "debounced",
      })
    })
    const state = useAppStore.getState()
    void recoverPendingSidecarWork(scheduler, state.libraries).catch((error) =>
      handleSyncError(error, "recovery"),
    )
    let stopSafetySweep: (() => void) | null = null
    const startSafetySweep = () => {
      if (stopSafetySweep) return
      stopSafetySweep = startSidecarPullSafetySweep({
        scheduler,
        getLibraries: () => useAppStore.getState().libraries,
        onError: (error) => handleSyncError(error, "recovery_sweep"),
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
      const activeLibrary = current.libraries.find(
        (library) => library.id === current.activeLibraryId,
      )
      if (!activeLibrary) return
      void requestContextualSidecarPull(scheduler, activeLibrary, reason).catch(
        (error) => handleSyncError(error, reason),
      )
    }
    if (AppState.currentState === "active") {
      startSafetySweep()
      if (!state.settings.syncOnStartup) {
        requestActivePull("app_foregrounded")
      }
    }
    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState === "active") {
          startSafetySweep()
          requestActivePull("app_foregrounded")
          return
        }
        stopSafety()
        const activeLibraryId = useAppStore.getState().activeLibraryId
        if (activeLibraryId) {
          scheduler.flushPending(activeLibraryId, "app_backgrounding")
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
          scheduler.setLibraryOnline(library.id, reachable)
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
      scheduler.dispose()
      if (sidecarScheduler.current === scheduler) {
        sidecarScheduler.current = null
      }
    }
  }, [storeReady, enableAutoSync, dataSources])

  useEffect(() => {
    const previous = previousPathname.current
    previousPathname.current = pathname
    if (!isReaderRoute(previous) || isReaderRoute(pathname)) return
    const activeLibraryId = useAppStore.getState().activeLibraryId
    if (activeLibraryId) {
      sidecarScheduler.current?.flushPending(activeLibraryId, "reader_closed")
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
    const scheduler = sidecarScheduler.current
    if (!library || !scheduler) return
    void requestContextualSidecarPull(
      scheduler,
      library,
      "library_activated",
    ).catch((error) => handleSyncError(error, "library_activated"))
  }, [storeReady, enableAutoSync, activeLibraryId])

  return null
}
