import type { BookDetail, CalibreBook } from "@my-reader/tools/types/book"
import { libraryTypeOf } from "@my-reader/tools/types/library"
import { File as FSFile } from "expo-file-system"
import i18n from "@/src/i18n"
import {
  ensureLibrarySidecarDirectory,
  libraryMetadataUri,
  librarySidecarRootUri,
  resolveCoverUri,
} from "@/src/services/fs/library-paths"
import { fileUriFor } from "@/src/services/fs/path"
import { showAlertWithStatusBarRestore } from "../../constants/alert-with-status-bar"
import {
  deleteLocalBook as deleteLocalBookFromCore,
  getLibraryBookDetail,
  getLibraryBookFormat,
  importLocalBook as importLocalBookThroughCore,
  importRemoteBook as importRemoteBookThroughCore,
  listLibraryBookFormats,
  listLibraryBookSummaries,
  listLibraryBooks,
  updateLocalBookMetadata as updateLocalBookMetadataThroughCore,
} from "../../services/core/catalog"
import { queryClient } from "../../services/query/query-client"
import type { BookItem, DataSource, Library } from "../types"
import { isRemoteSourceType } from "../types"
import {
  resolveLocalLibraryMetadataUri,
  withLocalLibraryContentRoot,
} from "../../services/fs/local-library-content"
import { requestPendingBookUploads } from "@/src/domain/sync/book-upload-store"
import { refreshRemoteLibrary } from "@/src/services/core/remote"

export function buildCoverUri(
  library: Library,
  bookPath: string,
  hasCover: boolean,
): BookItem["coverUri"] | undefined {
  return resolveCoverUri(library, bookPath, hasCover)
}

export function mapListRowsToBookItems(
  library: Library,
  rows: CalibreBook[],
  options?: {
    buildCoverUri?: (
      lib: Library,
      bookPath: string,
      hasCover: boolean,
    ) => BookItem["coverUri"]
  },
): BookItem[] {
  const resolveCover =
    options?.buildCoverUri ??
    ((lib, bookPath, hasCover) => resolveCoverUri(lib, bookPath, hasCover))

  return rows.map((row) => {
    const hasCover = row.hasCover
    const coverUri =
      row.path && hasCover ? resolveCover(library, row.path, true) : undefined

    return {
      id: `${row.id}`,
      uuid: row.uuid ?? undefined,
      calibreId: row.id,
      title: row.title || i18n.t("common.unnamedBook"),
      author:
        row.authors[0] || row.authorSort || i18n.t("common.unknownAuthor"),
      authors: row.authors,
      formats: row.formats,
      readableFormats: row.readableFormats,
      preferredFormat: row.preferredFormat,
      path: row.path || undefined,
      hasCover,
      timestamp: row.timestamp,
      coverUri,
    } satisfies BookItem
  })
}

export async function ensureLibraryMetadataCached(
  library: Library,
): Promise<Library> {
  ensureLibrarySidecarDirectory(library)
  if (libraryTypeOf(library) === "myreader") {
    return { ...library, metadataUri: undefined }
  }
  if (
    !isRemoteSourceType(library.sourceType) &&
    library.securityScopedBookmark
  ) {
    const metadataUri = await resolveLocalLibraryMetadataUri(library)
    return { ...library, metadataUri: metadataUri ?? undefined }
  }
  return { ...library, metadataUri: libraryMetadataUri(library) }
}

async function catalogIsAvailable(library: Library): Promise<boolean> {
  return (
    libraryTypeOf(library) === "myreader" ||
    (await resolveMetadataUriForRead(library)) !== null
  )
}

async function resolveMetadataUriForRead(
  library: Library,
): Promise<string | null> {
  const metadataUri =
    !isRemoteSourceType(library.sourceType) && library.securityScopedBookmark
      ? await resolveLocalLibraryMetadataUri(library)
      : libraryMetadataUri(library)
  if (!metadataUri) {
    showAlertWithStatusBarRestore(
      i18n.t("sync.corruptedLibrary"),
      i18n.t("sync.corruptedLibraryMessage"),
      [{ text: i18n.t("common.gotIt") }],
    )
    return null
  }
  const currentMetadata = new FSFile(metadataUri)
  if (currentMetadata.exists && (currentMetadata.size ?? 0) > 0) {
    return metadataUri
  }
  showAlertWithStatusBarRestore(
    i18n.t("sync.corruptedLibrary"),
    i18n.t("sync.corruptedLibraryMessage"),
    [{ text: i18n.t("common.gotIt") }],
  )
  return null
}

export async function readBookDetailFromMetadata(
  library: Library,
  calibreBookId: number,
): Promise<BookDetail | null> {
  if (!(await catalogIsAvailable(library))) {
    return null
  }

  return withLocalLibraryContentRoot(library, (contentRootUri) =>
    getLibraryBookDetail(
      library,
      contentRootUri,
      librarySidecarRootUri(library),
      calibreBookId,
    ),
  )
}

async function lookupBookFileRelativePath(
  library: Library,
  calibreBookId: number,
  format: string,
): Promise<string> {
  if (!(await catalogIsAvailable(library))) {
    throw new Error(i18n.t("sync.metadataDbNotAvailable"))
  }

  const row = await withLocalLibraryContentRoot(library, (contentRootUri) =>
    getLibraryBookFormat(
      library,
      contentRootUri,
      librarySidecarRootUri(library),
      calibreBookId,
      format,
    ),
  )
  if (!row) {
    throw new Error(
      i18n.t("sync.formatNotFoundInLibrary", { format, id: calibreBookId }),
    )
  }

  return row.relativePath
}

export async function getBookFormatPaths(
  library: Library,
  calibreBookId: number,
): Promise<{ format: string; relativePath: string }[]> {
  if (!(await catalogIsAvailable(library))) {
    return []
  }

  const formats = await withLocalLibraryContentRoot(library, (contentRootUri) =>
    listLibraryBookFormats(
      library,
      contentRootUri,
      librarySidecarRootUri(library),
      calibreBookId,
    ),
  )
  return formats.map((item) => ({
    format: item.format.toUpperCase(),
    relativePath: item.relativePath,
  }))
}

export async function getAllBookFormats(
  library: Library,
): Promise<Record<string, string[]>> {
  if (!(await catalogIsAvailable(library))) {
    return {}
  }

  const books = await withLocalLibraryContentRoot(library, (contentRootUri) =>
    listLibraryBookSummaries(
      library,
      contentRootUri,
      librarySidecarRootUri(library),
    ),
  )
  return Object.fromEntries(
    books.map((book) => [String(book.id), book.readableFormats]),
  )
}

function createBookFile(rootUri: string, relativePath: string) {
  return new FSFile(fileUriFor(rootUri, relativePath))
}

function assertBookFileExists(
  bookFile: FSFile,
  libraryPath: string,
  relativePath: string,
) {
  if (!bookFile.exists) {
    throw new Error(
      i18n.t("sync.bookFileNotFoundDetail", {
        uri: bookFile.uri,
        libraryPath,
        rowPath: relativePath,
      }),
    )
  }
}

/** Resolves a book file from the internal or authorized external content root. */
export async function resolveBookFileForRead(
  library: Library,
  calibreBookId: number,
  format: string,
): Promise<FSFile> {
  const relativePath = await lookupBookFileRelativePath(
    library,
    calibreBookId,
    format,
  )

  return withLocalLibraryContentRoot(library, async (libraryRoot) => {
    const sourceFile = createBookFile(libraryRoot, relativePath)
    assertBookFileExists(sourceFile, libraryRoot, relativePath)
    return sourceFile
  })
}

export async function readBooksFromLibrary(
  library: Library,
  dataSources: DataSource[],
): Promise<BookItem[]> {
  return withLocalLibraryContentRoot(library, async (contentRootUri) => {
    const rows = await listLibraryBooks(
      library,
      contentRootUri,
      librarySidecarRootUri(library),
    )
    if (rows.length === 0) {
      return []
    }
    const { createRemoteOps } = await import("./remote-library")
    const remoteOps = await createRemoteOps(library, dataSources)
    return mapListRowsToBookItems(library, rows, {
      buildCoverUri: remoteOps?.buildCoverUri,
    })
  })
}

export const libraryQueryKeys = {
  books: (libraryId: string | null) => ["books", libraryId] as const,
  pendingImports: (libraryId: string | null) =>
    ["pending-book-imports", libraryId] as const,
}

export function getBooksForLibrary(libraryId: string): BookItem[] {
  return (
    queryClient.getQueryData<BookItem[]>(libraryQueryKeys.books(libraryId)) ??
    []
  )
}

async function ensureRemoteCalibreMetadata(
  library: Library,
  dataSources: DataSource[],
): Promise<Library | null> {
  if (
    libraryTypeOf(library) !== "calibre" ||
    !isRemoteSourceType(library.sourceType)
  ) {
    return library
  }

  const metadata = new FSFile(libraryMetadataUri(library))
  if (metadata.exists && (metadata.size ?? 0) > 0) {
    return library
  }

  const source = dataSources.find(
    (candidate) =>
      candidate.id === library.dataSourceId &&
      (candidate.type === "webdav" || candidate.type === "onedrive"),
  )
  if (!source) return library

  try {
    return (await refreshRemoteLibrary(library, source)).library
  } catch (error) {
    console.error("[library-catalog] remote metadata refresh failed:", {
      libraryId: library.id,
      sourceType: library.sourceType,
      error,
    })
    showAlertWithStatusBarRestore(
      i18n.t("sync.corruptedLibrary"),
      i18n.t("sync.corruptedLibraryMessage"),
      [{ text: i18n.t("common.gotIt") }],
    )
    return null
  }
}

export async function fetchBooks(
  library: Library,
  dataSources: DataSource[],
): Promise<BookItem[]> {
  const readableLibrary = await ensureRemoteCalibreMetadata(
    library,
    dataSources,
  )
  if (!readableLibrary) return []
  return readBooksFromLibrary(readableLibrary, dataSources)
}

export async function importBookIntoLibrary(
  library: Library,
  input: {
    sourceFileUri: string
    sourceFileName?: string
    title?: string
    authors: string[]
    consumeSourceFile: boolean
  },
): Promise<CalibreBook> {
  ensureLibrarySidecarDirectory(library)
  return withLocalLibraryContentRoot(library, async (libraryRootUri) => {
    if (isRemoteSourceType(library.sourceType)) {
      const book = await importRemoteBookThroughCore(
        library,
        libraryRootUri,
        librarySidecarRootUri(library),
        input,
      )
      requestPendingBookUploads(library.id, book.uuid ?? undefined)
      return book
    }
    return importLocalBookThroughCore(
      library,
      libraryRootUri,
      librarySidecarRootUri(library),
      input,
    )
  })
}

export async function updateBookMetadataInLibrary(
  library: Library,
  input: { bookId: number; title: string; authors: string[] },
): Promise<CalibreBook> {
  return withLocalLibraryContentRoot(library, (libraryRootUri) =>
    updateLocalBookMetadataThroughCore(
      library,
      libraryRootUri,
      librarySidecarRootUri(library),
      input,
    ),
  )
}

export async function deleteBookFromLibrary(
  library: Library,
  bookId: number,
): Promise<void> {
  return withLocalLibraryContentRoot(library, (libraryRootUri) =>
    deleteLocalBookFromCore(
      library,
      libraryRootUri,
      librarySidecarRootUri(library),
      bookId,
    ),
  )
}
