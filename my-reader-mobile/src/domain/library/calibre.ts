import { Directory, File as FSFile } from "expo-file-system"

import i18n from "@/src/i18n"
import type {
  BookDetail,
  BookIdentifier,
  FormatSize,
} from "@my-reader/tools/types/book"
import { showAlertWithStatusBarRestore } from "../../constants/alert-with-status-bar"
import { fetchBookDetailRows } from "../../repos/calibre/book_relations"
import {
  countBooks,
  listBooksWithAuthors,
  type BookWithAuthorsRow,
} from "../../repos/calibre/books"
import {
  getBookFormatRows,
  listAllFormatRows,
  lookupBookFileRow,
} from "../../repos/calibre/data"
import {
  createSecurityScopedBookmark,
  withSecurityScopedLibraryAccess,
} from "../../services/fs/bookmarks"
import { fileUriFor, joinRelativePath } from "@/src/services/fs/path"
import {
  ensureLibrarySidecarDirectory,
  libraryLocalRootUri,
  libraryMetadataUri,
  METADATA_DB_RELATIVE,
  resolveCoverUri,
} from "@/src/services/fs/library-paths"
import {
  resolveLocalLibraryMetadataUri,
  withLocalLibraryCalibreRoot,
} from "./local-library-content"
import { queryClient } from "../../services/query/query-client"
import type { BookItem, DataSource, Library } from "../types"
import { isRemoteSourceType } from "../types"

type PickedDirectoryLike = {
  uri: string
  name?: string
  list?: () => unknown[]
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function getMetadataFileFromDirectory(directory: PickedDirectoryLike) {
  const typedDirectory = new Directory(directory.uri)
  const entries = (directory.list?.() ?? typedDirectory.list()) as unknown[]
  const metadata = entries.find(
    (entry) => entry instanceof FSFile && entry.name === METADATA_DB_RELATIVE,
  )

  return metadata instanceof FSFile ? metadata : null
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
  rows: BookWithAuthorsRow[],
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
    const hasCover = (row.hasCover ?? 0) !== 0
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
      path: row.path || undefined,
      hasCover,
      timestamp: row.timestamp,
      coverUri,
    } satisfies BookItem
  })
}

export async function pickCalibreLibrary(): Promise<Library | null> {
  let directory: PickedDirectoryLike | null = null

  try {
    directory = await Directory.pickDirectoryAsync()
  } catch {
    return null
  }

  if (directory == null) {
    return null
  }

  const metadataFile = getMetadataFileFromDirectory(directory)

  if (!metadataFile) {
    showAlertWithStatusBarRestore(
      i18n.t("sync.metadataNotFound"),
      i18n.t("sync.metadataNotFoundDetail"),
      [{ text: i18n.t("common.gotIt") }],
    )
    return null
  }

  const libraryRoot = directory
  const id = createId()
  const securityScopedBookmark = await createSecurityScopedBookmark(
    libraryRoot.uri,
  )
  const resolvedPath = securityScopedBookmark?.resolvedUri ?? libraryRoot.uri

  const draftLibrary: Library = {
    id,
    name:
      libraryRoot.name ||
      new Directory(libraryRoot.uri).name ||
      i18n.t("common.unnamedLibrary"),
    path: resolvedPath,
    metadataUri: "",
    bookCount: 0,
    addedAt: Date.now(),
    securityScopedBookmark: securityScopedBookmark ?? undefined,
  }

  ensureLibrarySidecarDirectory(draftLibrary)
  const { library } = await readBookCountFromLibrary(draftLibrary)
  return library
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

export async function forceRefreshLibraryMetadata(
  library: Library,
): Promise<Library> {
  if (isRemoteSourceType(library.sourceType)) {
    return { ...library, metadataUri: libraryMetadataUri(library) }
  }

  ensureLibrarySidecarDirectory(library)
  const metadataUri = await resolveLocalLibraryMetadataUri(library)
  if (!metadataUri) {
    throw new Error(i18n.t("sync.notValidCalibreLibrary"))
  }

  const bookCount = await withLocalLibraryCalibreRoot(
    library,
    (calibreRootUri) =>
      countBooks(fileUriFor(calibreRootUri, METADATA_DB_RELATIVE)),
  )

  return {
    ...library,
    metadataUri,
    bookCount,
  }
}

export async function readBookCountFromLibrary(library: Library) {
  const nextLibrary = await ensureLibraryMetadataCached(library)
  const metadataUri = nextLibrary.metadataUri ?? libraryMetadataUri(nextLibrary)
  const bookCount = await withLocalLibraryCalibreRoot(
    library,
    (calibreRootUri) =>
      countBooks(fileUriFor(calibreRootUri, METADATA_DB_RELATIVE)),
  )

  return {
    library: {
      ...nextLibrary,
      metadataUri,
      bookCount,
    },
    bookCount,
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

  const rows = await fetchBookDetailRows(metadataUri, calibreBookId)
  const book = rows.book
  if (!book) {
    return null
  }

  const bookAuthors = rows.authorRows.map((r) => r.name ?? "").filter(Boolean)
  const bookTags = rows.tagRows.map((r) => r.name ?? "").filter(Boolean)
  const bookLanguages = rows.languageRows
    .map((r) => r.langCode ?? "")
    .filter(Boolean)
  const formats = rows.formatRows.map((r) => (r.format ?? "").toUpperCase())

  const seriesIndexRaw = book.seriesIndex
  const seriesIndex =
    seriesIndexRaw !== null &&
    seriesIndexRaw !== undefined &&
    !Number.isNaN(Number(seriesIndexRaw))
      ? Number(seriesIndexRaw)
      : null

  const formatSizes: FormatSize[] = rows.formatRows.map((r) => ({
    format: (r.format ?? "").toUpperCase(),
    sizeBytes: Math.trunc(Number(r.uncompressedSize ?? 0)),
  }))

  const bookIdentifiers: BookIdentifier[] = rows.identifierRows
    .map((r) => ({
      idType: r.type ?? "isbn",
      value: r.val ?? "",
    }))
    .filter((id) => id.value.length > 0)

  const ratingRaw = rows.ratingRow?.rating
  const rating =
    ratingRaw !== null &&
    ratingRaw !== undefined &&
    !Number.isNaN(Number(ratingRaw))
      ? Math.round(Number(ratingRaw))
      : null

  return {
    id: book.id,
    title: book.title || i18n.t("common.unnamedBook"),
    titleSort: book.sort ?? "",
    authorSort: book.authorSort ?? "",
    authors: bookAuthors,
    tags: bookTags,
    series: rows.seriesRow?.name ?? null,
    seriesIndex,
    formats,
    hasCover: (book.hasCover ?? 0) !== 0,
    path: book.path ?? "",
    timestamp: book.timestamp,
    pubdate: book.pubdate,
    lastModified: book.lastModified,
    comment: rows.commentRow?.text ?? null,
    publisher: rows.publisherRow?.name ?? null,
    languages: bookLanguages,
    rating,
    uuid: book.uuid,
    formatSizes,
    identifiers: bookIdentifiers,
  } satisfies BookDetail
}

async function lookupBookFileLocation(
  library: Library,
  calibreBookId: number,
  format: string,
): Promise<{ rowPath: string; fileName: string; segments: string[] }> {
  const metadataUri = await resolveMetadataUriForRead(library)
  if (!metadataUri) {
    throw new Error(i18n.t("sync.metadataDbNotAvailable"))
  }

  const row = await lookupBookFileRow(metadataUri, calibreBookId, format)
  if (!row) {
    throw new Error(
      i18n.t("sync.formatNotFoundInLibrary", { format, id: calibreBookId }),
    )
  }

  return {
    rowPath: row.path,
    fileName: `${row.name}.${format.toLowerCase()}`,
    segments: row.path.split("/").filter(Boolean),
  }
}

export async function getBookFormatPaths(
  library: Library,
  calibreBookId: number,
): Promise<{ format: string; relativePath: string }[]> {
  const metadataUri = await resolveMetadataUriForRead(library)
  if (!metadataUri) {
    return []
  }

  const { bookPath, formats } = await getBookFormatRows(
    metadataUri,
    calibreBookId,
  )
  if (!bookPath) {
    return []
  }

  return formats.map((r) => ({
    format: (r.format ?? "").toUpperCase(),
    relativePath: joinRelativePath(
      bookPath,
      `${r.name}.${(r.format ?? "").toLowerCase()}`,
    ),
  }))
}

export async function getAllBookFormats(
  library: Library,
): Promise<Record<string, string[]>> {
  const metadataUri = await resolveMetadataUriForRead(library)
  if (!metadataUri) {
    return {}
  }

  const rows = await listAllFormatRows(metadataUri)

  return rows.reduce<Record<string, string[]>>((mapped, row) => {
    const bookIdKey = String(row.bookId)
    mapped[bookIdKey] = mapped[bookIdKey] ?? []
    const upper = (row.format ?? "").toUpperCase()
    if (!mapped[bookIdKey].includes(upper)) {
      mapped[bookIdKey].push(upper)
    }
    return mapped
  }, {})
}

function createBookFile(rootUri: string, segments: string[], fileName: string) {
  const bookPath = segments.join("/")
  return new FSFile(fileUriFor(rootUri, joinRelativePath(bookPath, fileName)))
}

function assertBookFileExists(
  bookFile: FSFile,
  libraryPath: string,
  rowPath: string,
) {
  if (!bookFile.exists) {
    throw new Error(
      i18n.t("sync.bookFileNotFoundDetail", {
        uri: bookFile.uri,
        libraryPath,
        rowPath,
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
  const { rowPath, fileName, segments } = await lookupBookFileLocation(
    library,
    calibreBookId,
    format,
  )

  if (library.securityScopedBookmark) {
    const { result: sourceFile } = await withSecurityScopedLibraryAccess(
      library,
      async (resolvedPath) => {
        const file = createBookFile(resolvedPath, segments, fileName)
        assertBookFileExists(file, resolvedPath, rowPath)
        return file
      },
    )
    return sourceFile
  }

  const sourceFile = createBookFile(
    libraryLocalRootUri(library),
    segments,
    fileName,
  )
  assertBookFileExists(sourceFile, libraryLocalRootUri(library), rowPath)
  return sourceFile
}

export async function readBooksFromLibrary(
  library: Library,
): Promise<BookItem[]> {
  return withLocalLibraryCalibreRoot(library, async (calibreRootUri) => {
    const metadataUri = fileUriFor(calibreRootUri, METADATA_DB_RELATIVE)
    const rows = await listBooksWithAuthors(metadataUri)
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
