import { ReadiumDivinaReader } from "@/components/reader/readium/ReadiumDivinaReader"
import { ReadiumEpubReader } from "@/components/reader/readium/ReadiumEpubReader"
import { ReadiumPdfReader } from "@/components/reader/readium/ReadiumPdfReader"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { ReadingProgressDto } from "@/hooks/reader/useLocatorProgressSync"
import { useReadiumDivinaPublication } from "@/hooks/reader/useReadiumDivinaPublication"
import { useReadiumPublication } from "@/hooks/reader/useReadiumPublication"
import { useDownloadProgress } from "@/hooks/useDownloadProgress"
import { isMainWebviewWindow, openReaderInNewWindow } from "@/lib/readerWindow"
import { resolveReadFormat } from "@/lib/readFormats"
import { parseSavedLocator } from "@/lib/readium/locator"
import { api } from "@/lib/tauri-api"
import { useLibraryUiStore } from "@/stores/libraryUiStore"
import type { Locator } from "@readium/shared"
import { useNavigate } from "@tanstack/react-router"
import { convertFileSrc, isTauri } from "@tauri-apps/api/core"
import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { AlertCircle } from "lucide-react"
import pTimeout from "p-timeout"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export type ReadBookPageProps = {
  bookId: string
  formatFromSearch?: string
}

export function ReadBookPage({ bookId, formatFromSearch }: ReadBookPageProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const activeLibraryId = useLibraryUiStore((s) => s.activeLibraryId)

  const [bookTitle, setBookTitle] = useState("")
  const [format, setFormat] = useState("")
  const [bookPayload, setBookPayload] = useState<{
    source: {
      filePath: string
      extractedDirPath?: string
      extractedEntries: string[]
    }
    initialSavedLocator: Locator | null
  } | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [downloadState, setDownloadState] = useState<
    "idle" | "downloading" | "error" | "cancelled" | "done"
  >("idle")
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const closingRef = useRef(false)

  const mainHandoff = useMemo(() => isMainWebviewWindow(), [])

  const progressSyncEnabled =
    isTauri() && !mainHandoff && Boolean(activeLibraryId && format)

  const downloadProgress = useDownloadProgress(
    activeLibraryId,
    bookId ? Number(bookId) : null,
    format || null,
  )

  useEffect(() => {
    if (!mainHandoff) return
    let cancelled = false
    void (async () => {
      try {
        await openReaderInNewWindow(bookId, formatFromSearch)
        if (cancelled) return
        navigate({ to: "/book/$bookId", params: { bookId } })
      } catch (e) {
        console.error(`Failed to open reader window. book id: "${bookId}":`, e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mainHandoff, bookId, formatFromSearch, navigate])

  useEffect(() => {
    if (!downloadProgress) return
    if (downloadProgress.status === "done") {
      setDownloadState("done")
      setDownloadError(null)
    } else if (downloadProgress.status === "error") {
      setDownloadState("error")
      setDownloadError(downloadProgress.error ?? t("reader.downloadFailed"))
    } else if (downloadProgress.status === "cancelled") {
      setDownloadState("cancelled")
      if (closingRef.current && isTauri()) {
        void getCurrentWindow().close()
      }
    }
  }, [downloadProgress, t])

  useEffect(() => {
    if (!isTauri()) return
    if (!activeLibraryId || !format) return

    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      if (closingRef.current) return
      closingRef.current = true
      event.preventDefault()

      if (downloadState === "downloading") {
        try {
          await api.cancelBookDownload(activeLibraryId, Number(bookId), format)
        } catch (e) {
          console.error(
            `Failed to cancel download on reader close. library id: "${activeLibraryId}", book id: ${bookId}, format: "${format}", error:`,
            e,
          )
        }
      }

      await getCurrentWindow().close()
    })

    return () => {
      unlisten.then((fn) => fn()).catch(() => {})
    }
  }, [downloadState, activeLibraryId, bookId, format])

  useEffect(() => {
    if (mainHandoff) return
    let cancelled = false

    async function load() {
      if (!activeLibraryId) {
        if (!cancelled) {
          setFetchError(t("reader.noActiveLibrary"))
        }
        return
      }
      setBookPayload(null)
      setFetchError(null)
      setDownloadState("idle")
      setDownloadError(null)
      let fmt: string | null = null
      try {
        const detail = await api.getBookDetail(activeLibraryId, Number(bookId))
        if (cancelled) return

        setBookTitle(detail.title)
        if (isTauri()) {
          void WebviewWindow.getCurrent().setTitle(detail.title)
        }

        fmt = resolveReadFormat(detail.formats, formatFromSearch)
        if (!fmt) {
          setFetchError(t("reader.noReadableFormat"))
          return
        }
        setFormat(fmt)

        const progressP: Promise<ReadingProgressDto | null> =
          isTauri() && activeLibraryId
            ? api
                .getReadingProgress(activeLibraryId, Number(bookId), fmt)
                .catch(() => null)
            : Promise.resolve(null)

        const [row, preparedSource] = await Promise.all([
          progressP,
          pTimeout(
            api.prepareBookSource(activeLibraryId, Number(bookId), fmt),
            {
              milliseconds: 10000,
              message: t("reader.loadTimeout"),
            },
          ),
        ])
        if (cancelled) return

        const source = {
          filePath: convertFileSrc(preparedSource.filePath),
          extractedDirPath: preparedSource.extractedDirPath
            ? convertFileSrc(preparedSource.extractedDirPath)
            : undefined,
          extractedEntries: preparedSource.extractedEntries ?? [],
        }

        const initialSavedLocator = parseSavedLocator(row?.locator ?? null)

        setBookPayload({
          source,
          initialSavedLocator,
        })
      } catch (e) {
        if (cancelled) return
        const msg = String(e)
        if (msg.includes("BOOK_FORMAT_NOT_DOWNLOADED") && fmt) {
          setDownloadState("downloading")
          setFetchError(null)
          try {
            await api.downloadBookFile(activeLibraryId, Number(bookId), fmt)
          } catch (downloadErr) {
            setDownloadState("error")
            setDownloadError(String(downloadErr))
          }
          return
        }
        setFetchError(msg)
      }
    }

    load()
    return () => {
      cancelled = true
      if (activeLibraryId) {
        void api.closeBookStreamer(activeLibraryId, Number(bookId))
      }
    }
  }, [bookId, activeLibraryId, formatFromSearch, mainHandoff, t])

  useEffect(() => {
    if (downloadState !== "done") return
    let cancelled = false

    async function retryPrepare() {
      if (!activeLibraryId || !format) return
      try {
        const preparedSource = await pTimeout(
          api.prepareBookSource(activeLibraryId, Number(bookId), format),
          {
            milliseconds: 10000,
            message: t("reader.loadTimeout"),
          },
        )
        if (cancelled) return

        const source = {
          filePath: convertFileSrc(preparedSource.filePath),
          extractedDirPath: preparedSource.extractedDirPath
            ? convertFileSrc(preparedSource.extractedDirPath)
            : undefined,
          extractedEntries: preparedSource.extractedEntries ?? [],
        }

        const row = await api
          .getReadingProgress(activeLibraryId, Number(bookId), format)
          .catch(() => null)
        if (cancelled) return
        const initialSavedLocator = parseSavedLocator(row?.locator ?? null)

        setBookPayload({
          source,
          initialSavedLocator,
        })
      } catch (e) {
        if (!cancelled) setFetchError(String(e))
      }
    }

    retryPrepare()
    return () => {
      cancelled = true
    }
  }, [downloadState, activeLibraryId, bookId, format, t])

  const handleErrorClose = useCallback(() => {
    if (isTauri()) {
      void getCurrentWindow().close()
    } else {
      navigate({ to: "/book/$bookId", params: { bookId } })
    }
  }, [navigate, bookId])

  const handleRetryDownload = useCallback(() => {
    if (!activeLibraryId || !format) return
    setDownloadState("downloading")
    setDownloadError(null)
    api
      .downloadBookFile(activeLibraryId, Number(bookId), format)
      .catch((err) => {
        setDownloadState("error")
        setDownloadError(String(err))
      })
  }, [activeLibraryId, bookId, format])

  const handleCancelDownload = useCallback(async () => {
    if (!activeLibraryId || !format) return
    closingRef.current = true
    try {
      await api.cancelBookDownload(activeLibraryId, Number(bookId), format)
    } catch (e) {
      console.error(
        `Failed to cancel download from reader. library id: "${activeLibraryId}", book id: ${bookId}, format: "${format}", error:`,
        e,
      )
    }
    if (isTauri()) {
      await getCurrentWindow().close()
    }
  }, [activeLibraryId, bookId, format])

  const readiumPub = useReadiumPublication({
    assetBaseUrl:
      format === "EPUB" ? (bookPayload?.source.extractedDirPath ?? null) : null,
    enabled: format === "EPUB" && Boolean(bookPayload?.source.extractedDirPath),
  })

  const divinaPub = useReadiumDivinaPublication({
    extractedDirUrl:
      format === "CBZ" ? (bookPayload?.source.extractedDirPath ?? null) : null,
    bookTitle,
    extractedEntries: bookPayload?.source.extractedEntries ?? [],
    enabled: format === "CBZ" && Boolean(bookPayload?.source.extractedDirPath),
  })

  if (mainHandoff) {
    return <ReadBookLoading message={t("reader.openWindow")} />
  }

  if (fetchError) {
    return (
      <ReadBookError
        message={fetchError}
        actionLabel={
          isTauri() ? t("reader.closeWindow") : t("reader.backToDetail")
        }
        onAction={handleErrorClose}
      />
    )
  }

  if (downloadState === "downloading") {
    const percent =
      downloadProgress?.totalBytes && downloadProgress.totalBytes > 0
        ? Math.min(
            100,
            Math.round(
              (downloadProgress.bytesWritten / downloadProgress.totalBytes) *
                100,
            ),
          )
        : undefined
    return (
      <ReadBookDownloading
        downloadingLabel={t("reader.downloading")}
        percent={percent}
        bytesWritten={downloadProgress?.bytesWritten ?? 0}
        totalBytes={downloadProgress?.totalBytes}
        cancelLabel={t("common.cancel")}
        onCancel={handleCancelDownload}
      />
    )
  }

  if (downloadState === "error") {
    return (
      <ReadBookError
        message={downloadError ?? t("reader.downloadFailed")}
        actionLabel={t("reader.retryDownload")}
        onAction={handleRetryDownload}
      />
    )
  }

  if (downloadState === "cancelled") {
    return (
      <ReadBookError
        message={t("reader.downloadCancelled")}
        actionLabel={t("reader.retryDownload")}
        onAction={handleRetryDownload}
      />
    )
  }

  if (!bookPayload) {
    return <ReadBookLoading message={t("reader.loadingBook")} />
  }

  if (format === "EPUB") {
    if (readiumPub.loading) {
      return <ReadBookLoading message={t("reader.loadingReadium")} />
    }
    if (readiumPub.error || !readiumPub.publication) {
      return (
        <ReadBookError
          message={readiumPub.error ?? t("reader.loadEpubFailed")}
          actionLabel={
            isTauri() ? t("reader.closeWindow") : t("reader.backToDetail")
          }
          onAction={handleErrorClose}
        />
      )
    }
    return (
      <ReadiumEpubReader
        bookTitle={bookTitle}
        publication={readiumPub.publication}
        initialSavedLocator={bookPayload.initialSavedLocator}
        libraryId={activeLibraryId}
        bookId={Number(bookId)}
        format={format}
        progressSyncEnabled={progressSyncEnabled}
      />
    )
  }

  if (format === "CBZ") {
    if (!bookPayload.source.extractedDirPath) {
      return (
        <ReadBookError
          message={t("reader.comicDirUnavailable")}
          actionLabel={
            isTauri() ? t("reader.closeWindow") : t("reader.backToDetail")
          }
          onAction={handleErrorClose}
        />
      )
    }
    if (divinaPub.loading) {
      return <ReadBookLoading message={t("reader.loadingComic")} />
    }
    if (divinaPub.error || !divinaPub.publication) {
      return (
        <ReadBookError
          message={divinaPub.error ?? t("reader.loadComicFailed")}
          actionLabel={
            isTauri() ? t("reader.closeWindow") : t("reader.backToDetail")
          }
          onAction={handleErrorClose}
        />
      )
    }
    return (
      <ReadiumDivinaReader
        bookTitle={bookTitle}
        publication={divinaPub.publication}
        initialSavedLocator={bookPayload.initialSavedLocator}
        libraryId={activeLibraryId}
        bookId={Number(bookId)}
        format={format}
        progressSyncEnabled={progressSyncEnabled}
      />
    )
  }

  if (format === "PDF") {
    return (
      <ReadiumPdfReader
        bookTitle={bookTitle}
        fileUrl={bookPayload.source.filePath}
        initialSavedLocator={bookPayload.initialSavedLocator}
        libraryId={activeLibraryId}
        bookId={Number(bookId)}
        format={format}
        progressSyncEnabled={progressSyncEnabled}
      />
    )
  }

  return (
    <ReadBookError
      message={t("reader.unsupportedFormat")}
      actionLabel={
        isTauri() ? t("reader.closeWindow") : t("reader.backToDetail")
      }
      onAction={handleErrorClose}
    />
  )
}

function ReadBookLoading({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background px-4">
      <div
        className="flex flex-col items-center gap-3 text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <div
          className="size-8 animate-spin rounded-full border-2 border-muted-foreground border-t-primary"
          aria-hidden
        />
        <p className="text-sm">{message}</p>
      </div>
    </div>
  )
}

function ReadBookDownloading({
  percent,
  bytesWritten,
  totalBytes,
  downloadingLabel,
  cancelLabel,
  onCancel,
}: {
  percent?: number
  bytesWritten: number
  totalBytes?: number
  downloadingLabel: string
  cancelLabel: string
  onCancel: () => void
}) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md rounded-lg">
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{downloadingLabel}</span>
            <span className="tabular-nums text-muted-foreground">
              {percent != null ? `${percent}%` : "—"}
              {totalBytes != null && totalBytes > 0
                ? ` (${formatFileSize(bytesWritten)} / ${formatFileSize(totalBytes)})`
                : null}
            </span>
          </div>
          <Progress value={percent} className="h-3" />
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function ReadBookError({
  message,
  actionLabel,
  onAction,
}: {
  message: string
  actionLabel: string
  onAction: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
      <Empty className="w-full max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertCircle className="text-destructive" />
          </EmptyMedia>
          <EmptyTitle>{t("reader.loadFailed")}</EmptyTitle>
          <EmptyDescription>{message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}
