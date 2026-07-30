import MyReaderRustComponents, {
  type NativeSyncDocumentCommandResult,
} from "@/modules/myreader-rust-components"

export const LIBRARY_SIDECAR_SCHEMA_VERSION = 1
const SYNC_CONTRACT_VERSION = 7

type ReadingFormat = "EPUB" | "PDF" | "CBZ"

export type LibrarySidecarFavorite = {
  isFavorite: boolean
  addedAt: number | null
  recordedAt: number
  replicaId: string
}

export type LibrarySidecarBookmark = {
  id: string
  bookId: number
  format: ReadingFormat
  locatorKey: string
  locatorJson: string
  createdAt: number
  deletedAt: number | null
  recordedAt: number
  replicaId: string
}

export type LibrarySidecarAnnotationValue = {
  id: string
  bookId: number
  format: ReadingFormat
  kind: "highlight"
  locatorJson: string
  createdAt: number
  color: string
  note: string | null
  updatedAt: number
  deleted: boolean
  deletedAt: number | null
}

export type LibrarySidecarAnnotation = LibrarySidecarAnnotationValue

export type LibrarySidecarReadingSession = {
  id: string
  originReplicaId: string
  bookId: number
  format: ReadingFormat
  localDay: string
  startedAt: number
  durationSeconds: number
  updatedAt: number
}

export type LibrarySidecarReadingCompletion = {
  id: string
  bookId: number
  format: ReadingFormat
  localDay: string
  completedAt: number
  updatedAt: number
  replicaId: string
}

export type LibrarySidecarReadingPosition = {
  format: ReadingFormat
  locatorJson: string
  displayProgressionPpm: number | null
  recordedAt: number
  replicaId: string
}

export type LibrarySidecarReadingPositionCandidate = {
  operationId: string
  value: LibrarySidecarReadingPosition
}

export type LibrarySidecarReadingPositionProjection = {
  bookId: number
  value: LibrarySidecarReadingPosition
  conflictCount: number
}

type ReadingPositionCandidateProjection =
  LibrarySidecarReadingPositionCandidate & {
    bookId: number
    format: ReadingFormat
  }

type LibrarySidecarProjection = {
  readingPositions: LibrarySidecarReadingPositionProjection[]
  readingPositionCandidates: ReadingPositionCandidateProjection[]
  favorites: Array<{ bookId: number; value: LibrarySidecarFavorite }>
  bookmarks: LibrarySidecarBookmark[]
  annotations: LibrarySidecarAnnotationValue[]
  readingSessions: LibrarySidecarReadingSession[]
  readingCompletionRecords: LibrarySidecarReadingCompletion[]
  readingCompletions: LibrarySidecarReadingCompletion[]
}

export type LibrarySidecarDocument = {
  heads: string[]
  projection: LibrarySidecarProjection
}

export type LibrarySidecarDocumentCommand =
  | {
      type: "setLibraryIdentity"
      libraryUuid: string
      recordedAt: number
    }
  | {
      type: "setReadingPosition"
      bookId: number
      value: LibrarySidecarReadingPosition
    }
  | {
      type: "resolveReadingPosition"
      bookId: number
      format: ReadingFormat
      operationId: string
      recordedAt: number
    }
  | {
      type: "setFavorite"
      bookId: number
      value: LibrarySidecarFavorite
    }
  | { type: "setBookmark"; value: LibrarySidecarBookmark }
  | { type: "createAnnotation"; value: LibrarySidecarAnnotationValue }
  | {
      type: "updateAnnotation"
      id: string
      color: string
      note: string | null
      updatedAt: number
    }
  | { type: "deleteAnnotation"; id: string; deletedAt: number }
  | {
      type: "addReadingSessionDuration"
      value: LibrarySidecarReadingSession
    }
  | {
      type: "addReadingCompletion"
      value: LibrarySidecarReadingCompletion
    }

let contractChecked = false

function checkContract(): void {
  if (contractChecked) return
  const actual = MyReaderRustComponents.syncContractVersion()
  if (actual !== SYNC_CONTRACT_VERSION) {
    throw new Error(
      `MyReader Rust sync contract mismatch: expected ${SYNC_CONTRACT_VERSION}, received ${actual}`,
    )
  }
  contractChecked = true
}

function parseProjection(value: string): LibrarySidecarProjection {
  const projection = JSON.parse(value) as Partial<LibrarySidecarProjection>
  const arrays = [
    projection.readingPositions,
    projection.readingPositionCandidates,
    projection.favorites,
    projection.bookmarks,
    projection.annotations,
    projection.readingSessions,
    projection.readingCompletionRecords,
    projection.readingCompletions,
  ]
  if (arrays.some((entry) => !Array.isArray(entry))) {
    throw new Error("MyReader Rust sync projection is invalid")
  }
  return projection as LibrarySidecarProjection
}

export function librarySidecarDocumentFromNativeResult(
  result: NativeSyncDocumentCommandResult,
): LibrarySidecarDocument {
  checkContract()
  if (result.schemaVersion !== LIBRARY_SIDECAR_SCHEMA_VERSION) {
    throw new Error(`unsupported Automerge schema ${result.schemaVersion}`)
  }
  return {
    heads: [...result.heads],
    projection: parseProjection(result.projectionJson),
  }
}

export function librarySidecarReadingPositionCandidates(
  document: LibrarySidecarDocument,
  bookId: number,
  format: ReadingFormat,
): LibrarySidecarReadingPositionCandidate[] {
  return document.projection.readingPositionCandidates
    .filter(
      (candidate) => candidate.bookId === bookId && candidate.format === format,
    )
    .map(({ operationId, value }) => ({ operationId, value }))
}

export function librarySidecarReadingPositionProjections(
  document: LibrarySidecarDocument,
): LibrarySidecarReadingPositionProjection[] {
  return document.projection.readingPositions
}

export function librarySidecarFavoriteProjections(
  document: LibrarySidecarDocument,
): Array<{ bookId: number; value: LibrarySidecarFavorite }> {
  return document.projection.favorites
}

export function librarySidecarBookmarkProjections(
  document: LibrarySidecarDocument,
): LibrarySidecarBookmark[] {
  return document.projection.bookmarks
}

export function librarySidecarAnnotationProjections(
  document: LibrarySidecarDocument,
): LibrarySidecarAnnotationValue[] {
  return document.projection.annotations
}

export function librarySidecarReadingSessionProjections(
  document: LibrarySidecarDocument,
): LibrarySidecarReadingSession[] {
  return document.projection.readingSessions
}

export function librarySidecarReadingCompletionRecords(
  document: LibrarySidecarDocument,
): LibrarySidecarReadingCompletion[] {
  return document.projection.readingCompletionRecords
}

export function librarySidecarReadingCompletionProjections(
  document: LibrarySidecarDocument,
): LibrarySidecarReadingCompletion[] {
  return document.projection.readingCompletions
}
