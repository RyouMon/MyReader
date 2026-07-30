import type { ReaderAnnotationColor } from "@my-reader/tools/reader-annotations"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import type { Library } from "@my-reader/tools/types/library"

import MyReaderRustComponents from "@/modules/myreader-rust-components"
import { withLocalLibraryCalibreRoot } from "@/src/domain/library/local-library-content"
import { librarySidecarRootUri } from "../fs/library-paths"
import { toNativeFilesystemPath } from "../fs/path"

function sidecarRootPath(library: Library): string {
  return toNativeFilesystemPath(librarySidecarRootUri(library))
}

export async function listFavoriteBookIds(library: Library): Promise<number[]> {
  return JSON.parse(
    await MyReaderRustComponents.listFavoriteBookIds(sidecarRootPath(library)),
  )
}

export function setFavoriteBook(
  library: Library,
  bookId: number,
  isFavorite: boolean,
): Promise<void> {
  return withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
    MyReaderRustComponents.setFavoriteBook(
      sidecarRootPath(library),
      toNativeFilesystemPath(libraryRootUri),
      bookId,
      isFavorite,
      Date.now(),
    ),
  )
}

export type ReadingPosition = {
  bookId: number
  format: string
  locator: ReaderLocator
  displayProgression: number | null
  updatedAt: number
  conflictCount: number
}

export type ReadingPositionCandidate = {
  operationId: string
  locator: ReaderLocator
  displayProgression: number | null
  recordedAt: number
  replicaId: string
}

export type ReaderBookmark = {
  id: string
  bookId: number
  format: string
  locatorKey: string
  locator: ReaderLocator
  createdAt: number
  updatedAt: number
}

export type ReaderAnnotation = {
  id: string
  bookId: number
  format: string
  kind: "highlight"
  locator: ReaderLocator
  color: ReaderAnnotationColor
  note: string | null
  createdAt: number
  updatedAt: number
}

export async function getReadingPosition(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReadingPosition | null> {
  return JSON.parse(
    await MyReaderRustComponents.getReadingPosition(
      sidecarRootPath(library),
      bookId,
      format,
    ),
  )
}

export async function listReadingPositions(
  library: Library,
): Promise<ReadingPosition[]> {
  return JSON.parse(
    await MyReaderRustComponents.listReadingPositions(sidecarRootPath(library)),
  )
}

export function setReadingPosition(
  library: Library,
  bookId: number,
  format: string,
  locator: ReaderLocator,
  displayProgression: number | null,
): Promise<void> {
  return withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
    MyReaderRustComponents.setReadingPosition(
      sidecarRootPath(library),
      toNativeFilesystemPath(libraryRootUri),
      bookId,
      format,
      JSON.stringify(locator),
      displayProgression,
      Date.now(),
    ),
  )
}

export function listReadingPositionCandidates(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReadingPositionCandidate[]> {
  return withLocalLibraryCalibreRoot(library, async (libraryRootUri) =>
    JSON.parse(
      await MyReaderRustComponents.listReadingPositionCandidates(
        sidecarRootPath(library),
        toNativeFilesystemPath(libraryRootUri),
        bookId,
        format,
        Date.now(),
      ),
    ),
  )
}

export function selectReadingPositionCandidate(
  library: Library,
  bookId: number,
  format: string,
  operationId: string,
): Promise<void> {
  return withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
    MyReaderRustComponents.selectReadingPositionCandidate(
      sidecarRootPath(library),
      toNativeFilesystemPath(libraryRootUri),
      bookId,
      format,
      operationId,
      Date.now(),
    ),
  )
}

export async function listReaderBookmarks(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReaderBookmark[]> {
  return JSON.parse(
    await MyReaderRustComponents.listReaderBookmarks(
      sidecarRootPath(library),
      bookId,
      format,
    ),
  )
}

export function addReaderBookmark(
  library: Library,
  bookId: number,
  format: string,
  locatorKey: string,
  locator: ReaderLocator,
): Promise<ReaderBookmark> {
  return withLocalLibraryCalibreRoot(library, async (libraryRootUri) =>
    JSON.parse(
      await MyReaderRustComponents.addReaderBookmark(
        sidecarRootPath(library),
        toNativeFilesystemPath(libraryRootUri),
        bookId,
        format,
        locatorKey,
        JSON.stringify(locator),
        Date.now(),
      ),
    ),
  )
}

export function removeReaderBookmark(
  library: Library,
  bookId: number,
  format: string,
  locatorKey: string,
): Promise<void> {
  return withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
    MyReaderRustComponents.removeReaderBookmark(
      sidecarRootPath(library),
      toNativeFilesystemPath(libraryRootUri),
      bookId,
      format,
      locatorKey,
      Date.now(),
    ),
  )
}

export async function listReaderAnnotations(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReaderAnnotation[]> {
  return JSON.parse(
    await MyReaderRustComponents.listReaderAnnotations(
      sidecarRootPath(library),
      bookId,
      format,
    ),
  )
}

export function addReaderAnnotation(
  library: Library,
  bookId: number,
  format: string,
  locator: ReaderLocator,
  color: ReaderAnnotationColor,
  note: string | null,
): Promise<ReaderAnnotation> {
  return withLocalLibraryCalibreRoot(library, async (libraryRootUri) =>
    JSON.parse(
      await MyReaderRustComponents.addReaderAnnotation(
        sidecarRootPath(library),
        toNativeFilesystemPath(libraryRootUri),
        bookId,
        format,
        JSON.stringify(locator),
        color,
        note,
        Date.now(),
      ),
    ),
  )
}

export function updateReaderAnnotation(
  library: Library,
  bookId: number,
  format: string,
  id: string,
  color: ReaderAnnotationColor,
  note: string | null,
): Promise<ReaderAnnotation> {
  return withLocalLibraryCalibreRoot(library, async (libraryRootUri) =>
    JSON.parse(
      await MyReaderRustComponents.updateReaderAnnotation(
        sidecarRootPath(library),
        toNativeFilesystemPath(libraryRootUri),
        bookId,
        format,
        id,
        color,
        note,
        Date.now(),
      ),
    ),
  )
}

export function removeReaderAnnotation(
  library: Library,
  bookId: number,
  format: string,
  id: string,
): Promise<void> {
  return withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
    MyReaderRustComponents.removeReaderAnnotation(
      sidecarRootPath(library),
      toNativeFilesystemPath(libraryRootUri),
      bookId,
      format,
      id,
      Date.now(),
    ),
  )
}
