import { errorMessage } from "@/lib/error-presentation"
import { useQueryClient } from "@tanstack/react-query"
import { Download, Loader2, Trash2, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { BookDownloadIndicator } from "./BookDownloadIndicator"
import { CircularDownloadProgress } from "./CircularDownloadProgress"
import { Button } from "@/components/ui/button"
import {
  bookFileStateKeys,
  useBookFileState,
} from "@/hooks/queries/useBookFileState"
import { useBookUploadProgress } from "@/hooks/useBookUploadProgress"
import {
  clearDownloadProgress,
  setDownloadCancelled,
  setDownloadError,
  setDownloadStarting,
  useDownloadProgress,
} from "@/hooks/useDownloadProgress"
import { api } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

interface BookFormatFileActionProps {
  libraryId: string
  bookId: number
  bookUuid?: string | null
  format: string
}

export function BookFormatFileAction(props: BookFormatFileActionProps) {
  const { t } = useTranslation()
  const {
    stateLoading,
    isPreparing,
    isDownloading,
    isPresent,
    isLocalOnly,
    pending,
    cancelRequested,
    percent,
    uploadProgress,
    fmt,
    handleDownload,
    handleDelete,
    handleCancel,
  } = useBookFormatFileAction(props)
  if (stateLoading) {
    return (
      <Button variant="ghost" size="icon-sm" disabled>
        <Loader2 className="animate-spin" />
      </Button>
    )
  }

  if (isPreparing || isDownloading) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        className="group/download relative"
        title={t("bookDetail.cancelDownload")}
        aria-label={t("bookDetail.cancelDownload")}
        onClick={handleCancel}
        disabled={cancelRequested}
      >
        <CircularDownloadProgress
          percent={percent}
          className={cn(
            "transition-opacity group-hover/download:opacity-0",
            cancelRequested && "opacity-40",
          )}
        />
        {cancelRequested ? (
          <Loader2 className="absolute animate-spin opacity-100" />
        ) : (
          <X className="absolute opacity-0 transition-opacity group-hover/download:opacity-100" />
        )}
      </Button>
    )
  }

  if (isPresent) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-destructive hover:text-destructive"
        title={t("bookDetail.deleteFile")}
        aria-label={t("bookDetail.deleteFile")}
        onClick={handleDelete}
      >
        <Trash2 />
      </Button>
    )
  }

  if (isLocalOnly) {
    return (
      <BookDownloadIndicator
        state={
          uploadProgress !== undefined
            ? {
                status: "uploading",
                format: fmt,
                percent: uploadProgress ?? undefined,
              }
            : { status: "local_only", format: fmt }
        }
        variant="icon"
      />
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title={t("bookDetail.downloadFile")}
      aria-label={t("bookDetail.downloadFile")}
      onClick={handleDownload}
      disabled={pending}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Download />}
    </Button>
  )
}

function useBookFormatFileAction({
  libraryId,
  bookId,
  bookUuid,
  format,
}: BookFormatFileActionProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const fmt = format.toUpperCase()
  const [pending, setPending] = useState(false)
  const [cancelRequested, setCancelRequested] = useState(false)
  const cancelAfterStartRef = useRef(false)
  const { data: state, isLoading: stateLoading } = useBookFileState(
    libraryId,
    bookId,
    fmt,
  )
  const progress = useDownloadProgress(libraryId, bookId, fmt)
  const uploadProgress = useBookUploadProgress(libraryId, bookUuid)

  useEffect(() => {
    if (
      progress?.status === "done" ||
      progress?.status === "error" ||
      progress?.status === "cancelled"
    ) {
      void queryClient.invalidateQueries({
        queryKey: bookFileStateKeys.detail(libraryId, bookId, fmt),
      })
    }
  }, [progress?.status, libraryId, bookId, fmt, queryClient])

  useEffect(() => {
    if (!progress?.status) return
    setPending(false)
    if (progress.status !== "starting" && progress.status !== "downloading") {
      setCancelRequested(false)
      cancelAfterStartRef.current = false
    }
  }, [progress?.status])

  const isDownloading =
    progress?.status === "starting" || progress?.status === "downloading"
  const isPreparing = pending && !isDownloading
  const isPresent = state?.localState === "present"
  const isLocalOnly =
    state?.localState === "local_only" || state?.localState === "dirty_push"
  const totalBytes = progress?.totalBytes ?? 0
  const bytesWritten = progress?.bytesWritten ?? 0
  const percent =
    totalBytes > 0
      ? Math.min(100, Math.round((bytesWritten / totalBytes) * 100))
      : undefined

  const invalidateFileState = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: bookFileStateKeys.detail(libraryId, bookId, fmt),
    })
  }, [libraryId, bookId, fmt, queryClient])

  const handleDownload = useCallback(() => {
    if (isDownloading || pending) return
    cancelAfterStartRef.current = false
    setCancelRequested(false)
    setPending(true)
    setDownloadStarting(libraryId, bookId, fmt, queryClient)
    api
      .downloadBookFile(libraryId, bookId, fmt)
      .then(() => {
        if (!cancelAfterStartRef.current) return
        setDownloadCancelled(libraryId, bookId, fmt, queryClient)
        return api
          .cancelBookDownload(libraryId, bookId, fmt)
          .then(invalidateFileState)
      })
      .catch((err) => {
        console.error(
          `Failed to download book file from detail. library id: "${libraryId}", book id: ${bookId}, format: "${fmt}", error:`,
          err,
        )
        setDownloadError(libraryId, bookId, fmt, err, queryClient)
        setPending(false)
        setCancelRequested(false)
        cancelAfterStartRef.current = false
      })
  }, [
    libraryId,
    bookId,
    fmt,
    isDownloading,
    pending,
    invalidateFileState,
    queryClient,
  ])

  const handleDelete = useCallback(() => {
    api
      .deleteLocalBookFile(libraryId, bookId, fmt)
      .then(() => {
        clearDownloadProgress(libraryId, bookId, fmt, queryClient)
        invalidateFileState()
      })
      .catch((err) => {
        console.error(
          `Failed to delete local book file from detail. library id: "${libraryId}", book id: ${bookId}, format: "${fmt}", error:`,
          err,
        )
        toast.error(t("bookDetail.deleteFileFailed"), {
          description: errorMessage(err),
        })
      })
  }, [libraryId, bookId, fmt, invalidateFileState, queryClient, t])

  const handleCancel = useCallback(() => {
    if (pending && !isDownloading) {
      cancelAfterStartRef.current = true
      setCancelRequested(true)
      return
    }
    setDownloadCancelled(libraryId, bookId, fmt, queryClient)
    api
      .cancelBookDownload(libraryId, bookId, fmt)
      .then(invalidateFileState)
      .catch((err) => {
        console.error(
          `Failed to cancel book download from detail. library id: "${libraryId}", book id: ${bookId}, format: "${fmt}", error:`,
          err,
        )
        toast.error(t("bookDetail.cancelDownloadFailed"), {
          description: errorMessage(err),
        })
        setDownloadStarting(libraryId, bookId, fmt, queryClient)
      })
  }, [
    libraryId,
    bookId,
    fmt,
    invalidateFileState,
    isDownloading,
    pending,
    queryClient,
    t,
  ])

  return {
    stateLoading,
    isPreparing,
    isDownloading,
    isPresent,
    isLocalOnly,
    pending,
    cancelRequested,
    percent,
    uploadProgress,
    fmt,
    handleDownload,
    handleDelete,
    handleCancel,
  }
}
