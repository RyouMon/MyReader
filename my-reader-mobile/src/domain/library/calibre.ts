import type { BookDetail, CalibreBook } from "@my-reader/tools/types/book"
import { Directory, File as FSFile } from "expo-file-system"
import i18n from "@/src/i18n"
import {
  ensureLibrarySidecarDirectory,
  libraryMetadataUri,
  libraryRootUri,
  resolveCoverUri,
} from "@/src/services/fs/library-paths"
import { fileUriFor } from "@/src/services/fs/path"
import { showAlertWithStatusBarRestore } from "../../constants/alert-with-status-bar"
import {
  getCalibreBookFormat,
  getCalibreBookDetail,
  listCalibreBookFormats,
  listCalibreBookSummaries,
  listCalibreBooks,
} from "../../services/core/catalog"
import {
  createSecurityScopedBookmark,
  withSecurityScopedLibraryAccess,
} from "../../services/fs/bookmarks"
import { queryClient } from "../../services/query/query-client"
import type { BookItem, DataSource, Library } from "../types"
import { isRemoteSourceType } from "../types"
import {
  resolveLocalLibraryMetadataUri,
  withLocalLibraryCalibreRoot,
} from "./local-library-content"

type PickedDirectoryLike = {
  uri: string
  name?: string
}

export type PickedCalibreLibrary = PickedDirectoryLike & {
  securityScopedBookmark?: Library["securityScopedBookmark"]
}

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

export async function pickCalibreLibrary(): Promise<PickedCalibreLibrary | null> {
  let directory: PickedDirectoryLike | null = null

  try {
    directory = await Directory.pickDirectoryAsync()
  } catch {
    return null
  }

  if (directory == null) {
    return null
  }

  const securityScopedBookmark = await createSecurityScopedBookmark(
    directory.uri,
  )
  return {
    uri: securityScopedBookmark?.resolvedUri ?? directory.uri,
    name:
      directory.name ||
      new Directory(directory.uri).name ||
      i18n.t("common.unnamedLibrary"),
    securityScopedBookmark: securityScopedBookmark ?? undefined,
  }
}

export async function ensureLibraryMetadataCached(
  library: Library,
): Promise<Library> {
  if (isRemoteSourceType(library.sourceType)) {
    ensureLibrarySidecarDirectory(library)
    return { ...library, metadataUri: libraryMetadataUri(library) }
  }

  ensureLibrarySidecarDirectory(library)
  const metadataUri = await resolveLocalLibraryMetadataUri(library)
  return {
    ...library,
    metadataUri: metadataUri ?? libraryMetadataUri(library),
  }
}

async function resolveMetadataUriForRead(
  library: Library,
): Promise<string | null> {
  if (isRemoteSourceType(library.sourceType)) {
    const metadataUri = libraryMetadataUri(library)
    const currentMetadata = new FSFile(metadataUri)
    if (currentMetadata.exists && (currentMetadata.size ?? 0) > 0) {
      return metadataUri
    }
    return null
  }

  try {
    const metadataUri = await resolveLocalLibraryMetadataUri(library)
    if (!metadataUri) {
      showAlertWithStatusBarRestore(
        i18n.t("sync.corruptedLibrary"),
        i18n.t("sync.corruptedLibraryMessage"),
        [{ text: i18n.t("common.gotIt") }],
      )
    }
    return metadataUri
  } catch {
    showAlertWithStatusBarRestore(
      i18n.t("sync.corruptedLibrary"),
      i18n.t("sync.corruptedLibraryMessage"),
      [{ text: i18n.t("common.gotIt") }],
    )
    return null
  }
}

export async function readBookDetailFromMetadata(
  library: Library,
  calibreBookId: number,
): Promise<BookDetail | null> {
  const metadataUri = await resolveMetadataUriForRead(library)
  if (!metadataUri) {
    return null
  }

  return withLocalLibraryCalibreRoot(library, (calibreRootUri) =>
    getCalibreBookDetail(calibreRootUri, calibreBookId),
  )
}

async function lookupBookFileRelativePath(
  library: Library,
  calibreBookId: number,
  format: string,
): Promise<string> {
  const metadataUri = await resolveMetadataUriForRead(library)
  if (!metadataUri) {
    throw new Error(i18n.t("sync.metadataDbNotAvailable"))
  }

  const row = await withLocalLibraryCalibreRoot(library, (calibreRootUri) =>
    getCalibreBookFormat(calibreRootUri, calibreBookId, format),
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
  const metadataUri = await resolveMetadataUriForRead(library)
  if (!metadataUri) {
    return []
  }

  const formats = await withLocalLibraryCalibreRoot(library, (calibreRootUri) =>
    listCalibreBookFormats(calibreRootUri, calibreBookId),
  )
  return formats.map((item) => ({
    format: item.format.toUpperCase(),
    relativePath: item.relativePath,
  }))
}

export async function getAllBookFormats(
  library: Library,
): Promise<Record<string, string[]>> {
  const metadataUri = await resolveMetadataUriForRead(library)
  if (!metadataUri) {
    return {}
  }

  const books = await withLocalLibraryCalibreRoot(library, (calibreRootUri) =>
    listCalibreBookSummaries(calibreRootUri),
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

/** Opens a Calibre book file from the content root (bookmark direct read on iOS). */
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

  if (library.securityScopedBookmark) {
    const { result: sourceFile } = await withSecurityScopedLibraryAccess(
      library,
      async (resolvedPath) => {
        const file = createBookFile(resolvedPath, relativePath)
        assertBookFileExists(file, resolvedPath, relativePath)
        return file
      },
    )
    return sourceFile
  }

  const libraryRoot = libraryRootUri(library)
  const sourceFile = createBookFile(libraryRoot, relativePath)
  assertBookFileExists(sourceFile, libraryRoot, relativePath)
  return sourceFile
}

export async function readBooksFromLibrary(
  library: Library,
): Promise<BookItem[]> {
  return withLocalLibraryCalibreRoot(library, async (calibreRootUri) => {
    const rows = await listCalibreBooks(calibreRootUri)
    if (rows.length === 0) {
      return []
    }
    return mapListRowsToBookItems(library, rows)
  })
}

export const libraryQueryKeys = {
  books: (libraryId: string | null) => ["books", libraryId] as const,
}

export function getBooksForLibrary(libraryId: string): BookItem[] {
  return (
    queryClient.getQueryData<BookItem[]>(libraryQueryKeys.books(libraryId)) ??
    []
  )
}

/** Reads the book list for a library (remote ops or local metadata.db). */
export async function fetchBooksWithMeta(
  library: Library,
  dataSources: DataSource[],
): Promise<{ books: BookItem[]; metadataUri?: string }> {
  const { createRemoteOps } = await import("./remote-library")
  const ops = await createRemoteOps(library, dataSources)
  if (ops) {
    const { books, metadataUri } = await ops.readBooks(library)
    return { books, metadataUri }
  }

  const books = await readBooksFromLibrary(library)
  return { books, metadataUri: libraryMetadataUri(library) }
}

export async function fetchBooks(
  library: Library,
  dataSources: DataSource[],
): Promise<BookItem[]> {
  const { books } = await fetchBooksWithMeta(library, dataSources)
  return books
}
