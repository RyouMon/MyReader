import type { ReaderAnnotationColor } from "@my-reader/tools/reader-annotations"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import type { Library } from "@my-reader/tools/types/library"

import { withLocalLibraryCalibreRoot } from "@/src/domain/library/local-library-content"
import { librarySidecarRootUri } from "../fs/library-paths"
import { toNativeFilesystemPath } from "../fs/path"
import type {
  ReaderAnnotation as CoreReaderAnnotation,
  ReaderBookmark as CoreReaderBookmark,
  ReadingPosition as CoreReadingPosition,
  ReadingPositionCandidate as CoreReadingPositionCandidate,
  ReadingStatistics as CoreReadingStatistics,
} from "./contract.generated"
import { announceLocalSidecarWork } from "./sync-events"
import { invokeCoreAsync } from "./transport"

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

export type ReadingPosition = CoreReadingPosition

export type ReadingPositionCandidate = CoreReadingPositionCandidate

export type ReaderBookmark = CoreReaderBookmark

export type ReaderAnnotation = CoreReaderAnnotation

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

export type ReadingStatistics = CoreReadingStatistics

export function listFavoriteBookIds(library: Library): Promise<number[]> {
  return invokeCoreAsync("reading", "listFavoriteBookIds", {
    sidecarRootPath: sidecarRootPath(library),
  })
}

export function setFavoriteBook(
  library: Library,
  bookId: number,
  isFavorite: boolean,
): Promise<void> {
  return mutateSidecar(library, () =>
    withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
      invokeCoreAsync("reading", "setFavoriteBook", {
        sidecarRootPath: sidecarRootPath(library),
        libraryRootPath: toNativeFilesystemPath(libraryRootUri),
        bookId,
        isFavorite,
        recordedAtMs: Date.now(),
      }),
    ),
  )
}

export function getReadingPosition(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReadingPosition | null> {
  return invokeCoreAsync("reading", "getReadingPosition", {
    sidecarRootPath: sidecarRootPath(library),
    bookId,
    format,
  })
}

export function listReadingPositions(
  library: Library,
): Promise<ReadingPosition[]> {
  return invokeCoreAsync("reading", "listReadingPositions", {
    sidecarRootPath: sidecarRootPath(library),
  })
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
      invokeCoreAsync("reading", "setReadingPosition", {
        sidecarRootPath: sidecarRootPath(library),
        libraryRootPath: toNativeFilesystemPath(libraryRootUri),
        bookId,
        format,
        locator,
        displayProgression,
        recordedAtMs: Date.now(),
      }),
    ),
  )
}

export function listReadingPositionCandidates(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReadingPositionCandidate[]> {
  return withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
    invokeCoreAsync("reading", "listReadingPositionCandidates", {
      sidecarRootPath: sidecarRootPath(library),
      libraryRootPath: toNativeFilesystemPath(libraryRootUri),
      bookId,
      format,
      nowMs: Date.now(),
    }),
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
      invokeCoreAsync("reading", "selectReadingPositionCandidate", {
        sidecarRootPath: sidecarRootPath(library),
        libraryRootPath: toNativeFilesystemPath(libraryRootUri),
        bookId,
        format,
        operationId,
        recordedAtMs: Date.now(),
      }),
    ),
  )
}

export function listReaderBookmarks(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReaderBookmark[]> {
  return invokeCoreAsync("reading", "listReaderBookmarks", {
    sidecarRootPath: sidecarRootPath(library),
    bookId,
    format,
  })
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
      invokeCoreAsync("reading", "addReaderBookmark", {
        sidecarRootPath: sidecarRootPath(library),
        libraryRootPath: toNativeFilesystemPath(libraryRootUri),
        bookId,
        format,
        locatorKey,
        locator,
        recordedAtMs: Date.now(),
      }),
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
      invokeCoreAsync("reading", "removeReaderBookmark", {
        sidecarRootPath: sidecarRootPath(library),
        libraryRootPath: toNativeFilesystemPath(libraryRootUri),
        bookId,
        format,
        locatorKey,
        recordedAtMs: Date.now(),
      }),
    ),
  )
}

export function listReaderAnnotations(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReaderAnnotation[]> {
  return invokeCoreAsync("reading", "listReaderAnnotations", {
    sidecarRootPath: sidecarRootPath(library),
    bookId,
    format,
  })
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
    withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
      invokeCoreAsync("reading", "addReaderAnnotation", {
        sidecarRootPath: sidecarRootPath(library),
        libraryRootPath: toNativeFilesystemPath(libraryRootUri),
        bookId,
        format,
        locator,
        color,
        note,
        recordedAtMs: Date.now(),
      }),
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
    withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
      invokeCoreAsync("reading", "updateReaderAnnotation", {
        sidecarRootPath: sidecarRootPath(library),
        libraryRootPath: toNativeFilesystemPath(libraryRootUri),
        bookId,
        format,
        id,
        color,
        note,
        recordedAtMs: Date.now(),
      }),
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
      invokeCoreAsync("reading", "removeReaderAnnotation", {
        sidecarRootPath: sidecarRootPath(library),
        libraryRootPath: toNativeFilesystemPath(libraryRootUri),
        bookId,
        format,
        id,
        recordedAtMs: Date.now(),
      }),
    ),
  )
}

export function addReadingSessionInterval(
  library: Library,
  interval: ReadingSessionInterval,
): Promise<void> {
  return mutateSidecar(library, () =>
    withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
      invokeCoreAsync("reading", "addReadingSessionInterval", {
        sidecarRootPath: sidecarRootPath(library),
        libraryRootPath: toNativeFilesystemPath(libraryRootUri),
        id: interval.id,
        bookId: interval.bookId,
        format: interval.format,
        localDay: interval.localDay,
        startedAtMs: interval.startedAt,
        durationSeconds: interval.durationSeconds,
        recordedAtMs: interval.updatedAt,
      }),
    ),
  )
}

export function addReadingCompletion(
  library: Library,
  completion: ReadingCompletionInsert,
): Promise<boolean> {
  return mutateSidecar(library, () =>
    withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
      invokeCoreAsync("reading", "addReadingCompletion", {
        sidecarRootPath: sidecarRootPath(library),
        libraryRootPath: toNativeFilesystemPath(libraryRootUri),
        id: completion.id,
        bookId: completion.bookId,
        format: completion.format,
        localDay: completion.localDay,
        completedAtMs: completion.completedAt,
        recordedAtMs: completion.updatedAt,
      }),
    ),
  )
}

export function getReadingStatistics(
  library: Library,
  startDay: string,
  endDay: string,
): Promise<ReadingStatistics> {
  return withLocalLibraryCalibreRoot(library, (libraryRootUri) =>
    invokeCoreAsync("reading", "getReadingStatistics", {
      sidecarRootPath: sidecarRootPath(library),
      libraryRootPath: toNativeFilesystemPath(libraryRootUri),
      startDay,
      endDay,
    }),
  )
}
