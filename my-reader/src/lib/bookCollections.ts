import type { BuiltInBookCollectionId } from "@my-reader/tools/types/book-collection"
import type { CalibreBook } from "@my-reader/tools/types/book"
import { resolveReadFormat } from "@my-reader/tools/utils"
import type { LibrarySortOption } from "@/types/libraryUi"

export type SpecialBookCollectionId = Extract<
  BuiltInBookCollectionId,
  "downloaded" | "downloading" | "uploading" | "localOnly"
>

type CollectionFileState = {
  bookId: number
  format: string
  localState: string
}

type CollectionDownloadTask = {
  bookId: number
  format: string
}

type SelectBooksForSpecialCollectionInput = {
  books: CalibreBook[]
  collectionId: SpecialBookCollectionId
  fileStates: CollectionFileState[]
  downloadQueue: CollectionDownloadTask[]
  pendingUploadBookUuids: string[]
  selectedFormatById: Record<string, string>
  isRemoteLibrary: boolean
  query: string
  sortBy: LibrarySortOption
}

const LOCALLY_AVAILABLE_STATES = new Set([
  "present",
  "local_only",
  "dirty_push",
])

export function isSpecialBookCollectionId(
  collectionId: BuiltInBookCollectionId,
): collectionId is SpecialBookCollectionId {
  return (
    collectionId === "downloaded" ||
    collectionId === "downloading" ||
    collectionId === "uploading" ||
    collectionId === "localOnly"
  )
}

function matchesSearch(book: CalibreBook, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true

  return [
    book.title,
    book.authorSort,
    book.series ?? "",
    ...book.authors,
    ...book.tags,
  ]
    .join(" ")
    .toLowerCase()
    .includes(needle)
}

function sortBooks(
  books: CalibreBook[],
  sortBy: LibrarySortOption,
): CalibreBook[] {
  const sorted = [...books]
  if (sortBy === "author") {
    sorted.sort((left, right) =>
      left.authorSort.localeCompare(right.authorSort),
    )
  } else if (sortBy === "recent" || sortBy === "progress") {
    sorted.sort((left, right) =>
      (right.timestamp ?? "").localeCompare(left.timestamp ?? ""),
    )
  } else {
    sorted.sort((left, right) => left.title.localeCompare(right.title))
  }
  return sorted
}

export function selectBooksForSpecialCollection({
  books,
  collectionId,
  fileStates,
  downloadQueue,
  pendingUploadBookUuids,
  selectedFormatById,
  isRemoteLibrary,
  query,
  sortBy,
}: SelectBooksForSpecialCollectionInput): CalibreBook[] {
  const fileStatesByBookId = new Map<number, CollectionFileState[]>()
  for (const state of fileStates) {
    const current = fileStatesByBookId.get(state.bookId)
    if (current) current.push(state)
    else fileStatesByBookId.set(state.bookId, [state])
  }

  const downloadingBookIds = new Set(downloadQueue.map((entry) => entry.bookId))
  const pendingUploadUuids = new Set(pendingUploadBookUuids)

  const collectionBooks = books.filter((book) => {
    const states = fileStatesByBookId.get(book.id) ?? []
    switch (collectionId) {
      case "downloaded": {
        if (!isRemoteLibrary) return true
        const readableFormats = book.readableFormats.map((format) =>
          format.toUpperCase(),
        )
        const effectiveFormat = resolveReadFormat(
          readableFormats,
          book.preferredFormat ?? readableFormats[0],
          selectedFormatById[String(book.id)],
        )
        return Boolean(
          effectiveFormat &&
            states.some(
              (state) =>
                state.format.toUpperCase() === effectiveFormat &&
                LOCALLY_AVAILABLE_STATES.has(state.localState),
            ),
        )
      }
      case "downloading":
        return downloadingBookIds.has(book.id)
      case "uploading":
        return Boolean(book.uuid && pendingUploadUuids.has(book.uuid))
      case "localOnly":
        return (
          isRemoteLibrary &&
          states.some(
            (state) =>
              state.localState === "local_only" ||
              state.localState === "dirty_push",
          )
        )
    }
  })

  return sortBooks(
    collectionBooks.filter((book) => matchesSearch(book, query)),
    sortBy,
  )
}
