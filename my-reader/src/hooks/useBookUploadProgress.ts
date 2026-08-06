import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { useEffect } from "react"
import { toast } from "sonner"
import i18n from "@/i18n"
import { queryClient as defaultQueryClient } from "./queries/queryClient"
import { bookFileStateKeys } from "./queries/useBookFileState"

export type BookUploadProgressEvent = {
  libraryId: string
  bookUuid?: string
  status: "uploading" | "done" | "error"
  completed: number
  total: number
  error?: string
}

type BookUploadProgressSnapshot = {
  progress: number | null
}

export const bookUploadProgressKeys = {
  all: ["bookUploadProgress"] as const,
  detail: (libraryId: string, bookUuid: string) =>
    [...bookUploadProgressKeys.all, libraryId, bookUuid] as const,
}

export function applyBookUploadProgressEvent(
  event: BookUploadProgressEvent,
  client: QueryClient = defaultQueryClient,
) {
  if (event.status === "uploading" && event.bookUuid) {
    const progress =
      event.completed > 0 && event.total > 0
        ? Math.max(0, Math.min(100, (event.completed / event.total) * 100))
        : null
    client.setQueryData<BookUploadProgressSnapshot>(
      bookUploadProgressKeys.detail(event.libraryId, event.bookUuid),
      { progress },
    )
    return
  }

  if (event.bookUuid) {
    client.removeQueries({
      queryKey: bookUploadProgressKeys.detail(event.libraryId, event.bookUuid),
      exact: true,
    })
  } else {
    client.removeQueries({
      queryKey: [...bookUploadProgressKeys.all, event.libraryId],
    })
  }
  void client.invalidateQueries({
    queryKey: bookFileStateKeys.library(event.libraryId),
  })
  if (event.status === "error") {
    toast.error(i18n.t("bookUpload.failed"), {
      description: event.error,
    })
  }
}

export function setBookUploadStarting(
  libraryId: string,
  bookUuid: string,
  client: QueryClient = defaultQueryClient,
) {
  client.setQueryData<BookUploadProgressSnapshot>(
    bookUploadProgressKeys.detail(libraryId, bookUuid),
    { progress: null },
  )
}

export function clearBookUploadProgress(
  libraryId: string,
  bookUuid: string,
  client: QueryClient = defaultQueryClient,
) {
  client.removeQueries({
    queryKey: bookUploadProgressKeys.detail(libraryId, bookUuid),
    exact: true,
  })
}

export function useBookUploadProgressEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let active = true
    let unlisten: UnlistenFn | undefined

    listen<BookUploadProgressEvent>("book_upload_progress", (event) => {
      applyBookUploadProgressEvent(event.payload, queryClient)
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

export function useBookUploadProgress(
  libraryId: string | null | undefined,
  bookUuid: string | null | undefined,
): number | null | undefined {
  const queryClient = useQueryClient()
  const enabled = Boolean(libraryId && bookUuid)
  const queryKey = bookUploadProgressKeys.detail(
    libraryId ?? "",
    bookUuid ?? "",
  )
  const { data } = useQuery<BookUploadProgressSnapshot | null>({
    queryKey,
    queryFn: () =>
      queryClient.getQueryData<BookUploadProgressSnapshot>(queryKey) ?? null,
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60 * 1000,
  })
  return data?.progress
}
