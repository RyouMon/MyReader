import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { useEffect } from "react"
import { toast } from "sonner"
import i18n from "@/i18n"
import { localOnlyBookKeys } from "./queries/useLocalOnlyBooksQuery"
import { queryClient as defaultQueryClient } from "./queries/queryClient"
import { bookFileStateKeys } from "./queries/useBookFileState"
import { pendingBookUploadKeys } from "./queries/usePendingBookUploadsQuery"

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

function updatePendingBookUpload(
  libraryId: string,
  bookUuid: string,
  pending: boolean,
  client: QueryClient = defaultQueryClient,
) {
  client.setQueryData<string[]>(
    pendingBookUploadKeys.list(libraryId),
    (current = []) => {
      const next = current.filter((uuid) => uuid !== bookUuid)
      return pending ? [...next, bookUuid] : next
    },
  )
}

export function applyBookUploadProgressEvent(
  event: BookUploadProgressEvent,
  client: QueryClient = defaultQueryClient,
) {
  if (event.status === "uploading" && event.bookUuid) {
    updatePendingBookUpload(event.libraryId, event.bookUuid, true, client)
    client.setQueryData(localOnlyBookKeys.status(event.libraryId), true)
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
    updatePendingBookUpload(
      event.libraryId,
      event.bookUuid,
      event.status === "error",
      client,
    )
  } else {
    client.removeQueries({
      queryKey: [...bookUploadProgressKeys.all, event.libraryId],
    })
    if (event.status === "done") {
      client.setQueryData(pendingBookUploadKeys.list(event.libraryId), [])
    }
  }
  void client.invalidateQueries({
    queryKey: pendingBookUploadKeys.list(event.libraryId),
  })
  void client.invalidateQueries({
    queryKey: localOnlyBookKeys.status(event.libraryId),
  })
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
  updatePendingBookUpload(libraryId, bookUuid, true, client)
  client.setQueryData(localOnlyBookKeys.status(libraryId), true)
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
