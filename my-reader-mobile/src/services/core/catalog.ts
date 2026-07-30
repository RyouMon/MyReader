import type {
  BookDetail,
  CalibreBook,
  PaginatedBooks,
} from "@my-reader/tools/types/book"
import { toNativeFilesystemPath } from "../fs/path"
import { invokeCoreAsync, invokeCoreSync } from "./transport"

export type CalibreBookSummary = {
  id: number
  path: string
  hasCover: boolean
  formats: string[]
  formatPaths: string[]
}

export type CalibreBookFormat = {
  format: string
  name: string
  sizeBytes: number
  relativePath: string
}

function nativePath(libraryRootUri: string): string {
  return toNativeFilesystemPath(libraryRootUri)
}

export function validateCalibreLibrary(libraryRootUri: string): boolean {
  return invokeCoreSync<boolean>("catalog", "validateLibrary", {
    libraryRootPath: nativePath(libraryRootUri),
  })
}

export function countCalibreBooks(libraryRootUri: string): Promise<number> {
  return invokeCoreAsync<number>("catalog", "countBooks", {
    libraryRootPath: nativePath(libraryRootUri),
  })
}

export async function listCalibreBooks(
  libraryRootUri: string,
): Promise<CalibreBook[]> {
  return invokeCoreAsync<CalibreBook[]>("catalog", "listBooks", {
    libraryRootPath: nativePath(libraryRootUri),
  })
}

export async function listCalibreBooksPage(
  libraryRootUri: string,
  offset: number,
  limit: number,
  sortBy?: string,
  search?: string,
): Promise<PaginatedBooks> {
  return invokeCoreAsync<PaginatedBooks>("catalog", "listBooksPage", {
    libraryRootPath: nativePath(libraryRootUri),
    offset,
    limit,
    sortBy: sortBy ?? null,
    search: search ?? null,
  })
}

export async function listCalibreBooksPageByLastRead(
  libraryRootUri: string,
  sidecarRootUri: string,
  offset: number,
  limit: number,
  search?: string,
): Promise<PaginatedBooks> {
  return invokeCoreAsync<PaginatedBooks>("catalog", "listBooksPageByLastRead", {
    libraryRootPath: nativePath(libraryRootUri),
    sidecarRootPath: nativePath(sidecarRootUri),
    offset,
    limit,
    search: search ?? null,
  })
}

export async function getCalibreBookDetail(
  libraryRootUri: string,
  bookId: number,
): Promise<BookDetail> {
  return invokeCoreAsync<BookDetail>("catalog", "getBookDetail", {
    libraryRootPath: nativePath(libraryRootUri),
    bookId,
  })
}

export async function listCalibreSeriesBooks(
  libraryRootUri: string,
  seriesName: string,
  excludeBookId?: number,
): Promise<CalibreBook[]> {
  return invokeCoreAsync<CalibreBook[]>("catalog", "listSeriesBooks", {
    libraryRootPath: nativePath(libraryRootUri),
    seriesName,
    excludeBookId: excludeBookId ?? null,
  })
}

export function getCalibreLibraryUuid(libraryRootUri: string): Promise<string> {
  return invokeCoreAsync<string>("catalog", "getLibraryUuid", {
    libraryRootPath: nativePath(libraryRootUri),
  })
}

export async function listCalibreBookSummaries(
  libraryRootUri: string,
): Promise<CalibreBookSummary[]> {
  return invokeCoreAsync<CalibreBookSummary[]>("catalog", "listBookSummaries", {
    libraryRootPath: nativePath(libraryRootUri),
  })
}

export async function listCalibreBookFormats(
  libraryRootUri: string,
  bookId: number,
): Promise<CalibreBookFormat[]> {
  return invokeCoreAsync<CalibreBookFormat[]>("catalog", "listBookFormats", {
    libraryRootPath: nativePath(libraryRootUri),
    bookId,
  })
}
