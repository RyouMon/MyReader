import { router } from "expo-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { libraryTypeOf } from "@my-reader/tools/types/library"

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import {
  cancel as cancelDownload,
  enqueue as enqueueDownload,
  useDownloadStatusTasks,
} from "@/src/domain/download/download-store"
import { resolveEffectiveFormat } from "@/src/domain/library/book-formats"
import { getBookFormatPaths } from "@/src/domain/library/catalog"
import { deleteManagedBook } from "@/src/domain/library/hooks/library-actions"
import { requestPendingBookUploads } from "@/src/domain/sync/book-upload-store"
import {
  resolveShareableFormat,
  shareBookFile,
} from "@/src/domain/library/share-book-file"
import type { BookItem, Library } from "@/src/domain/types"
import { isRemoteSourceType } from "@/src/domain/types"
import { describeDownloadError } from "@/src/errors"
import i18n from "@/src/i18n"
import type { FileState as FileStateRow } from "@/src/services/core/content"
import { confirmDeleteLocalDownload } from "../utils/delete-download"

export function useBookActions(
  books: BookItem[],
  bookDownloadStatusById: Record<string, string>,
  bookFormatMetaById: Map<
    string,
    { readableFormats: string[]; effectiveFormat?: string }
  >,
  fileStateBundle: { rows: Record<string, FileStateRow[]> },
  openMenuBookId: string | null,
  selectedFormatById: Record<string, string>,
  selectedLibrary: Library | null,
  setBookReadingFormat:
    | ((bookId: string, format: string | null) => Promise<void> | void)
    | null,
  toggleFavorite?: (bookId: string) => Promise<void> | void,
) {
  const isNavigatingRef = useRef(false)
  const handledReaderDownloadTaskIdsRef = useRef(new Set<string>())
  const tasks = useDownloadStatusTasks()
  const [pendingReaderDownload, setPendingReaderDownload] = useState<{
    bookId: string
    format: string
    taskId: string
  } | null>(null)

  // Sync latest props into a ref so callbacks always read current values
  // without rebuilding their references on every parent render.
  const stateRef = useRef({
    books,
    bookDownloadStatusById,
    bookFormatMetaById,
    fileStateBundle,
    openMenuBookId,
    selectedFormatById,
    selectedLibrary,
    setBookReadingFormat,
    tasks,
    toggleFavorite,
  })
  useEffect(() => {
    stateRef.current = {
      books,
      bookDownloadStatusById,
      bookFormatMetaById,
      fileStateBundle,
      openMenuBookId,
      selectedFormatById,
      selectedLibrary,
      setBookReadingFormat,
      tasks,
      toggleFavorite,
    }
  })

  const downloadBook = useCallback(
    async (book: BookItem, targetFormat?: string) => {
      const {
        selectedLibrary: lib,
        selectedFormatById: formatById,
        bookFormatMetaById: formatMetaById,
      } = stateRef.current
      const calibreId = Number(book.id)
      if (
        !Number.isFinite(calibreId) ||
        calibreId <= 0 ||
        !lib ||
        !isRemoteSourceType(lib.sourceType)
      )
        return

      try {
        const formatMeta = formatMetaById.get(book.id)
        const readableFormats =
          formatMeta?.readableFormats ?? book.readableFormats ?? []
        const paths = await getBookFormatPaths(lib, calibreId)
        const normalizedTarget = targetFormat?.toUpperCase()
        const format = normalizedTarget
          ? readableFormats.find((item) => item === normalizedTarget)
          : (formatMeta?.effectiveFormat ??
            resolveEffectiveFormat(
              readableFormats,
              formatById[book.id],
              book.preferredFormat,
            ))
        if (!format) {
          showAlertWithStatusBarRestore(
            i18n.t("sync.cannotDownload"),
            i18n.t("sync.noReadableFormatForDownload"),
          )
          return
        }
        const match = paths.find((p) => p.format.toUpperCase() === format)
        if (!match) return

        const taskId = await enqueueDownload({
          libraryId: lib.id,
          bookId: book.id,
          format,
          relativePath: match.relativePath,
          label: `${book.title} · ${format}`,
        })
        return { format, taskId }
      } catch (e) {
        const { title, message } = describeDownloadError(e)
        showAlertWithStatusBarRestore(title, message)
      }
      return null
    },
    [],
  )

  const openReader = useCallback((bookId: string, format?: string) => {
    if (isNavigatingRef.current) return
    isNavigatingRef.current = true
    router.push({
      pathname: "/reader/[id]",
      params: format ? { id: bookId, format } : { id: bookId },
    })
    setTimeout(() => {
      isNavigatingRef.current = false
    }, 1200)
  }, [])

  useEffect(() => {
    if (!pendingReaderDownload) return
    if (
      handledReaderDownloadTaskIdsRef.current.has(pendingReaderDownload.taskId)
    ) {
      return
    }
    const task = tasks.find((item) => item.id === pendingReaderDownload.taskId)
    if (!task) return
    if (task.status === "done") {
      handledReaderDownloadTaskIdsRef.current.add(pendingReaderDownload.taskId)
      openReader(pendingReaderDownload.bookId, pendingReaderDownload.format)
    } else if (task.status === "error" || task.status === "cancelled") {
      handledReaderDownloadTaskIdsRef.current.add(pendingReaderDownload.taskId)
    }
  }, [openReader, pendingReaderDownload, tasks])

  const promptSetDefaultFormat = useCallback(async (book: BookItem) => {
    const {
      selectedLibrary: lib,
      selectedFormatById: formatById,
      bookFormatMetaById: formatMetaById,
    } = stateRef.current
    const calibreId = Number(book.id)
    if (!Number.isFinite(calibreId) || calibreId <= 0 || !lib) return

    try {
      const formatMeta = formatMetaById.get(book.id)
      const readableFormats =
        formatMeta?.readableFormats ?? book.readableFormats ?? []

      if (readableFormats.length === 0) {
        showAlertWithStatusBarRestore(
          i18n.t("sync.noReadableFormat"),
          i18n.t("sync.noReadableFormatDetail"),
        )
        return
      }
      const setFormat = stateRef.current.setBookReadingFormat
      if (readableFormats.length === 1) {
        const format = readableFormats[0]
        if (!format) return
        if (setFormat) {
          void setFormat(book.id, format)
        }
        showAlertWithStatusBarRestore(i18n.t("sync.defaultFormatSet"), format)
        return
      }

      const current = formatById[book.id]
      const effectiveFormat =
        formatMeta?.effectiveFormat ??
        resolveEffectiveFormat(readableFormats, current, book.preferredFormat)
      showAlertWithStatusBarRestore(
        i18n.t("sync.setDefaultFormat"),
        i18n.t("sync.currentDefault", { format: effectiveFormat }),
        [
          ...readableFormats.map((fmt) => ({
            text: `${effectiveFormat === fmt ? "✓ " : ""}${fmt}`,
            onPress: () => {
              if (setFormat) {
                void setFormat(book.id, fmt)
              }
            },
          })),
          { text: i18n.t("common.cancel"), style: "cancel" },
        ],
      )
    } catch (e) {
      showAlertWithStatusBarRestore(
        i18n.t("sync.readFormatFailed"),
        e instanceof Error ? e.message : String(e),
      )
    }
  }, [])

  const handleBookPress = useCallback(
    (bookId: string) => {
      if (isNavigatingRef.current) return
      const latest = stateRef.current
      if (latest.openMenuBookId) return
      const book = latest.books.find((b) => b.id === bookId)
      if (!book) return
      const status = latest.bookDownloadStatusById[bookId] ?? "notDownloaded"

      if (
        !isRemoteSourceType(latest.selectedLibrary?.sourceType) ||
        status === "downloaded"
      ) {
        const effectiveFormat =
          latest.bookFormatMetaById.get(bookId)?.effectiveFormat
        openReader(bookId, effectiveFormat)
        return
      }

      void downloadBook(book).then((download) => {
        if (!download) return
        handledReaderDownloadTaskIdsRef.current.delete(download.taskId)
        setPendingReaderDownload({ bookId, ...download })
      })
    },
    [downloadBook, openReader],
  )

  const handleBookMenuAction = useCallback(
    (bookId: string, actionId: string) => {
      const latest = stateRef.current
      const book = latest.books.find((b) => b.id === bookId)
      if (!book) return

      if (actionId === "download" || actionId.startsWith("download:")) {
        const targetFormat =
          actionId === "download"
            ? undefined
            : actionId.slice("download:".length)
        void downloadBook(book, targetFormat)
        return
      }
      if (actionId === "cancelDownload") {
        const activeTasks = latest.tasks.filter(
          (task) =>
            task.bookId === bookId &&
            (task.status === "queued" ||
              task.status === "starting" ||
              task.status === "downloading"),
        )
        for (const task of activeTasks) {
          cancelDownload(task.id)
        }
        return
      }
      if (actionId === "uploadFile") {
        const lib = latest.selectedLibrary
        if (
          !lib ||
          libraryTypeOf(lib) !== "myreader" ||
          !isRemoteSourceType(lib.sourceType)
        ) {
          return
        }
        requestPendingBookUploads(lib.id)
        return
      }
      if (actionId === "detail") {
        router.push({ pathname: "/library-book/[id]", params: { id: bookId } })
        return
      }
      if (actionId === "editMetadata") {
        const lib = latest.selectedLibrary
        if (!lib || libraryTypeOf(lib) !== "myreader") return
        router.push({
          pathname: "/library-book/edit",
          params: { id: bookId },
        })
        return
      }
      if (actionId === "deleteBook") {
        const lib = latest.selectedLibrary
        const calibreId = Number(book.id)
        if (
          !lib ||
          libraryTypeOf(lib) !== "myreader" ||
          !Number.isFinite(calibreId) ||
          calibreId <= 0
        ) {
          return
        }
        showAlertWithStatusBarRestore(
          i18n.t("bookMenu.deleteConfirmTitle"),
          i18n.t("bookMenu.deleteConfirmDetail", { title: book.title }),
          [
            { text: i18n.t("common.cancel"), style: "cancel" },
            {
              text: i18n.t("common.delete"),
              style: "destructive",
              onPress: () => {
                void deleteManagedBook(lib, calibreId).catch((error) => {
                  showAlertWithStatusBarRestore(
                    i18n.t("bookMenu.deleteFailed"),
                    error instanceof Error ? error.message : String(error),
                  )
                })
              },
            },
          ],
        )
        return
      }
      if (actionId === "favorite") {
        const toggle = latest.toggleFavorite
        if (toggle) {
          void toggle(bookId)
        }
        return
      }
      if (actionId.startsWith("setDefaultFormat:")) {
        const format = actionId.slice("setDefaultFormat:".length)
        const setFormat = latest.setBookReadingFormat
        if (!setFormat) return
        if (format === "auto") {
          void setFormat(bookId, null)
        } else {
          void setFormat(bookId, format)
        }
        return
      }
      if (actionId === "setDefaultFormat") {
        void promptSetDefaultFormat(book)
        return
      }
      if (actionId === "deleteDownload") {
        const rows = latest.fileStateBundle.rows[bookId] ?? []
        const downloadedRows = rows.filter((row) => row.isLocallyAvailable)
        if (downloadedRows.length === 0) return
        const lib = latest.selectedLibrary
        if (!lib) return
        confirmDeleteLocalDownload(
          book.title,
          lib.id,
          downloadedRows.map((row) => row.path),
        )
        return
      }
      if (actionId === "share" || actionId.startsWith("share:")) {
        const targetFormat =
          actionId === "share" ? undefined : actionId.slice("share:".length)
        const lib = latest.selectedLibrary
        if (!lib) return
        void (async () => {
          try {
            const calibreId = Number(book.id)
            if (!Number.isFinite(calibreId) || calibreId <= 0) return
            let resolved: {
              format: string
              relativePath: string
              fileUri: string
              isLocal: boolean
            } | null = null
            if (targetFormat) {
              resolved = await resolveShareableFormat(
                lib,
                calibreId,
                targetFormat,
              )
            } else {
              const formatMeta = latest.bookFormatMetaById.get(book.id)
              const readableFormats =
                formatMeta?.readableFormats ?? book.readableFormats ?? []
              const defaultFormat = resolveEffectiveFormat(
                readableFormats,
                latest.selectedFormatById[book.id],
                book.preferredFormat,
              )
              const pick = formatMeta?.effectiveFormat ?? defaultFormat
              if (pick) {
                resolved = await resolveShareableFormat(lib, calibreId, pick)
              }
            }
            if (!resolved) {
              showAlertWithStatusBarRestore(
                i18n.t("share.shareFailed"),
                i18n.t("sync.noReadableFormatForDownload"),
              )
              return
            }
            if (!resolved.isLocal) {
              showAlertWithStatusBarRestore(
                i18n.t("share.fileNotDownloadedTitle"),
                i18n.t("share.fileNotDownloadedMessage", {
                  title: book.title,
                  format: resolved.format,
                }),
              )
              return
            }
            await shareBookFile(resolved.fileUri, resolved.format)
          } catch (e) {
            showAlertWithStatusBarRestore(
              i18n.t("share.shareFailed"),
              e instanceof Error ? e.message : String(e),
            )
          }
        })()
        return
      }
    },
    [downloadBook, promptSetDefaultFormat],
  )

  return {
    handleBookPress,
    handleBookMenuAction,
  }
}
