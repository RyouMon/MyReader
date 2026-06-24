import { useEffect, useState } from "react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

export type DownloadProgressEvent = {
  libraryId: string
  bookId: number
  format: string
  status: "starting" | "downloading" | "done" | "error" | "cancelled"
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

export function useDownloadProgress(
  libraryId: string | null,
  bookId: number | null,
  format: string | null,
) {
  const [progress, setProgress] = useState<DownloadProgress | null>(null)

  useEffect(() => {
    if (!libraryId || bookId == null || !format) {
      return
    }

    let unlisten: UnlistenFn | undefined

    const setup = async () => {
      unlisten = await listen<DownloadProgressEvent>(
        `download_progress/${libraryId}/${bookId}/${format}`,
        (event) => {
          setProgress({
            status: event.payload.status,
            bytesWritten: event.payload.bytesWritten,
            totalBytes: event.payload.totalBytes,
            error: event.payload.error,
          })
        },
      )
    }

    setup()

    return () => {
      unlisten?.()
    }
  }, [libraryId, bookId, format])

  return progress
}
