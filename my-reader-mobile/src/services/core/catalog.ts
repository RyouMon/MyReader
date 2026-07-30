import type {
  BookDetail,
  CalibreBook,
  PaginatedBooks,
} from "@my-reader/tools/types/book"
import {
  catalogCountBooks,
  catalogGetBookDetail,
  catalogGetLibraryUuid,
  catalogListBookFormats,
  catalogListBookSummaries,
  catalogListBooks,
  catalogListBooksPage,
  catalogListBooksPageByLastRead,
  catalogListSeriesBooks,
  catalogValidateLibrary,
  type BookEntry as CoreBookEntry,
  type BookFormat,
  type BookSummary,
} from "my-reader-core"
import { toNativeFilesystemPath } from "../fs/path"

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
