import * as Network from "expo-network"
import { useEffect, useRef } from "react"
import { AppState } from "react-native"

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import { isRemoteSourceType } from "@/src/domain/types"
import { openSyncContext } from "@/src/domain/sync/context"
import {
  applyBookUploadTaskProgress,
  clearBookUploadTaskProgress,
  getBookUploadState,
  subscribePendingBookUploads,
} from "@/src/domain/sync/book-upload-store"
import i18n from "@/src/i18n"
import { runPendingBookUploads } from "@/src/services/core/book-transfer"
import { announceLocalSidecarWork } from "@/src/services/core/sync-events"
import { invalidateFileStates } from "@/src/services/query/invalidate-table"
import { useAppStore } from "@/src/store/app-store"
import { describeError } from "@/src/utils/common"

/** Runs durable book uploads independently from sidecar/Automerge sync. */
export function BookUploadRuntime(): null {
  const storeReady = useAppStore((state) => state.storeReady)
  const running = useRef(new Set<string>())
  const rerun = useRef(new Set<string>())
  const disposed = useRef(false)

  useEffect(() => {
    if (!storeReady) return
    disposed.current = false

    const requestUpload = (libraryId: string) => {
      if (disposed.current) return
      if (running.current.has(libraryId)) {
        rerun.current.add(libraryId)
        return
      }
      running.current.add(libraryId)
      void (async () => {
        do {
          rerun.current.delete(libraryId)
          const state = useAppStore.getState()
          const library = state.libraries.find(
            (candidate) => candidate.id === libraryId,
          )
          if (!library || !isRemoteSourceType(library.sourceType)) return
          try {
            const context = await openSyncContext(library, state.dataSources)
            const completed = await runPendingBookUploads({
              library,
              libraryRootUri: context.libraryRootUri,
              storage: context.libraryStorage,
              onProgress: (progress) =>
                applyBookUploadTaskProgress(libraryId, progress),
            })
            await invalidateFileStates(libraryId)
            if (completed.length > 0) {
              announceLocalSidecarWork(libraryId, { required: true })
            }
          } catch (error) {
            const reason = describeError(error)
            console.warn("[book-transfer] background upload failed", {
              libraryId,
              error: reason,
            })
            if (!disposed.current) {
              showAlertWithStatusBarRestore(
                i18n.t("bookMenu.uploadFailed"),
                i18n.t("bookMenu.uploadFailedDetail", {
                  library: library.name,
                  reason,
                }),
              )
            }
            break
          } finally {
            const uploadState = getBookUploadState(libraryId)
            if (uploadState) {
              clearBookUploadTaskProgress(libraryId, uploadState.taskId)
            }
          }
        } while (!disposed.current && rerun.current.has(libraryId))
      })().finally(() => {
        running.current.delete(libraryId)
      })
    }

    const requestAllRemoteUploads = () => {
      const state = useAppStore.getState()
      for (const library of state.libraries) {
        if (isRemoteSourceType(library.sourceType)) requestUpload(library.id)
      }
    }
    const unsubscribeRequests = subscribePendingBookUploads(requestUpload)
    let knownRemoteLibraries = ""
    const requestNewRemoteLibraries = () => {
      const next = useAppStore
        .getState()
        .libraries.filter((library) => isRemoteSourceType(library.sourceType))
        .map((library) => library.id)
        .sort()
        .join("\n")
      if (next === knownRemoteLibraries) return
      knownRemoteLibraries = next
      requestAllRemoteUploads()
    }
    const unsubscribeStore = useAppStore.subscribe(requestNewRemoteLibraries)
    requestNewRemoteLibraries()

    let lastNetworkReachable: boolean | null = null
    const handleNetworkState = (networkState: Network.NetworkState) => {
      const reachable =
        networkState.isInternetReachable ?? networkState.isConnected ?? true
      if (reachable && lastNetworkReachable === false) {
        requestAllRemoteUploads()
      }
      lastNetworkReachable = reachable
    }
    void Network.getNetworkStateAsync()
      .then(handleNetworkState)
      .catch(() => {})
    const networkSubscription =
      Network.addNetworkStateListener(handleNetworkState)
    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState === "active") requestAllRemoteUploads()
      },
    )

    return () => {
      disposed.current = true
      unsubscribeRequests()
      unsubscribeStore()
      networkSubscription.remove()
      appStateSubscription.remove()
    }
  }, [storeReady])

  return null
}
