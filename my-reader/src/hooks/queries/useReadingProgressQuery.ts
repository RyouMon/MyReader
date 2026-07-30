import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { readingProgressToPercent } from "@my-reader/tools/reading-progress"
import { useEffect } from "react"
import {
  type ReadingProgressByBook,
  readingProgressRowsToMap,
} from "@/lib/readingProgress"
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

function normalizeFormat(format: string) {
  return format.toUpperCase()
}

export function applyReadingProgressEvent(
  event: ReadingProgressChangedEvent,
  client: QueryClient = defaultQueryClient,
) {
  const percent = readingProgressToPercent(
    event.displayProgression,
    event.locator,
  )
  if (percent === undefined) return

  const bookId = String(event.bookId)
  const format = normalizeFormat(event.format)
  client.setQueryData<ReadingProgressByBook>(
    readingProgressKeys.list(event.libraryId),
    (current) => ({
      ...(current ?? {}),
      [bookId]: {
        ...(current?.[bookId] ?? {}),
        [format]: percent,
      },
    }),
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
