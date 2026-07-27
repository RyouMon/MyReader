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
