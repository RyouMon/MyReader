import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

import {
  type DownloadStatusTask,
  useDownloadStatusTasks,
} from "@/src/domain/download/download-store"
import {
  getFormatFromPath,
  pathBelongsToBook,
  resolveEffectiveFormat,
} from "@/src/domain/library/book-formats"
import { getAllBookFormats } from "@/src/domain/library/catalog"
import { useFileStates } from "@/src/domain/sync/hooks/use-file-states"
import { useBookUploadBookUuid } from "@/src/domain/sync/book-upload-store"
import type { BookItem, Library } from "@/src/domain/types"
import { isRemoteSourceType } from "@/src/domain/types"
import type {
  BookDownloadStatus,
  BookTransferStatus,
} from "@/src/features/library/components/books/book-cover"
import type { FileState as FileStateRow } from "@/src/services/core/content"
import { queryKeys } from "@/src/services/query/query-keys"

type BookFileStateMap = Record<string, BookDownloadStatus>
type BookTransferStateMap = Record<string, BookTransferStatus>
type BookFileStateRowMap = Record<string, FileStateRow[]>
type BookFileStateBundle = {
  statuses: BookFileStateMap
  rows: BookFileStateRowMap
}

const EMPTY_FILE_STATE_BUNDLE: BookFileStateBundle = { statuses: {}, rows: {} }

type BookFormatMeta = { readableFormats: string[]; effectiveFormat?: string }

export function useLibraryBookMeta(
  selectedLibrary: Library | null,
  books: BookItem[],
  selectedFormatById: Record<string, string>,
) {
  const { data: bookFormatsById = {} } = useQuery({
    queryKey: queryKeys.bookFormats(selectedLibrary?.id, books.length),
    queryFn: async () => {
      if (!selectedLibrary) return {}
      return getAllBookFormats(selectedLibrary)
    },
    enabled: true,
    staleTime: 0,
  })
  const { data: fileStateRows = [] } = useFileStates(selectedLibrary)
  const statusTasks = useDownloadStatusTasks()
  const activeUploadBookUuid = useBookUploadBookUuid(selectedLibrary?.id)

  const isRemote = isRemoteSourceType(selectedLibrary?.sourceType)

  const fileStateBundle = useMemo<BookFileStateBundle>(() => {
    if (!selectedLibrary) {
      return EMPTY_FILE_STATE_BUNDLE
    }
    if (!isRemote || !selectedLibrary.dataSourceId) {
      const statuses: BookFileStateMap = {}
      for (const book of books) statuses[book.id] = "downloaded"
      return { statuses, rows: {} }
    }

    const statuses: BookFileStateMap = {}
    const rowsByBook: BookFileStateRowMap = {}
    for (const book of books) {
      const matchedRows = fileStateRows.filter((row) =>
        pathBelongsToBook(row.path, book.path),
      )
      rowsByBook[book.id] = matchedRows
      statuses[book.id] = matchedRows.some((row) => row.isLocallyAvailable)
        ? "downloaded"
        : "notDownloaded"
    }
    return { statuses, rows: rowsByBook }
  }, [books, fileStateRows, isRemote, selectedLibrary])

  const bookFormatMetaById = useMemo(() => {
    const map = new Map<string, BookFormatMeta>()
    for (const book of books) {
      const readableFormats =
        book.readableFormats ?? bookFormatsById[book.id] ?? []
      const effectiveFormat = resolveEffectiveFormat(
        readableFormats,
        selectedFormatById[book.id],
        book.preferredFormat,
      )
      map.set(book.id, { readableFormats, effectiveFormat })
    }
    return map
  }, [books, bookFormatsById, selectedFormatById])

  const selectedLibraryId = selectedLibrary?.id

  const tasksByBookId = useMemo(() => {
    const map = new Map<string, DownloadStatusTask[]>()
    if (!selectedLibraryId) return map

    let needPathLookup = false
    for (const task of statusTasks) {
      if (task.libraryId !== selectedLibraryId) continue
      if (
        task.status !== "queued" &&
        task.status !== "starting" &&
        task.status !== "downloading" &&
        task.status !== "done"
      )
        continue
      if (!task.bookId) {
        needPathLookup = true
        continue
      }
      const existing = map.get(task.bookId)
      if (existing) existing.push(task)
      else map.set(task.bookId, [task])
    }

    if (needPathLookup) {
      for (const task of statusTasks) {
        if (task.bookId) continue
        if (task.libraryId !== selectedLibraryId) continue
        if (
          task.status !== "queued" &&
          task.status !== "starting" &&
          task.status !== "downloading" &&
          task.status !== "done"
        )
          continue
        const book = books.find((candidate) =>
          pathBelongsToBook(task.relativePath, candidate.path),
        )
        if (!book) continue
        const existing = map.get(book.id)
        if (existing) existing.push(task)
        else map.set(book.id, [task])
      }
    }

    return map
  }, [statusTasks, books, selectedLibraryId])

  const bookDownloadStatusById = useMemo(() => {
    const next: BookFileStateMap = {}
    const { statuses, rows } = fileStateBundle

    for (const book of books) {
      if (!isRemote) {
        next[book.id] = statuses[book.id] ?? "downloaded"
        continue
      }
      const meta = bookFormatMetaById.get(book.id)
      const effectiveFormat = meta?.effectiveFormat
      const bookRows = rows[book.id] ?? []
      const isDownloadedByEffectiveFormat = effectiveFormat
        ? bookRows.some(
            (row) =>
              row.isLocallyAvailable &&
              getFormatFromPath(row.path) === effectiveFormat,
          )
        : false
      next[book.id] = isDownloadedByEffectiveFormat
        ? "downloaded"
        : "notDownloaded"
    }

    for (const [bookId, tasks] of tasksByBookId) {
      const meta = bookFormatMetaById.get(bookId)
      const effectiveFormat = meta?.effectiveFormat
      for (const task of tasks) {
        const taskFormat =
          task.format?.toUpperCase() ?? getFormatFromPath(task.relativePath)
        if (effectiveFormat && taskFormat !== effectiveFormat) continue
        if (task.status === "done") {
          next[bookId] = "downloaded"
        } else if (next[bookId] !== "downloaded") {
          next[bookId] = "downloading"
        }
      }
    }

    return next
  }, [bookFormatMetaById, books, fileStateBundle, isRemote, tasksByBookId])

  const bookTransferStatusById = useMemo(() => {
    const next: BookTransferStateMap = { ...bookDownloadStatusById }
    if (!isRemote) return next

    for (const book of books) {
      if (next[book.id] === "downloading") continue
      const isUploading =
        !!activeUploadBookUuid && book.uuid === activeUploadBookUuid
      const isNotAvailableRemotely = (fileStateBundle.rows[book.id] ?? []).some(
        (row) =>
          row.localState === "dirty_push" ||
          row.localState === "local_only" ||
          row.localState === "source_missing",
      )
      if (!isNotAvailableRemotely) continue
      next[book.id] = isUploading ? "uploading" : "uploadPending"
    }
    return next
  }, [
    activeUploadBookUuid,
    bookDownloadStatusById,
    books,
    fileStateBundle.rows,
    isRemote,
  ])

  const bookCanUploadById = useMemo(() => {
    const next: Record<string, boolean> = {}
    for (const book of books) {
      const isUploading =
        !!activeUploadBookUuid && book.uuid === activeUploadBookUuid
      next[book.id] =
        isRemote &&
        !isUploading &&
        (fileStateBundle.rows[book.id] ?? []).some(
          (row) =>
            row.isLocallyAvailable &&
            (row.localState === "dirty_push" ||
              row.localState === "local_only"),
        )
    }
    return next
  }, [activeUploadBookUuid, books, fileStateBundle.rows, isRemote])

  const bookCanDeleteDownloadById = useMemo(() => {
    const next: Record<string, boolean> = {}
    for (const book of books) {
      const effectiveFormat = bookFormatMetaById.get(book.id)?.effectiveFormat
      next[book.id] =
        isRemote &&
        (fileStateBundle.rows[book.id] ?? []).some(
          (row) =>
            row.localState === "present" &&
            (!effectiveFormat ||
              getFormatFromPath(row.path) === effectiveFormat),
        )
    }
    return next
  }, [bookFormatMetaById, books, fileStateBundle.rows, isRemote])

  const bookActiveFormatsById = useMemo(() => {
    const map = new Map<string, string>()
    for (const [bookId, tasks] of tasksByBookId) {
      for (const task of tasks) {
        if (task.status === "done") continue
        const fmt =
          task.format?.toUpperCase() ?? getFormatFromPath(task.relativePath)
        if (fmt) {
          map.set(bookId, fmt)
          break
        }
      }
    }
    return map
  }, [tasksByBookId])

  return {
    bookFormatsById,
    bookFormatMetaById,
    fileStateBundle,
    bookDownloadStatusById,
    bookTransferStatusById,
    bookCanUploadById,
    bookCanDeleteDownloadById,
    bookActiveFormatsById,
  }
}
