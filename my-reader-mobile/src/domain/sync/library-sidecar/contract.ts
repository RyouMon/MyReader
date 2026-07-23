import type { ReaderLocator } from "@my-reader/tools/reader-toc"

export const LIBRARY_SIDECAR_PROTOCOL = "library-sidecar-v4" as const

export const LIBRARY_SIDECAR_DOMAINS = [
  "book_favorite.v1",
  "reading_position.v1",
  "bookmark.v1",
  "annotation.v1",
  "reading_session.v1",
  "reading_completion.v1",
] as const

export const LIBRARY_SIDECAR_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000
export const LIBRARY_SIDECAR_HASH_PREFIX_HEX_LENGTH = 32
export const LIBRARY_SIDECAR_MAX_SESSION_DURATION_SECONDS = 25 * 60 * 60

export const LIBRARY_SIDECAR_PROTOCOL_ERRORS = [
  "replica_fork",
  "future_clock",
  "missing_sequence",
  "file_hash_mismatch",
  "invalid_json",
  "unsupported_protocol",
  "unsupported_domain",
  "library_mismatch",
  "invalid_change",
  "projection_failed",
] as const

export type LibrarySidecarDomain = (typeof LIBRARY_SIDECAR_DOMAINS)[number]
export type LibrarySidecarProtocolError =
  (typeof LIBRARY_SIDECAR_PROTOCOL_ERRORS)[number]

export type LibrarySidecarHlc = string

export type LibrarySidecarLww<T> = {
  clock: LibrarySidecarHlc
  value: T
}

export type LibrarySidecarFavoriteValue = {
  isFavorite: boolean
  addedAtMs: number | null
}

export type LibrarySidecarFavoriteState = {
  domain: "book_favorite.v1"
  bookId: number
  register: LibrarySidecarLww<LibrarySidecarFavoriteValue>
}

export type LibrarySidecarPositionValue = {
  locator: ReaderLocator
  displayProgression: number | null
}

export type LibrarySidecarPositionState = {
  domain: "reading_position.v1"
  bookId: number
  format: string
  register: LibrarySidecarLww<LibrarySidecarPositionValue>
}

export type LibrarySidecarBookmarkValue = {
  present: boolean
  id: string
  locator: ReaderLocator
  createdAtMs: number
  deletedAtMs: number | null
}

export type LibrarySidecarBookmarkState = {
  domain: "bookmark.v1"
  bookId: number
  format: string
  locatorKey: string
  register: LibrarySidecarLww<LibrarySidecarBookmarkValue>
}

export type LibrarySidecarAnnotationHeader = {
  bookId: number
  format: string
  kind: string
  locator: ReaderLocator
  createdAtMs: number
}

export type LibrarySidecarAnnotationTombstone = {
  clock: LibrarySidecarHlc
  deletedAtMs: number
}

export type LibrarySidecarAnnotationState = {
  domain: "annotation.v1"
  id: string
  header: LibrarySidecarAnnotationHeader
  color: LibrarySidecarLww<string>
  note: LibrarySidecarLww<string | null>
  tombstone: LibrarySidecarAnnotationTombstone | null
}

export type LibrarySidecarReadingSessionHeader = {
  originReplicaId: string
  bookId: number
  format: string
  localDay: string
  startedAtMs: number
}

export type LibrarySidecarReadingSessionState = {
  domain: "reading_session.v1"
  id: string
  header: LibrarySidecarReadingSessionHeader
  durationSeconds: number
}

export type LibrarySidecarReadingCompletionState = {
  domain: "reading_completion.v1"
  bookId: number
  id: string
  format: string
  localDay: string
  completedAtMs: number
}

export type LibrarySidecarState =
  | LibrarySidecarFavoriteState
  | LibrarySidecarPositionState
  | LibrarySidecarBookmarkState
  | LibrarySidecarAnnotationState
  | LibrarySidecarReadingSessionState
  | LibrarySidecarReadingCompletionState

export type LibrarySidecarChange = {
  changeId: string
  clock: LibrarySidecarHlc
  state: LibrarySidecarState
}

export type LibrarySidecarSegment = {
  protocol: typeof LIBRARY_SIDECAR_PROTOCOL
  libraryUuid: string
  replicaId: string
  sequence: string
  changes: LibrarySidecarChange[]
}

export type LibrarySidecarReplicaMetadata = {
  schemaVersion: 1
  replicaId: string
  updatedAt: string
  device?: {
    model?: string
  }
  system: {
    name: string
    version?: string
  }
  app: {
    version: string
    buildNumber?: string
  }
}
