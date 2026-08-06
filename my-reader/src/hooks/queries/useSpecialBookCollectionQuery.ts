import type { BuiltInBookCollectionId } from "@my-reader/tools/types/book-collection"
import type { CalibreBook } from "@my-reader/tools/types/book"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { useDownloadQueue } from "@/hooks/useDownloadProgress"
import {
  isSpecialBookCollectionId,
  selectBooksForSpecialCollection,
} from "@/lib/bookCollections"
import { api } from "@/lib/tauri-api"
import type { LibrarySortOption } from "@/types/libraryUi"
import { bookFileStateKeys, type BookFileState } from "./useBookFileState"
import { usePendingBookUploads } from "./usePendingBookUploadsQuery"

export const specialBookCollectionKeys = {
  all: ["specialBookCollections"] as const,
  catalog: (libraryId: string) =>
    [...specialBookCollectionKeys.all, libraryId] as const,
}

type UseSpecialBookCollectionInput = {
  libraryId: string | null
  collectionId: BuiltInBookCollectionId
  sortBy: LibrarySortOption
  search: string
  selectedFormatById: Record<string, string>
  isRemoteLibrary: boolean
}

export function useSpecialBookCollection({
  libraryId,
  collectionId,
  sortBy,
  search,
  selectedFormatById,
  isRemoteLibrary,
}: UseSpecialBookCollectionInput) {
  const queryClient = useQueryClient()
  const enabled = Boolean(libraryId && isSpecialBookCollectionId(collectionId))
  const booksQuery = useQuery<CalibreBook[], Error>({
    queryKey: specialBookCollectionKeys.catalog(libraryId ?? ""),
    queryFn: () => api.getBooks(libraryId),
    enabled,
  })
  const downloadQueue = useDownloadQueue(libraryId)
  const pendingUploadsQuery = usePendingBookUploads(
    libraryId,
    enabled && collectionId === "uploading" && isRemoteLibrary,
  )

  const fileStateLookups = useMemo(() => {
    if (
      !enabled ||
      !isRemoteLibrary ||
      (collectionId !== "downloaded" && collectionId !== "localOnly")
    ) {
      return []
    }

    const seen = new Set<string>()
    const lookups: Array<{ bookId: number; format: string }> = []
    for (const book of booksQuery.data ?? []) {
      for (const rawFormat of book.readableFormats) {
        const format = rawFormat.toUpperCase()
        const signature = `${book.id}:${format}`
        if (seen.has(signature)) continue
        seen.add(signature)
        lookups.push({ bookId: book.id, format })
      }
    }
    return lookups
  }, [booksQuery.data, collectionId, enabled, isRemoteLibrary])
  const fileStateSignature = fileStateLookups
    .map((lookup) => `${lookup.bookId}:${lookup.format}`)
    .join(",")
  const fileStatesQuery = useQuery({
    queryKey: [
      ...bookFileStateKeys.library(libraryId ?? ""),
      "collections",
      fileStateSignature,
    ],
    queryFn: async () => {
      if (!libraryId) return []
      const rows = await api.checkBookFileStates(libraryId, fileStateLookups)
      for (const row of rows) {
        queryClient.setQueryData<BookFileState>(
          bookFileStateKeys.detail(libraryId, row.bookId, row.format),
          {
            path: row.path,
            localState: row.localState,
            localSize: row.localSize,
          },
        )
      }
      return rows
    },
    enabled: Boolean(libraryId && fileStateLookups.length > 0),
  })

  const items = useMemo(() => {
    if (!isSpecialBookCollectionId(collectionId)) return []
    return selectBooksForSpecialCollection({
      books: booksQuery.data ?? [],
      collectionId,
      fileStates: fileStatesQuery.data ?? [],
      downloadQueue,
      pendingUploadBookUuids: pendingUploadsQuery.data ?? [],
      selectedFormatById,
      isRemoteLibrary,
      query: search,
      sortBy,
    })
  }, [
    booksQuery.data,
    collectionId,
    downloadQueue,
    fileStatesQuery.data,
    isRemoteLibrary,
    pendingUploadsQuery.data,
    search,
    selectedFormatById,
    sortBy,
  ])
  const books = useMemo(
    () => new Map(items.map((book, index) => [index, book])),
    [items],
  )
  const needsFileStates =
    isRemoteLibrary &&
    (collectionId === "downloaded" || collectionId === "localOnly") &&
    fileStateLookups.length > 0
  const initialLoading =
    booksQuery.isLoading ||
    (needsFileStates && fileStatesQuery.isLoading) ||
    (collectionId === "uploading" && pendingUploadsQuery.isLoading)
  const error =
    booksQuery.error ??
    (needsFileStates ? fileStatesQuery.error : null) ??
    (collectionId === "uploading" ? pendingUploadsQuery.error : null)

  return {
    books,
    total: items.length,
    initialLoading,
    error: error ? String(error) : null,
    ensureRange: () => undefined,
    refresh: () => {
      void booksQuery.refetch()
      if (needsFileStates) void fileStatesQuery.refetch()
      if (collectionId === "uploading") void pendingUploadsQuery.refetch()
    },
  }
}
