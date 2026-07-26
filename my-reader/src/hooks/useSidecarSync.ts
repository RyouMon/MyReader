import { type QueryClient, useQueryClient } from "@tanstack/react-query"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { useEffect } from "react"
import { invalidateFavoriteBookQueries } from "@/hooks/queries/useFavoriteBooksQuery"
import { readingProgressKeys } from "@/hooks/queries/useReadingProgressQuery"
import { api } from "@/lib/tauri-api"

export const SIDECAR_SYNC_COMPLETED_EVENT =
  "myreader:sidecar-sync-completed" as const

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
  ])
  window.dispatchEvent(
    new CustomEvent(SIDECAR_SYNC_COMPLETED_EVENT, { detail: event }),
  )
}

export function useSidecarSync() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let active = true
    let unlisten: UnlistenFn | undefined
    const handleOnline = () => {
      void api.notifySidecarNetworkReconnected()
    }

    window.addEventListener("online", handleOnline)
    listen<SidecarSyncCompletedEvent>("sidecar_sync_completed", (event) => {
      void applySidecarSyncCompleted(event.payload, queryClient)
    }).then((nextUnlisten) => {
      if (active) {
        unlisten = nextUnlisten
      } else {
        nextUnlisten()
      }
    })

    return () => {
      active = false
      window.removeEventListener("online", handleOnline)
      unlisten?.()
    }
  }, [queryClient])
}
