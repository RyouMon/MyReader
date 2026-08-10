import type {
  BookDetail,
  CalibreBook,
  PaginatedBooks,
} from "@my-reader/tools/types/book"
import type { Library } from "@my-reader/tools/types/library"
import {
  type BookFormat,
  type BookContent,
  type BookSummary,
  type BookEntry as CoreBookEntry,
  catalogCountBooks,
  catalogCountLibraryBooks,
  catalogDeleteLocalBook,
  catalogGetBookDetail,
  catalogGetBookFormat,
  catalogGetLibraryBookDetail,
  catalogGetLibraryBookFormat,
  catalogGetLibraryIdentity,
  catalogGetLibraryUuid,
  catalogGetMyreaderBookContent,
  catalogImportLocalBook,
  catalogStageRemoteBookImport,
  catalogListBookFormats,
  catalogListBookSummaries,
  catalogListBooks,
  catalogListBooksPage,
  catalogListBooksPageByLastRead,
  catalogListLibraryBookFormats,
  catalogListLibraryBookSummaries,
  catalogListLibraryBooks,
  catalogListLibraryBooksPage,
  catalogListLibraryBooksPageByLastRead,
  catalogListLibrarySeriesBooks,
  catalogListSeriesBooks,
  catalogUpdateLocalBookMetadata,
  catalogValidateLibrary,
  contentGetFileState,
} from "my-reader-core"
import { appConfigPath } from "./app-config"
import { announceLocalSidecarWork } from "./sync-events"
import { toNativeFilesystemPath } from "../fs/path"
import { cacheFileState } from "../query/invalidate-table"
import type { FileState } from "./content"

export type CalibreBookSummary = BookSummary

export type CalibreBookFormat = BookFormat

function nativePath(libraryRootUri: string): string {
  return toNativeFilesystemPath(libraryRootUri)
}

function bookFromCore(book: CoreBookEntry): CalibreBook {
  return {
    ...book,
    series: book.series ?? null,
    seriesIndex: book.seriesIndex ?? null,
    timestamp: book.timestamp ?? null,
    pubdate: book.pubdate ?? null,
    lastModified: book.lastModified ?? null,
    comment: book.comment ?? null,
    publisher: book.publisher ?? null,
    preferredFormat: book.preferredFormat ?? null,
    rating: book.rating ?? null,
    uuid: book.uuid ?? null,
  }
}

export function validateCalibreLibrary(libraryRootUri: string): boolean {
  return catalogValidateLibrary(nativePath(libraryRootUri))
}

export function countCalibreBooks(libraryRootUri: string): Promise<number> {
  return catalogCountBooks(nativePath(libraryRootUri))
}

export async function listCalibreBooks(
  libraryRootUri: string,
): Promise<CalibreBook[]> {
  return (await catalogListBooks(nativePath(libraryRootUri))).map(bookFromCore)
}

export async function listCalibreBooksPage(
  libraryRootUri: string,
  offset: number,
  limit: number,
  sortBy?: string,
  search?: string,
): Promise<PaginatedBooks> {
  const page = await catalogListBooksPage(
    nativePath(libraryRootUri),
    offset,
    limit,
    sortBy,
    search,
  )
  return { items: page.items.map(bookFromCore), total: page.total }
}

export async function listCalibreBooksPageByLastRead(
  libraryRootUri: string,
  sidecarRootUri: string,
  offset: number,
  limit: number,
  search?: string,
): Promise<PaginatedBooks> {
  const page = await catalogListBooksPageByLastRead(
    nativePath(libraryRootUri),
    nativePath(sidecarRootUri),
    offset,
    limit,
    search,
  )
  return { items: page.items.map(bookFromCore), total: page.total }
}

export async function getCalibreBookDetail(
  libraryRootUri: string,
  bookId: number,
): Promise<BookDetail> {
  const book = await catalogGetBookDetail(nativePath(libraryRootUri), bookId)
  return {
    ...bookFromCore(book),
    titleSort: book.titleSort,
    formatSizes: book.formatSizes,
    identifiers: book.identifiers,
  }
}

export async function listCalibreSeriesBooks(
  libraryRootUri: string,
  seriesName: string,
  excludeBookId?: number,
): Promise<CalibreBook[]> {
  return (
    await catalogListSeriesBooks(
      nativePath(libraryRootUri),
      seriesName,
      excludeBookId,
    )
  ).map(bookFromCore)
}

export function getCalibreLibraryUuid(libraryRootUri: string): Promise<string> {
  return catalogGetLibraryUuid(nativePath(libraryRootUri))
}

export async function listCalibreBookSummaries(
  libraryRootUri: string,
): Promise<CalibreBookSummary[]> {
  return catalogListBookSummaries(nativePath(libraryRootUri))
}

export async function listCalibreBookFormats(
  libraryRootUri: string,
  bookId: number,
): Promise<CalibreBookFormat[]> {
  return catalogListBookFormats(nativePath(libraryRootUri), bookId)
}

export async function getCalibreBookFormat(
  libraryRootUri: string,
  bookId: number,
  format: string,
): Promise<CalibreBookFormat | undefined> {
  return catalogGetBookFormat(nativePath(libraryRootUri), bookId, format)
}

type CatalogLibrary = Pick<Library, "id">

export function countLibraryBooks(
  library: CatalogLibrary,
  contentRootUri: string,
  sidecarRootUri: string,
): Promise<number> {
  return catalogCountLibraryBooks(
    appConfigPath,
    library.id,
    nativePath(sidecarRootUri),
    nativePath(contentRootUri),
  )
}

export async function listLibraryBooks(
  library: CatalogLibrary,
  contentRootUri: string,
  sidecarRootUri: string,
): Promise<CalibreBook[]> {
  return (
    await catalogListLibraryBooks(
      appConfigPath,
      library.id,
      nativePath(sidecarRootUri),
      nativePath(contentRootUri),
    )
  ).map(bookFromCore)
}

export async function listLibraryBooksPage(
  library: CatalogLibrary,
  contentRootUri: string,
  sidecarRootUri: string,
  offset: number,
  limit: number,
  sortBy?: string,
  search?: string,
): Promise<PaginatedBooks> {
  const page = await catalogListLibraryBooksPage(
    appConfigPath,
    library.id,
    nativePath(sidecarRootUri),
    nativePath(contentRootUri),
    offset,
    limit,
    sortBy,
    search,
  )
  return { items: page.items.map(bookFromCore), total: page.total }
}

export async function listLibraryBooksPageByLastRead(
  library: CatalogLibrary,
  contentRootUri: string,
  sidecarRootUri: string,
  offset: number,
  limit: number,
  search?: string,
): Promise<PaginatedBooks> {
  const page = await catalogListLibraryBooksPageByLastRead(
    appConfigPath,
    library.id,
    nativePath(sidecarRootUri),
    nativePath(contentRootUri),
    offset,
    limit,
    search,
  )
  return { items: page.items.map(bookFromCore), total: page.total }
}

export async function getLibraryBookDetail(
  library: CatalogLibrary,
  contentRootUri: string,
  sidecarRootUri: string,
  bookId: number,
): Promise<BookDetail> {
  const book = await catalogGetLibraryBookDetail(
    appConfigPath,
    library.id,
    nativePath(sidecarRootUri),
    nativePath(contentRootUri),
    bookId,
  )
  return {
    ...bookFromCore(book),
    titleSort: book.titleSort,
    formatSizes: book.formatSizes,
    identifiers: book.identifiers,
  }
}

export async function listLibrarySeriesBooks(
  library: CatalogLibrary,
  contentRootUri: string,
  sidecarRootUri: string,
  seriesName: string,
  excludeBookId?: number,
): Promise<CalibreBook[]> {
  return (
    await catalogListLibrarySeriesBooks(
      appConfigPath,
      library.id,
      nativePath(sidecarRootUri),
      nativePath(contentRootUri),
      seriesName,
      excludeBookId,
    )
  ).map(bookFromCore)
}

export function getLibraryIdentity(
  library: CatalogLibrary,
  contentRootUri: string,
  sidecarRootUri: string,
): Promise<string> {
  return catalogGetLibraryIdentity(
    appConfigPath,
    library.id,
    nativePath(sidecarRootUri),
    nativePath(contentRootUri),
  )
}

export function listLibraryBookSummaries(
  library: CatalogLibrary,
  contentRootUri: string,
  sidecarRootUri: string,
): Promise<CalibreBookSummary[]> {
  return catalogListLibraryBookSummaries(
    appConfigPath,
    library.id,
    nativePath(sidecarRootUri),
    nativePath(contentRootUri),
  )
}

export function listLibraryBookFormats(
  library: CatalogLibrary,
  contentRootUri: string,
  sidecarRootUri: string,
  bookId: number,
): Promise<CalibreBookFormat[]> {
  return catalogListLibraryBookFormats(
    appConfigPath,
    library.id,
    nativePath(sidecarRootUri),
    nativePath(contentRootUri),
    bookId,
  )
}

export function getLibraryBookFormat(
  library: CatalogLibrary,
  contentRootUri: string,
  sidecarRootUri: string,
  bookId: number,
  format: string,
): Promise<CalibreBookFormat | undefined> {
  return catalogGetLibraryBookFormat(
    appConfigPath,
    library.id,
    nativePath(sidecarRootUri),
    nativePath(contentRootUri),
    bookId,
    format,
  )
}

export function getMyreaderBookContent(
  contentRootUri: string,
  sidecarRootUri: string,
  bookId: number,
  format: string,
): Promise<BookContent> {
  return catalogGetMyreaderBookContent(
    nativePath(sidecarRootUri),
    nativePath(contentRootUri),
    bookId,
    format,
  )
}

export async function importLocalBook(
  library: CatalogLibrary,
  contentRootUri: string,
  sidecarRootUri: string,
  input: {
    sourceFileUri: string
    sourceFileName?: string
    title?: string
    authors: string[]
    consumeSourceFile: boolean
  },
): Promise<CalibreBook> {
  const book = await catalogImportLocalBook(
    appConfigPath,
    library.id,
    nativePath(sidecarRootUri),
    nativePath(contentRootUri),
    {
      sourceFilePath: nativePath(input.sourceFileUri),
      sourceFileName: input.sourceFileName,
      title: input.title,
      authors: input.authors,
      recordedAtMs: Date.now(),
      consumeSourceFile: input.consumeSourceFile,
    },
  )
  announceLocalSidecarWork(library.id)
  return bookFromCore(book)
}

export async function importRemoteBook(
  library: CatalogLibrary,
  contentRootUri: string,
  sidecarRootUri: string,
  input: {
    sourceFileUri: string
    sourceFileName?: string
    title?: string
    authors: string[]
    consumeSourceFile: boolean
  },
): Promise<CalibreBook> {
  const book = await catalogStageRemoteBookImport(
    appConfigPath,
    library.id,
    nativePath(sidecarRootUri),
    nativePath(contentRootUri),
    {
      sourceFilePath: nativePath(input.sourceFileUri),
      sourceFileName: input.sourceFileName,
      title: input.title,
      authors: input.authors,
      recordedAtMs: Date.now(),
      consumeSourceFile: input.consumeSourceFile,
    },
  )
  const format = book.formats[0]
  if (format) {
    const importedFormat = await catalogGetLibraryBookFormat(
      appConfigPath,
      library.id,
      nativePath(sidecarRootUri),
      nativePath(contentRootUri),
      book.id,
      format,
    )
    const state = importedFormat
      ? await contentGetFileState(
          nativePath(sidecarRootUri),
          importedFormat.relativePath,
        )
      : undefined
    if (state) {
      const cachedState: FileState = {
        ...state,
        localSha256: state.localSha256 ?? null,
        localSize: state.localSize ?? null,
        localMtime: state.localMtime ?? null,
      }
      cacheFileState(library.id, cachedState)
    }
  }
  return bookFromCore(book)
}

export async function updateLocalBookMetadata(
  library: CatalogLibrary,
  contentRootUri: string,
  sidecarRootUri: string,
  input: { bookId: number; title: string; authors: string[] },
): Promise<CalibreBook> {
  const book = await catalogUpdateLocalBookMetadata(
    appConfigPath,
    library.id,
    nativePath(sidecarRootUri),
    nativePath(contentRootUri),
    {
      bookId: input.bookId,
      title: input.title,
      authors: input.authors,
      recordedAtMs: Date.now(),
    },
  )
  announceLocalSidecarWork(library.id)
  return bookFromCore(book)
}

export async function deleteLocalBook(
  library: CatalogLibrary,
  contentRootUri: string,
  sidecarRootUri: string,
  bookId: number,
): Promise<void> {
  await catalogDeleteLocalBook(
    appConfigPath,
    library.id,
    nativePath(sidecarRootUri),
    nativePath(contentRootUri),
    bookId,
    Date.now(),
  )
  announceLocalSidecarWork(library.id)
}
