import type {
  BookDetail,
  CalibreBook,
  PaginatedBooks,
} from "@my-reader/tools/types/book"
import MyReaderRustComponents from "@/modules/myreader-rust-components"
import { toNativeFilesystemPath } from "../fs/path"

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
  return MyReaderRustComponents.validateCalibreLibrary(
    nativePath(libraryRootUri),
  )
}

export function countCalibreBooks(libraryRootUri: string): Promise<number> {
  return MyReaderRustComponents.countCalibreBooks(nativePath(libraryRootUri))
}

export async function listCalibreBooks(
  libraryRootUri: string,
): Promise<CalibreBook[]> {
  return JSON.parse(
    await MyReaderRustComponents.listCalibreBooks(nativePath(libraryRootUri)),
  ) as CalibreBook[]
}

export async function listCalibreBooksPage(
  libraryRootUri: string,
  offset: number,
  limit: number,
  sortBy?: string,
  search?: string,
): Promise<PaginatedBooks> {
  return JSON.parse(
    await MyReaderRustComponents.listCalibreBooksPage(
      nativePath(libraryRootUri),
      offset,
      limit,
      sortBy ?? null,
      search ?? null,
    ),
  ) as PaginatedBooks
}

export async function listCalibreBooksPageByLastRead(
  libraryRootUri: string,
  sidecarRootUri: string,
  offset: number,
  limit: number,
  search?: string,
): Promise<PaginatedBooks> {
  return JSON.parse(
    await MyReaderRustComponents.listCalibreBooksPageByLastRead(
      nativePath(libraryRootUri),
      nativePath(sidecarRootUri),
      offset,
      limit,
      search ?? null,
    ),
  ) as PaginatedBooks
}

export async function getCalibreBookDetail(
  libraryRootUri: string,
  bookId: number,
): Promise<BookDetail> {
  return JSON.parse(
    await MyReaderRustComponents.getCalibreBookDetail(
      nativePath(libraryRootUri),
      bookId,
    ),
  ) as BookDetail
}

export async function listCalibreSeriesBooks(
  libraryRootUri: string,
  seriesName: string,
  excludeBookId?: number,
): Promise<CalibreBook[]> {
  return JSON.parse(
    await MyReaderRustComponents.listCalibreSeriesBooks(
      nativePath(libraryRootUri),
      seriesName,
      excludeBookId ?? null,
    ),
  ) as CalibreBook[]
}

export function getCalibreLibraryUuid(libraryRootUri: string): Promise<string> {
  return MyReaderRustComponents.getCalibreLibraryUuid(
    nativePath(libraryRootUri),
  )
}

export async function listCalibreBookSummaries(
  libraryRootUri: string,
): Promise<CalibreBookSummary[]> {
  return JSON.parse(
    await MyReaderRustComponents.listCalibreBookSummaries(
      nativePath(libraryRootUri),
    ),
  ) as CalibreBookSummary[]
}

export async function listCalibreBookFormats(
  libraryRootUri: string,
  bookId: number,
): Promise<CalibreBookFormat[]> {
  return JSON.parse(
    await MyReaderRustComponents.listCalibreBookFormats(
      nativePath(libraryRootUri),
      bookId,
    ),
  ) as CalibreBookFormat[]
}
