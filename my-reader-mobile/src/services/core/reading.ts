import type {
  ReaderAnnotationColor,
  ReaderAnnotationKind,
} from "@my-reader/tools/reader-annotations"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import type { Library } from "@my-reader/tools/types/library"

import { withLocalLibraryCalibreRoot } from "@/src/domain/library/local-library-content"
import {
  readingAddAnnotation,
  readingAddBookmark,
  readingAddCompletion,
  readingAddSessionInterval,
  readingGetPosition,
  readingGetStatistics,
  readingListAnnotations,
  readingListBookmarks,
  readingListFavoriteBookIds,
  readingListPositionCandidates,
  readingListPositions,
  readingRemoveAnnotation,
  readingRemoveBookmark,
  readingSelectPositionCandidate,
  readingSetFavoriteBook,
  readingSetPosition,
  readingUpdateAnnotation,
  type ReaderAnnotation as CoreReaderAnnotation,
  type ReaderBookmark as CoreReaderBookmark,
  type ReadingPosition as CoreReadingPosition,
  type ReadingPositionCandidate as CoreReadingPositionCandidate,
} from "my-reader-core"
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

export type ReadingPosition = Omit<
  CoreReadingPosition,
  "displayProgression"
> & {
  displayProgression: number | null
}

export type ReadingPositionCandidate = Omit<
  CoreReadingPositionCandidate,
  "displayProgression"
> & {
  displayProgression: number | null
}

export type ReaderBookmark = CoreReaderBookmark

export type ReaderAnnotation = Omit<
  CoreReaderAnnotation,
  "kind" | "color" | "note"
> & {
  kind: ReaderAnnotationKind
  color: ReaderAnnotationColor
  note: string | null
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

function positionFromCore(position: CoreReadingPosition): ReadingPosition {
  return {
    ...position,
    displayProgression: position.displayProgression ?? null,
  }
}

function positionCandidateFromCore(
  candidate: CoreReadingPositionCandidate,
): ReadingPositionCandidate {
  return {
    ...candidate,
    displayProgression: candidate.displayProgression ?? null,
  }
}

function annotationFromCore(
  annotation: CoreReaderAnnotation,
): ReaderAnnotation {
  return {
    ...annotation,
    kind: annotation.kind as ReaderAnnotationKind,
    color: annotation.color as ReaderAnnotationColor,
    note: annotation.note ?? null,
  }
}

export function listFavoriteBookIds(library: Library): Promise<number[]> {
  return readingListFavoriteBookIds(sidecarRootPath(library))
}

export function setFavoriteBook(
  library: Library,
  bookId: number,
  isFavorite: boolean,
): Promise<void> {
  return mutateSidecar(library, () =>
    withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
      readingSetFavoriteBook(
        sidecarRootPath(library),
        toNativeFilesystemPath(libraryRootUri),
        bookId,
        isFavorite,
        Date.now(),
      ),
    ),
  )
}

export async function getReadingPosition(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReadingPosition | null> {
  const position = await readingGetPosition(
    sidecarRootPath(library),
    bookId,
    format,
  )
  return position ? positionFromCore(position) : null
}

export async function listReadingPositions(
  library: Library,
): Promise<ReadingPosition[]> {
  return (await readingListPositions(sidecarRootPath(library))).map(
    positionFromCore,
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
      readingSetPosition(
        sidecarRootPath(library),
        toNativeFilesystemPath(libraryRootUri),
        bookId,
        format,
        locator,
        displayProgression ?? undefined,
        Date.now(),
      ),
    ),
  )
}

export async function listReadingPositionCandidates(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReadingPositionCandidate[]> {
  const candidates = await withLocalLibraryCalibreRoot(
    library,
    (libraryRootUri) =>
      readingListPositionCandidates(
        sidecarRootPath(library),
        toNativeFilesystemPath(libraryRootUri),
        bookId,
        format,
        Date.now(),
      ),
  )
  return candidates.map(positionCandidateFromCore)
}

export function selectReadingPositionCandidate(
  library: Library,
  bookId: number,
  format: string,
  operationId: string,
): Promise<void> {
  return mutateSidecar(library, () =>
    withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
      readingSelectPositionCandidate(
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

export function listReaderBookmarks(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReaderBookmark[]> {
  return readingListBookmarks(sidecarRootPath(library), bookId, format)
}

export function addReaderBookmark(
  library: Library,
  bookId: number,
  format: string,
  locatorKey: string,
  locator: ReaderLocator,
): Promise<ReaderBookmark> {
  return mutateSidecar(library, () =>
    withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
      readingAddBookmark(
        sidecarRootPath(library),
        toNativeFilesystemPath(libraryRootUri),
        bookId,
        format,
        locatorKey,
        locator,
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
  return mutateSidecar(library, () =>
    withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
      readingRemoveBookmark(
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
  return (
    await readingListAnnotations(sidecarRootPath(library), bookId, format)
  ).map(annotationFromCore)
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
      annotationFromCore(
        await readingAddAnnotation(
          sidecarRootPath(library),
          toNativeFilesystemPath(libraryRootUri),
          bookId,
          format,
          locator,
          color,
          note ?? undefined,
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
      annotationFromCore(
        await readingUpdateAnnotation(
          sidecarRootPath(library),
          toNativeFilesystemPath(libraryRootUri),
          bookId,
          format,
          id,
          color,
          note ?? undefined,
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
      readingRemoveAnnotation(
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
      readingAddSessionInterval(
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
      readingAddCompletion(
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
  const statistics = await withLocalLibraryCalibreRoot(
    library,
    (libraryRootUri) =>
      readingGetStatistics(
        sidecarRootPath(library),
        toNativeFilesystemPath(libraryRootUri),
        startDay,
        endDay,
      ),
  )
  return {
    days: Object.fromEntries(
      statistics.days.map(({ day, durationSeconds }) => [day, durationSeconds]),
    ),
    totalDurationSeconds: statistics.totalDurationSeconds,
    longestStreakDays: statistics.longestStreakDays,
    completedBooks: statistics.completedBooks,
  }
}
