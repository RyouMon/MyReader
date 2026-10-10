import { errorMessage } from "@/lib/error-presentation"
import { apiErrorKind } from "@/lib/api-error"
import type { Locator } from "@readium/shared"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { convertFileSrc, isTauri } from "@tauri-apps/api/core"
import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { getCurrentWindow } from "@tauri-apps/api/window"
import pTimeout from "p-timeout"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  setDownloadCancelled,
  setDownloadStarting,
  setDownloadError as setGlobalDownloadError,
  useDownloadProgress,
} from "@/hooks/useDownloadProgress"
import { isMainWebviewWindow, openReaderInNewWindow } from "@/lib/readerWindow"
import { resolveReadFormat } from "@/lib/readFormats"
import { parseSavedLocator } from "@/lib/readium/locator"
import { flushReaderProgress } from "@/lib/readerProgressPersistence"
import { api, type ReadingPositionCandidateDto } from "@/lib/tauri-api"
import { useLibraryUiStore } from "@/stores/libraryUiStore"

function toReaderAssetSrc(path: string): string {
  return isTauri() ? convertFileSrc(path) : path
}

async function loadReadingPosition(
  libraryId: string,
  bookId: number,
  format: string,
) {
  const [row, candidates] = await Promise.all([
    api.getReadingProgress(libraryId, bookId, format).catch(() => null),
    api
      .listReadingPositionCandidates(libraryId, bookId, format)
      .catch(() => []),
  ])
  return {
    initialSavedLocator: parseSavedLocator(row?.locator ?? null),
    candidates,
  }
}

async function prepareReaderSource(
  libraryId: string,
  bookId: number,
  format: string,
  timeoutMessage: string,
) {
  const prepared = await pTimeout(
    api.prepareBookSource(libraryId, bookId, format),
    {
      milliseconds: 10000,
      message: timeoutMessage,
    },
  )
  return {
    filePath: toReaderAssetSrc(prepared.filePath),
    extractedDirPath: prepared.extractedDirPath
      ? toReaderAssetSrc(prepared.extractedDirPath)
      : undefined,
    extractedEntries: prepared.extractedEntries ?? [],
  }
}

export function useReaderBookSource({
  bookId,
  formatFromSearch,
}: {
  bookId: string
  formatFromSearch?: string
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
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
  const [positionConflict, setPositionConflict] = useState<
    ReadingPositionCandidateDto[] | null
  >(null)
  const [resolvingPositionConflict, setResolvingPositionConflict] =
    useState(false)
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
      setDownloadError(errorMessage(downloadProgress.failure))
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
          setDownloadCancelled(
            activeLibraryId,
            Number(bookId),
            format,
            queryClient,
          )
          await api.cancelBookDownload(activeLibraryId, Number(bookId), format)
        } catch (e) {
          console.error(
            `Failed to cancel download on reader close. library id: "${activeLibraryId}", book id: ${bookId}, format: "${format}", error:`,
            e,
          )
        }
      }

      await flushReaderProgress()
      await getCurrentWindow().close()
    })

    return () => {
      unlisten.then((fn) => fn()).catch(() => {})
    }
  }, [downloadState, activeLibraryId, bookId, format, queryClient])

  const startDownload = useCallback(
    async (requestedFormat: string) => {
      if (!activeLibraryId || !requestedFormat) return
      setDownloadState("downloading")
      setDownloadError(null)
      setDownloadStarting(
        activeLibraryId,
        Number(bookId),
        requestedFormat,
        queryClient,
      )
      try {
        await api.downloadBookFile(
          activeLibraryId,
          Number(bookId),
          requestedFormat,
        )
      } catch (error) {
        setDownloadState("error")
        setDownloadError(errorMessage(error))
        setGlobalDownloadError(
          activeLibraryId,
          Number(bookId),
          requestedFormat,
          error,
          queryClient,
        )
      }
    },
    [activeLibraryId, bookId, queryClient],
  )

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
      setPositionConflict(null)
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

        fmt = resolveReadFormat(
          detail.readableFormats,
          detail.preferredFormat,
          formatFromSearch,
        )
        if (!fmt) {
          setFetchError(t("reader.noReadableFormat"))
          return
        }
        setFormat(fmt)

        const [position, source] = await Promise.all([
          isTauri()
            ? loadReadingPosition(activeLibraryId, Number(bookId), fmt)
            : Promise.resolve({ initialSavedLocator: null, candidates: [] }),
          prepareReaderSource(
            activeLibraryId,
            Number(bookId),
            fmt,
            t("reader.loadTimeout"),
          ),
        ])
        if (cancelled) return
        const { initialSavedLocator, candidates } = position
        setBookPayload({ source, initialSavedLocator })
        if (candidates.length > 1) {
          setPositionConflict(candidates)
        }
      } catch (e) {
        if (cancelled) return
        const msg = errorMessage(e)
        if (apiErrorKind(e) === "BookFormatNotDownloaded" && fmt) {
          setFetchError(null)
          await startDownload(fmt)
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
  }, [bookId, activeLibraryId, formatFromSearch, mainHandoff, startDownload, t])

  useEffect(() => {
    if (downloadState !== "done") return
    let cancelled = false

    async function retryPrepare() {
      if (!activeLibraryId || !format) return
      try {
        const source = await prepareReaderSource(
          activeLibraryId,
          Number(bookId),
          format,
          t("reader.loadTimeout"),
        )
        if (cancelled) return
        const { initialSavedLocator, candidates } = await loadReadingPosition(
          activeLibraryId,
          Number(bookId),
          format,
        )
        if (cancelled) return
        setBookPayload({ source, initialSavedLocator })
        if (candidates.length > 1) {
          setPositionConflict(candidates)
        }
      } catch (e) {
        if (!cancelled) setFetchError(errorMessage(e))
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

  const handlePositionConflict = useCallback(
    async (candidate: ReadingPositionCandidateDto | null) => {
      if (!candidate) {
        setPositionConflict(null)
        return
      }
      if (!activeLibraryId || !format) return

      setResolvingPositionConflict(true)
      try {
        await api.selectReadingPositionCandidate(
          activeLibraryId,
          Number(bookId),
          format,
          candidate.operationId,
        )
        setBookPayload((current) =>
          current
            ? {
                ...current,
                initialSavedLocator: parseSavedLocator(candidate.locator),
              }
            : current,
        )
        setPositionConflict(null)
      } catch (error) {
        setFetchError(errorMessage(error))
      } finally {
        setResolvingPositionConflict(false)
      }
    },
    [activeLibraryId, bookId, format],
  )

  const handleRetryDownload = useCallback(() => {
    void startDownload(format)
  }, [format, startDownload])

  const handleCancelDownload = useCallback(async () => {
    if (!activeLibraryId || !format) return
    closingRef.current = true
    setDownloadCancelled(activeLibraryId, Number(bookId), format, queryClient)
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
  }, [activeLibraryId, bookId, format, queryClient])

  return {
    bookId: Number(bookId),
    bookTitle,
    format,
    bookPayload,
    positionConflict,
    resolvingPositionConflict,
    fetchError,
    downloadState,
    downloadError,
    mainHandoff,
    progressSyncEnabled,
    downloadProgress,
    activeLibraryId,
    handleErrorClose,
    handlePositionConflict,
    handleRetryDownload,
    handleCancelDownload,
  }
}
