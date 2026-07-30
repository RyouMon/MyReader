import type { ReaderAnnotationColor } from "@my-reader/tools/reader-annotations"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import type { Library } from "@my-reader/tools/types/library"

import MyReaderRustComponents from "@/modules/myreader-rust-components"
import type {
  NativeReaderAnnotation,
  NativeReaderBookmark,
  NativeReadingPosition,
  NativeReadingPositionCandidate,
} from "@/modules/myreader-rust-components"
import { withLocalLibraryCalibreRoot } from "@/src/domain/library/local-library-content"
import { librarySidecarRootUri } from "../fs/library-paths"
import { toNativeFilesystemPath } from "../fs/path"
import { announceLocalSidecarWork } from "./sync-events"

function sidecarRootPath(library: Library): string {
  return toNativeFilesystemPath(librarySidecarRootUri(library))
}

async function mutateSidecar<T>(
  library: Library,
  mutation: () => Promise<T>,
): Promise<T> {
  const result = await mutation()
  announceLocalSidecarWork(library.id)
  return result
}

export async function listFavoriteBookIds(library: Library): Promise<number[]> {
  return MyReaderRustComponents.listFavoriteBookIds(sidecarRootPath(library))
}

function parseLocator(locatorJson: string): ReaderLocator {
  return JSON.parse(locatorJson) as ReaderLocator
}

function readingPositionFromNative(
  position: NativeReadingPosition,
): ReadingPosition {
  return {
    bookId: position.bookId,
    format: position.format,
    locator: parseLocator(position.locatorJson),
    displayProgression: position.displayProgression,
    updatedAt: position.updatedAt,
    conflictCount: position.conflictCount,
  }
}

function readingPositionCandidateFromNative(
  candidate: NativeReadingPositionCandidate,
): ReadingPositionCandidate {
  return {
    operationId: candidate.operationId,
    locator: parseLocator(candidate.locatorJson),
    displayProgression: candidate.displayProgression,
    recordedAt: candidate.recordedAt,
    replicaId: candidate.replicaId,
  }
}

function readerBookmarkFromNative(
  bookmark: NativeReaderBookmark,
): ReaderBookmark {
  return {
    id: bookmark.id,
    bookId: bookmark.bookId,
    format: bookmark.format,
    locatorKey: bookmark.locatorKey,
    locator: parseLocator(bookmark.locatorJson),
    createdAt: bookmark.createdAt,
    updatedAt: bookmark.updatedAt,
  }
}

function readerAnnotationFromNative(
  annotation: NativeReaderAnnotation,
): ReaderAnnotation {
  return {
    id: annotation.id,
    bookId: annotation.bookId,
    format: annotation.format,
    kind: annotation.kind as ReaderAnnotation["kind"],
    locator: parseLocator(annotation.locatorJson),
    color: annotation.color as ReaderAnnotationColor,
    note: annotation.note,
    createdAt: annotation.createdAt,
    updatedAt: annotation.updatedAt,
  }
}

async function mapOptional<TSource, TResult>(
  value: Promise<TSource | null>,
  transform: (source: TSource) => TResult,
): Promise<TResult | null> {
  const source = await value
  return source === null ? null : transform(source)
}

async function mapArray<TSource, TResult>(
  value: Promise<TSource[]>,
  transform: (source: TSource) => TResult,
): Promise<TResult[]> {
  return (await value).map(transform)
}

export async function getReadingPosition(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReadingPosition | null> {
  return mapOptional(
    MyReaderRustComponents.getReadingPosition(
      sidecarRootPath(library),
      bookId,
      format,
    ),
    readingPositionFromNative,
  )
}

export function setFavoriteBook(
  library: Library,
  bookId: number,
  isFavorite: boolean,
): Promise<void> {
  return mutateSidecar(library, () =>
    withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
      MyReaderRustComponents.setFavoriteBook(
        sidecarRootPath(library),
        toNativeFilesystemPath(libraryRootUri),
        bookId,
        isFavorite,
        Date.now(),
      ),
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

export type ReadingSessionInterval = {
  id: string
  bookId: number
  format: string
  localDay: string
  startedAt: number
  durationSeconds: number
  updatedAt: number
}

export type ReadingCompletionInsert = {
  id: string
  bookId: number
  format: string
  localDay: string
  completedAt: number
  updatedAt: number
}

export type ReadingStatistics = {
  days: Record<string, number>
  totalDurationSeconds: number
  longestStreakDays: number
  completedBooks: number
}

export async function listReadingPositions(
  library: Library,
): Promise<ReadingPosition[]> {
  return mapArray(
    MyReaderRustComponents.listReadingPositions(sidecarRootPath(library)),
    readingPositionFromNative,
  )
}

export function setReadingPosition(
  library: Library,
  bookId: number,
  format: string,
  locator: ReaderLocator,
  displayProgression: number | null,
): Promise<void> {
  return mutateSidecar(library, () =>
    withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
      MyReaderRustComponents.setReadingPosition(
        sidecarRootPath(library),
        toNativeFilesystemPath(libraryRootUri),
        bookId,
        format,
        JSON.stringify(locator),
        displayProgression,
        Date.now(),
      ),
    ),
  )
}

export function listReadingPositionCandidates(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReadingPositionCandidate[]> {
  return withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
    mapArray(
      MyReaderRustComponents.listReadingPositionCandidates(
        sidecarRootPath(library),
        toNativeFilesystemPath(libraryRootUri),
        bookId,
        format,
        Date.now(),
      ),
      readingPositionCandidateFromNative,
    ),
  )
}

export function selectReadingPositionCandidate(
  library: Library,
  bookId: number,
  format: string,
  operationId: string,
): Promise<void> {
  return mutateSidecar(library, () =>
    withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
      MyReaderRustComponents.selectReadingPositionCandidate(
        sidecarRootPath(library),
        toNativeFilesystemPath(libraryRootUri),
        bookId,
        format,
        operationId,
        Date.now(),
      ),
    ),
  )
}

export async function listReaderBookmarks(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReaderBookmark[]> {
  return mapArray(
    MyReaderRustComponents.listReaderBookmarks(
      sidecarRootPath(library),
      bookId,
      format,
    ),
    readerBookmarkFromNative,
  )
}

export function addReaderBookmark(
  library: Library,
  bookId: number,
  format: string,
  locatorKey: string,
  locator: ReaderLocator,
): Promise<ReaderBookmark> {
  return mutateSidecar(library, () =>
    withLocalLibraryCalibreRoot(library, async (libraryRootUri) =>
      readerBookmarkFromNative(
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
    ),
  )
}

export function removeReaderBookmark(
  library: Library,
  bookId: number,
  format: string,
  locatorKey: string,
): Promise<void> {
  return mutateSidecar(library, () =>
    withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
      MyReaderRustComponents.removeReaderBookmark(
        sidecarRootPath(library),
        toNativeFilesystemPath(libraryRootUri),
        bookId,
        format,
        locatorKey,
        Date.now(),
      ),
    ),
  )
}

export async function listReaderAnnotations(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReaderAnnotation[]> {
  return mapArray(
    MyReaderRustComponents.listReaderAnnotations(
      sidecarRootPath(library),
      bookId,
      format,
    ),
    readerAnnotationFromNative,
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
  return mutateSidecar(library, () =>
    withLocalLibraryCalibreRoot(library, async (libraryRootUri) =>
      readerAnnotationFromNative(
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
  return mutateSidecar(library, () =>
    withLocalLibraryCalibreRoot(library, async (libraryRootUri) =>
      readerAnnotationFromNative(
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
    ),
  )
}

export function removeReaderAnnotation(
  library: Library,
  bookId: number,
  format: string,
  id: string,
): Promise<void> {
  return mutateSidecar(library, () =>
    withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
      MyReaderRustComponents.removeReaderAnnotation(
        sidecarRootPath(library),
        toNativeFilesystemPath(libraryRootUri),
        bookId,
        format,
        id,
        Date.now(),
      ),
    ),
  )
}

export function addReadingSessionInterval(
  library: Library,
  interval: ReadingSessionInterval,
): Promise<void> {
  return mutateSidecar(library, () =>
    withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
      MyReaderRustComponents.addReadingSessionInterval(
        sidecarRootPath(library),
        toNativeFilesystemPath(libraryRootUri),
        interval.id,
        interval.bookId,
        interval.format,
        interval.localDay,
        interval.startedAt,
        interval.durationSeconds,
        interval.updatedAt,
      ),
    ),
  )
}

export function addReadingCompletion(
  library: Library,
  completion: ReadingCompletionInsert,
): Promise<boolean> {
  return mutateSidecar(library, () =>
    withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
      MyReaderRustComponents.addReadingCompletion(
        sidecarRootPath(library),
        toNativeFilesystemPath(libraryRootUri),
        completion.id,
        completion.bookId,
        completion.format,
        completion.localDay,
        completion.completedAt,
        completion.updatedAt,
      ),
    ),
  )
}

export async function getReadingStatistics(
  library: Library,
  startDay: string,
  endDay: string,
): Promise<ReadingStatistics> {
  return withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
    MyReaderRustComponents.getReadingStatistics(
      sidecarRootPath(library),
      toNativeFilesystemPath(libraryRootUri),
      startDay,
      endDay,
    ),
  )
}
