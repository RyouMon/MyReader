import { type QueryClient, useQueryClient } from "@tanstack/react-query"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { useEffect } from "react"
import { bookFileStateKeys } from "@/hooks/queries/useBookFileState"
import { invalidateFavoriteBookQueries } from "@/hooks/queries/useFavoriteBooksQuery"
import { readingProgressKeys } from "@/hooks/queries/useReadingProgressQuery"
import { api } from "@/lib/tauri-api"
import {
  type SyncStatusObservation,
  useSyncStatusStore,
} from "@/stores/syncStatusStore"

export const SIDECAR_SYNC_COMPLETED_EVENT =
  "myreader:sidecar-sync-completed" as const
export const SYNC_STATUS_OBSERVATION_EVENT = "sync_status_observation" as const

export type SidecarSyncCompletedEvent = {
  libraryId: string
  mode: "full"
  pushed: number
  pulled: number
}

export async function applySidecarSyncCompleted(
  event: SidecarSyncCompletedEvent,
  queryClient: QueryClient,
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: readingProgressKeys.list(event.libraryId),
    }),
    invalidateFavoriteBookQueries(queryClient, event.libraryId),
    queryClient.invalidateQueries({
      queryKey: bookFileStateKeys.library(event.libraryId),
    }),
  ])
  window.dispatchEvent(
    new CustomEvent(SIDECAR_SYNC_COMPLETED_EVENT, { detail: event }),
  )
}

export function applySyncStatusObservation(observation: SyncStatusObservation) {
  useSyncStatusStore.getState().observeLibrarySync(observation)
}

export function useSidecarSync() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let active = true
    const unlisteners: UnlistenFn[] = []
    const handleOnline = () => {
      useSyncStatusStore.getState().setNetworkOnline(true)
      void api.notifySidecarNetworkReconnected()
    }
    const handleOffline = () => {
      useSyncStatusStore.getState().setNetworkOnline(false)
    }
    const register = <T>(eventName: string, handler: (payload: T) => void) => {
      void listen<T>(eventName, (event) => handler(event.payload))
        .then((unlisten) => {
          if (active) {
            unlisteners.push(unlisten)
          } else {
            unlisten()
          }
        })
        .catch((error) => {
          console.error(`Failed to listen for ${eventName}.`, error)
        })
    }

    useSyncStatusStore.getState().setNetworkOnline(navigator.onLine)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    register<SidecarSyncCompletedEvent>("sidecar_sync_completed", (payload) => {
      void applySidecarSyncCompleted(payload, queryClient)
    })
    register<SyncStatusObservation>(
      SYNC_STATUS_OBSERVATION_EVENT,
      applySyncStatusObservation,
    )

    return () => {
      active = false
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      for (const unlisten of unlisteners) {
        unlisten()
      }
    }
  }, [queryClient])
}
