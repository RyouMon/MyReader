import { useEffect } from "react"
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { toast } from "sonner"
import i18n from "@/i18n"
import {
  type BookFileState,
  bookFileStateKeys,
} from "./queries/useBookFileState"
import { queryClient as defaultQueryClient } from "./queries/queryClient"

export type DownloadProgressEvent = {
  libraryId: string
  bookId: number
  format: string
  status:
    | "remote_only"
    | "starting"
    | "downloading"
    | "done"
    | "error"
    | "cancelled"
  bytesWritten: number
  totalBytes?: number
  error?: string
}

export type DownloadProgress = {
  status: DownloadProgressEvent["status"]
  bytesWritten: number
  totalBytes?: number
  error?: string
}

export const downloadProgressKeys = {
  all: ["downloadProgress"] as const,
  detail: (libraryId: string, bookId: number, format: string) =>
    [
      ...downloadProgressKeys.all,
      libraryId,
      bookId,
      format.toUpperCase(),
    ] as const,
}

function normalizeFormat(format: string) {
  return format.toUpperCase()
}

function notifyDownloadError(error?: string) {
  toast.error(i18n.t("bookDetail.downloadFailed"), {
    description: error,
  })
}

export function setDownloadProgressSnapshot(
  libraryId: string,
  bookId: number,
  format: string,
  progress: DownloadProgress,
  client: QueryClient = defaultQueryClient,
) {
  client.setQueryData(
    downloadProgressKeys.detail(libraryId, bookId, format),
    progress,
  )
}

function updateBookFileState(
  libraryId: string,
  bookId: number,
  format: string,
  localState: BookFileState["localState"],
  localSize?: number | null,
  client: QueryClient = defaultQueryClient,
) {
  const key = bookFileStateKeys.detail(
    libraryId,
    bookId,
    normalizeFormat(format),
  )
  const current = client.getQueryData<BookFileState>(key)
  if (!current) return
  client.setQueryData<BookFileState>(key, {
    ...current,
    localState,
    localSize: localSize === undefined ? current.localSize : localSize,
  })
}

export function applyDownloadProgressEvent(
  event: DownloadProgressEvent,
  client: QueryClient = defaultQueryClient,
) {
  const fmt = normalizeFormat(event.format)
  if (event.status === "remote_only") {
    clearDownloadProgress(event.libraryId, event.bookId, fmt, client)
    updateBookFileState(
      event.libraryId,
      event.bookId,
      fmt,
      "remote_only",
      null,
      client,
    )
    return
  }

  if (event.status === "done") {
    updateBookFileState(
      event.libraryId,
      event.bookId,
      fmt,
      "present",
      event.totalBytes ?? event.bytesWritten,
      client,
    )
  } else if (event.status === "starting" || event.status === "downloading") {
    updateBookFileState(
      event.libraryId,
      event.bookId,
      fmt,
      "downloading",
      undefined,
      client,
    )
  } else if (event.status === "cancelled" || event.status === "error") {
    updateBookFileState(
      event.libraryId,
      event.bookId,
      fmt,
      "remote_only",
      null,
      client,
    )
    if (event.status === "error") {
      notifyDownloadError(event.error)
    }
  }

  setDownloadProgressSnapshot(
    event.libraryId,
    event.bookId,
    fmt,
    {
      status: event.status,
      bytesWritten: event.bytesWritten,
      totalBytes: event.totalBytes,
      error: event.error,
    },
    client,
  )

  if (
    event.status === "done" ||
    event.status === "error" ||
    event.status === "cancelled"
  ) {
    void client.invalidateQueries({
      queryKey: bookFileStateKeys.detail(event.libraryId, event.bookId, fmt),
    })
  }
}

export function setDownloadStarting(
  libraryId: string,
  bookId: number,
  format: string,
  client?: QueryClient,
) {
  updateBookFileState(
    libraryId,
    bookId,
    format,
    "downloading",
    undefined,
    client,
  )
  setDownloadProgressSnapshot(
    libraryId,
    bookId,
    format,
    { status: "starting", bytesWritten: 0 },
    client,
  )
}

export function setDownloadError(
  libraryId: string,
  bookId: number,
  format: string,
  error: string,
  client?: QueryClient,
) {
  updateBookFileState(libraryId, bookId, format, "remote_only", null, client)
  setDownloadProgressSnapshot(
    libraryId,
    bookId,
    format,
    { status: "error", bytesWritten: 0, error },
    client,
  )
  notifyDownloadError(error)
}

export function setDownloadCancelled(
  libraryId: string,
  bookId: number,
  format: string,
  client?: QueryClient,
) {
  updateBookFileState(libraryId, bookId, format, "remote_only", null, client)
  setDownloadProgressSnapshot(
    libraryId,
    bookId,
    format,
    { status: "cancelled", bytesWritten: 0 },
    client,
  )
}

export function clearDownloadProgress(
  libraryId: string,
  bookId: number,
  format: string,
  client: QueryClient = defaultQueryClient,
) {
  updateBookFileState(libraryId, bookId, format, "remote_only", null, client)
  client.removeQueries({
    queryKey: downloadProgressKeys.detail(libraryId, bookId, format),
    exact: true,
  })
}

export function useDownloadProgressEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let active = true
    let unlisten: UnlistenFn | undefined

    listen<DownloadProgressEvent>("download_progress", (event) => {
      applyDownloadProgressEvent(event.payload, queryClient)
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

export function useDownloadProgress(
  libraryId: string | null,
  bookId: number | null,
  format: string | null,
) {
  const queryClient = useQueryClient()
  const fmt = format ? normalizeFormat(format) : null
  const enabled = Boolean(libraryId && bookId != null && fmt)
  const queryKey = downloadProgressKeys.detail(
    libraryId ?? "",
    bookId ?? 0,
    fmt ?? "",
  )

  const { data } = useQuery<DownloadProgress | null>({
    queryKey,
    queryFn: () => queryClient.getQueryData<DownloadProgress>(queryKey) ?? null,
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60 * 1000,
  })

  return data ?? null
}
