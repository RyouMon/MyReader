import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import {
  mergeReadingProgressRow,
  readingProgressRowsToMap,
} from "@my-reader/tools/reading-progress"
import { useEffect } from "react"
import type { ReadingProgressByBook } from "@/lib/readingProgress"
import { api } from "@/lib/tauri-api"
import { queryClient as defaultQueryClient } from "./queryClient"

export type ReadingProgressChangedEvent = {
  libraryId: string
  bookId: number
  format: string
  locator: unknown
  displayProgression: number | null
}

export const readingProgressKeys = {
  all: ["readingProgress"] as const,
  list: (libraryId: string | null | undefined) =>
    [...readingProgressKeys.all, libraryId ?? ""] as const,
}

export function applyReadingProgressEvent(
  event: ReadingProgressChangedEvent,
  client: QueryClient = defaultQueryClient,
) {
  client.setQueryData<ReadingProgressByBook>(
    readingProgressKeys.list(event.libraryId),
    (current) => {
      const base = current ?? {}
      const merged = mergeReadingProgressRow(base, event)
      return merged === base ? current : merged
    },
  )
}

export function useReadingProgressEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let active = true
    let unlisten: UnlistenFn | undefined

    listen<ReadingProgressChangedEvent>("reading_progress", (event) => {
      applyReadingProgressEvent(event.payload, queryClient)
    }).then((nextUnlisten) => {
      if (active) {
        unlisten = nextUnlisten
      } else {
        nextUnlisten()
      }
    })

    return () => {
      active = false
      unlisten?.()
    }
  }, [queryClient])
}

export function useBookReadingProgress(libraryId: string | null | undefined) {
  return useQuery<ReadingProgressByBook, Error>({
    queryKey: readingProgressKeys.list(libraryId),
    queryFn: async () => {
      if (!libraryId) return {}
      const rows = await api.listReadingProgress(libraryId)
      return readingProgressRowsToMap(rows)
    },
    enabled: Boolean(libraryId),
    staleTime: 1000 * 60 * 5,
  })
}
