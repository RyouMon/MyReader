import { ReadiumDivinaReader } from "@/components/reader/readium/ReadiumDivinaReader"
import { ReadiumEpubReader } from "@/components/reader/readium/ReadiumEpubReader"
import { ReadiumPdfReader } from "@/components/reader/readium/ReadiumPdfReader"
import type { ReadingProgressDto } from "@/hooks/reader/useLocatorProgressSync"
import { useReadiumDivinaPublication } from "@/hooks/reader/useReadiumDivinaPublication"
import { useReadiumPublication } from "@/hooks/reader/useReadiumPublication"
import { isMainWebviewWindow, openReaderInNewWindow } from "@/lib/readerWindow"
import { resolveReadFormat } from "@/lib/readFormats"
import { parseSavedLocator } from "@/lib/readium/locator"
import { api } from "@/lib/tauri-api"
import { useLibrary } from "@/stores/libraryStore"
import type { Locator } from "@readium/shared"
import { useNavigate } from "@tanstack/react-router"
import { convertFileSrc, isTauri } from "@tauri-apps/api/core"
import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { getCurrentWindow } from "@tauri-apps/api/window"
import pTimeout from "p-timeout"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

export type ReadBookPageProps = {
  bookId: string
  formatFromSearch?: string
}

export function ReadBookPage({ bookId, formatFromSearch }: ReadBookPageProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { activeLibraryId, loading: libraryLoading } = useLibrary()

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

  const mainHandoff = useMemo(() => isMainWebviewWindow(), [])

  const progressSyncEnabled =
    isTauri() && !mainHandoff && Boolean(activeLibraryId && format)

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
    if (mainHandoff) return
    let cancelled = false

    async function load() {
      if (libraryLoading) return
      if (!activeLibraryId) {
        if (!cancelled) {
          setFetchError(t("reader.noActiveLibrary"))
        }
        return
      }
      setBookPayload(null)
      try {
        const detail = await api.getBookDetail(activeLibraryId, Number(bookId))
        if (cancelled) return

        setBookTitle(detail.title)
        if (isTauri()) {
          void WebviewWindow.getCurrent().setTitle(detail.title)
        }

        const fmt = resolveReadFormat(detail.formats, formatFromSearch)
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
          pTimeout(api.prepareBookSource(activeLibraryId, Number(bookId), fmt), {
            milliseconds: 10000,
            message: t("reader.loadTimeout"),
          }),
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
        if (!cancelled) setFetchError(String(e))
      }
    }

    load()
    return () => {
      cancelled = true
      if (activeLibraryId) {
        void api.closeBookStreamer(activeLibraryId, Number(bookId))
      }
    }
  }, [bookId, activeLibraryId, formatFromSearch, mainHandoff, libraryLoading])

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

  const handleErrorClose = useCallback(() => {
    if (isTauri()) {
      void getCurrentWindow().close()
    } else {
      navigate({ to: "/book/$bookId", params: { bookId } })
    }
  }, [navigate, bookId])

  if (mainHandoff) {
    return <ReadBookLoading message={t("reader.openWindow")} />
  }

  if (fetchError) {
    return (
      <ReadBookError
        message={fetchError}
        actionLabel={isTauri() ? t("reader.closeWindow") : t("reader.backToDetail")}
        onAction={handleErrorClose}
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
          actionLabel={isTauri() ? t("reader.closeWindow") : t("reader.backToDetail")}
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
          actionLabel={isTauri() ? t("reader.closeWindow") : t("reader.backToDetail")}
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
          actionLabel={isTauri() ? t("reader.closeWindow") : t("reader.backToDetail")}
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
      actionLabel={isTauri() ? t("reader.closeWindow") : t("reader.backToDetail")}
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
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <p className="font-medium text-destructive">{t("reader.loadFailed")}</p>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-2 text-sm text-primary underline-offset-4 hover:underline"
      >
        {actionLabel}
      </button>
    </div>
  )
}
