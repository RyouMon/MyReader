import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/tauri-api"
import {
  SIDECAR_SYNC_COMPLETED_EVENT,
  type SidecarSyncCompletedEvent,
} from "@/hooks/useSidecarSync"

export function useCatalogNavigation(libraryId: string | null) {
  const client = useQueryClient()
  useEffect(() => {
    const invalidate = (event: Event) => {
      if (
        (event as CustomEvent<SidecarSyncCompletedEvent>).detail.libraryId !==
        libraryId
      )
        return
      void client.invalidateQueries({
        queryKey: ["catalogNavigation", libraryId],
      })
    }
    window.addEventListener(SIDECAR_SYNC_COMPLETED_EVENT, invalidate)
    return () =>
      window.removeEventListener(SIDECAR_SYNC_COMPLETED_EVENT, invalidate)
  }, [client, libraryId])
  return useQuery({
    queryKey: ["catalogNavigation", libraryId],
    queryFn: () => api.getCatalogNavigation(libraryId!),
    enabled: Boolean(libraryId),
  })
}
