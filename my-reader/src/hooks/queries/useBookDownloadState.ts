import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo } from "react"
import { resolveReadFormat } from "@/lib/readFormats"
import { useDownloadProgress } from "../useDownloadProgress"
import { bookFileStateKeys, useBookFileState } from "./useBookFileState"

export type BookDownloadStatus =
  | "remote_only"
  | "starting"
  | "downloading"
  | "present"

export type BookDownloadSnapshot = {
  status: BookDownloadStatus
  format: string
  percent?: number
}

export type BookDownloadStateOptions = {
  fileStateSource?: "query" | "prefetched"
  preferredFormat?: string | null
}

export function useBookDownloadState(
  libraryId: string | null,
  bookId: number,
  formats: string[],
  selectedFormat?: string,
  options: BookDownloadStateOptions = {},
): BookDownloadSnapshot | null {
  const queryClient = useQueryClient()
  const format = useMemo(
    () =>
      resolveReadFormat(
        formats,
        options.preferredFormat ?? formats[0],
        selectedFormat,
      ),
    [formats, options.preferredFormat, selectedFormat],
  )
  const fmt = format?.toUpperCase() ?? null
  const queryFileState = options.fileStateSource !== "prefetched"
  const { data: fileState, isLoading } = useBookFileState(
    libraryId,
    bookId,
    fmt,
    Boolean(fmt && queryFileState),
  )
  const progress = useDownloadProgress(libraryId, bookId, fmt)

  useEffect(() => {
    if (
      !libraryId ||
      !fmt ||
      (progress?.status !== "done" &&
        progress?.status !== "error" &&
        progress?.status !== "cancelled")
    ) {
      return
    }

    void queryClient.invalidateQueries({
      queryKey: bookFileStateKeys.detail(libraryId, bookId, fmt),
    })
  }, [progress?.status, libraryId, bookId, fmt, queryClient])

  if (!fmt || isLoading) return null

  if (progress?.status === "starting") {
    return { status: "starting", format: fmt }
  }

  if (progress?.status === "downloading") {
    const percent =
      progress.totalBytes && progress.totalBytes > 0
        ? Math.min(
            100,
            Math.round((progress.bytesWritten / progress.totalBytes) * 100),
          )
        : undefined
    return { status: "downloading", format: fmt, percent }
  }

  if (progress?.status === "cancelled" || progress?.status === "error") {
    return { status: "remote_only", format: fmt }
  }

  if (progress?.status === "done") {
    return { status: "present", format: fmt }
  }

  if (fileState?.localState === "present") {
    return { status: "present", format: fmt }
  }

  if (
    fileState?.localState === "starting" ||
    fileState?.localState === "downloading"
  ) {
    return { status: "starting", format: fmt }
  }

  if (fileState?.localState === "remote_only") {
    return { status: "remote_only", format: fmt }
  }

  if (progress?.status === "remote_only") {
    return { status: "remote_only", format: fmt }
  }

  return null
}
