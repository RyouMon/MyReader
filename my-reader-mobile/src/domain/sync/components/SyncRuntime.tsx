import { useEffect, useRef } from "react"
import { usePathname } from "expo-router"
import { AppState } from "react-native"

import { InAppNotification } from "@/src/domain/notifications/in-app-notification"
import {
  LIBRARY_SYNC_INTERVAL_MS,
  runSyncLibraries,
  type SidecarSyncScheduler,
  type SyncLibrariesDeps,
} from "@/src/domain/sync"
import {
  createAutomaticSidecarSyncScheduler,
  recoverPendingSidecarWork,
} from "@/src/domain/sync/automatic-sidecar-sync"
import { applySyncRunReports } from "@/src/domain/sync/hooks/apply-sync-report"
import { subscribeLibrarySidecarWork } from "@/src/domain/sync/sidecar-work"
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

function isLibraryBrowsingRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/library") ||
    pathname.startsWith("/library-book") ||
    pathname.includes("/(tabs)/library")
  )
}

/** Passive sync: startup + scheduled myreader ticks. */
export function SyncRuntime(): null {
  const storeReady = useAppStore((state) => state.storeReady)
  const enableAutoSync = useAppStore((state) => state.settings.enableAutoSync)
  const pathname = usePathname()
  const hasRunStartup = useRef(false)
  const sidecarScheduler = useRef<SidecarSyncScheduler | null>(null)
  const previousPathname = useRef(pathname)

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
    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState === "active") return
        const activeLibraryId = useAppStore.getState().activeLibraryId
        if (activeLibraryId) {
          scheduler.flushPending(activeLibraryId, "app_backgrounding")
        }
      },
    )

    return () => {
      appStateSubscription.remove()
      unsubscribeWork()
      scheduler.dispose()
      if (sidecarScheduler.current === scheduler) {
        sidecarScheduler.current = null
      }
    }
  }, [storeReady, enableAutoSync])

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
    if (!storeReady || !enableAutoSync || !isLibraryBrowsingRoute(pathname)) {
      return
    }

    const tick = () => {
      void runSyncLibraries("scheduled", getSyncDeps(), "library")
        .then((report) => {
          applySyncRunReports(report.results, { trigger: "scheduled" })
        })
        .catch((err) => handleSyncError(err, "library"))
    }

    const handle = setInterval(tick, LIBRARY_SYNC_INTERVAL_MS)
    return () => clearInterval(handle)
  }, [storeReady, enableAutoSync, pathname])

  return null
}
