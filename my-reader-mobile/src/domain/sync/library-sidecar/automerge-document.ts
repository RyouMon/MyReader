import MyReaderRustComponents, {
  type NativeSyncDocumentCommandResult,
} from "@/modules/myreader-rust-components"

import { LIBRARY_SIDECAR_GENESIS_HEADS } from "./automerge-genesis.generated"

export const LIBRARY_SIDECAR_SCHEMA_VERSION = 1
const SYNC_CONTRACT_VERSION = 2

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

export type LibrarySidecarAutomergeChange = {
  actorId: string
  sequence: string
  hash: string
  bytes: Uint8Array
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
  schema: number
  libraryUuid: string | null
  replicaId: string
  snapshotBytes: Uint8Array
  heads: string[]
  projection: LibrarySidecarProjection
}

export type LibrarySidecarDocumentCommand =
  | { type: "inspect" }
  | { type: "inspectDependencies"; heads: string[] }
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
  | { type: "applyIncremental" }

type CommandExecution = {
  document: LibrarySidecarDocument
  result: NativeSyncDocumentCommandResult
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

function executeCommand(
  document: LibrarySidecarDocument | null,
  replicaId: string,
  command: LibrarySidecarDocumentCommand,
  baseHeads: string[],
  payloadBytes: Uint8Array | null = null,
  expectedLibraryUuid: string | null = document?.libraryUuid ?? null,
): CommandExecution {
  checkContract()
  const result = MyReaderRustComponents.executeSyncDocumentCommand(
    document?.snapshotBytes ?? null,
    JSON.stringify({
      replicaId,
      expectedLibraryUuid,
      baseHeads,
      command,
    }),
    payloadBytes,
  )
  if (result.schemaVersion !== LIBRARY_SIDECAR_SCHEMA_VERSION) {
    throw new Error(`unsupported Automerge schema ${result.schemaVersion}`)
  }
  return {
    result,
    document: {
      schema: result.schemaVersion,
      libraryUuid: result.libraryUuid,
      replicaId,
      snapshotBytes: result.snapshotBytes,
      heads: [...result.heads],
      projection: parseProjection(result.projectionJson),
    },
  }
}

export function librarySidecarDocumentFromNativeResult(
  result: NativeSyncDocumentCommandResult,
  replicaId: string,
): LibrarySidecarDocument {
  checkContract()
  if (result.schemaVersion !== LIBRARY_SIDECAR_SCHEMA_VERSION) {
    throw new Error(`unsupported Automerge schema ${result.schemaVersion}`)
  }
  return {
    schema: result.schemaVersion,
    libraryUuid: result.libraryUuid,
    replicaId,
    snapshotBytes: result.snapshotBytes,
    heads: [...result.heads],
    projection: parseProjection(result.projectionJson),
  }
}

export async function createLibrarySidecarDocument(
  replicaId: string,
): Promise<LibrarySidecarDocument> {
  const execution = executeCommand(null, replicaId, { type: "inspect" }, [])
  if (
    JSON.stringify(execution.document.heads) !==
    JSON.stringify(LIBRARY_SIDECAR_GENESIS_HEADS)
  ) {
    throw new Error(
      `canonical library sidecar genesis is invalid: schema=${execution.document.schema}, heads=${JSON.stringify(execution.document.heads)}`,
    )
  }
  return execution.document
}

export async function loadLibrarySidecarDocument(
  bytes: Uint8Array,
  replicaId: string,
): Promise<LibrarySidecarDocument> {
  return executeCommand(
    {
      schema: LIBRARY_SIDECAR_SCHEMA_VERSION,
      libraryUuid: null,
      replicaId,
      snapshotBytes: bytes,
      heads: [],
      projection: {} as LibrarySidecarProjection,
    },
    replicaId,
    { type: "inspect" },
    [],
  ).document
}

export function librarySidecarDocumentHeads(
  document: LibrarySidecarDocument,
): string[] {
  return [...document.heads]
}

export function saveLibrarySidecarDocument(
  document: LibrarySidecarDocument,
): Uint8Array {
  return document.snapshotBytes
}

export function saveLibrarySidecarIncremental(
  document: LibrarySidecarDocument,
  heads: string[],
): Uint8Array {
  return executeCommand(
    document,
    document.replicaId,
    { type: "inspect" },
    heads,
  ).result.incrementalBytes
}

export function applyLibrarySidecarIncremental(
  document: LibrarySidecarDocument,
  bytes: Uint8Array,
): LibrarySidecarDocument {
  return executeCommand(
    document,
    document.replicaId,
    { type: "applyIncremental" },
    document.heads,
    bytes,
  ).document
}

export function librarySidecarChangesSince(
  document: LibrarySidecarDocument,
  heads: string[],
): LibrarySidecarAutomergeChange[] {
  return executeCommand(
    document,
    document.replicaId,
    { type: "inspect" },
    heads,
  ).result.changes
}

export function librarySidecarAllChanges(
  document: LibrarySidecarDocument,
): LibrarySidecarAutomergeChange[] {
  return librarySidecarChangesSince(document, [])
}

export function librarySidecarMissingDependencies(
  document: LibrarySidecarDocument,
  heads: string[],
): string[] {
  return executeCommand(
    document,
    document.replicaId,
    { type: "inspectDependencies", heads },
    document.heads,
  ).result.missingDependencies
}

export function setLibrarySidecarIdentity(
  document: LibrarySidecarDocument,
  libraryUuid: string,
  recordedAt: number,
): LibrarySidecarDocument {
  return executeCommand(
    document,
    document.replicaId,
    { type: "setLibraryIdentity", libraryUuid, recordedAt },
    document.heads,
    null,
    libraryUuid,
  ).document
}

export function assertLibrarySidecarIdentity(
  document: LibrarySidecarDocument,
  libraryUuid: string,
): void {
  if (document.libraryUuid !== null && document.libraryUuid !== libraryUuid) {
    throw new Error("Automerge document belongs to a different library")
  }
}

export function setLibrarySidecarReadingPosition(
  document: LibrarySidecarDocument,
  bookId: number,
  value: LibrarySidecarReadingPosition,
): LibrarySidecarDocument {
  return executeCommand(
    document,
    document.replicaId,
    { type: "setReadingPosition", bookId, value },
    document.heads,
  ).document
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

export function resolveLibrarySidecarReadingPosition(
  document: LibrarySidecarDocument,
  bookId: number,
  format: ReadingFormat,
  operationId: string,
  recordedAt: number,
): LibrarySidecarDocument {
  return executeCommand(
    document,
    document.replicaId,
    {
      type: "resolveReadingPosition",
      bookId,
      format,
      operationId,
      recordedAt,
    },
    document.heads,
  ).document
}

export function setLibrarySidecarFavorite(
  document: LibrarySidecarDocument,
  bookId: number,
  value: LibrarySidecarFavorite,
): LibrarySidecarDocument {
  return executeCommand(
    document,
    document.replicaId,
    { type: "setFavorite", bookId, value },
    document.heads,
  ).document
}

export function librarySidecarFavoriteProjections(
  document: LibrarySidecarDocument,
): Array<{ bookId: number; value: LibrarySidecarFavorite }> {
  return document.projection.favorites
}

export function setLibrarySidecarBookmark(
  document: LibrarySidecarDocument,
  value: LibrarySidecarBookmark,
): LibrarySidecarDocument {
  return executeCommand(
    document,
    document.replicaId,
    { type: "setBookmark", value },
    document.heads,
  ).document
}

export function librarySidecarBookmarkProjections(
  document: LibrarySidecarDocument,
): LibrarySidecarBookmark[] {
  return document.projection.bookmarks
}

export function createLibrarySidecarAnnotation(
  document: LibrarySidecarDocument,
  value: LibrarySidecarAnnotationValue,
): LibrarySidecarDocument {
  return executeCommand(
    document,
    document.replicaId,
    { type: "createAnnotation", value },
    document.heads,
  ).document
}

export function updateLibrarySidecarAnnotation(
  document: LibrarySidecarDocument,
  id: string,
  color: string,
  note: string | null,
  updatedAt: number,
): LibrarySidecarDocument {
  return executeCommand(
    document,
    document.replicaId,
    { type: "updateAnnotation", id, color, note, updatedAt },
    document.heads,
  ).document
}

export function deleteLibrarySidecarAnnotation(
  document: LibrarySidecarDocument,
  id: string,
  deletedAt: number,
): LibrarySidecarDocument {
  return executeCommand(
    document,
    document.replicaId,
    { type: "deleteAnnotation", id, deletedAt },
    document.heads,
  ).document
}

export function librarySidecarAnnotationProjections(
  document: LibrarySidecarDocument,
): LibrarySidecarAnnotationValue[] {
  return document.projection.annotations
}

export function addLibrarySidecarReadingSessionDuration(
  document: LibrarySidecarDocument,
  value: LibrarySidecarReadingSession,
): LibrarySidecarDocument {
  return executeCommand(
    document,
    document.replicaId,
    { type: "addReadingSessionDuration", value },
    document.heads,
  ).document
}

export function librarySidecarReadingSessionProjections(
  document: LibrarySidecarDocument,
): LibrarySidecarReadingSession[] {
  return document.projection.readingSessions
}

export function addLibrarySidecarReadingCompletion(
  document: LibrarySidecarDocument,
  value: LibrarySidecarReadingCompletion,
): LibrarySidecarDocument {
  return executeCommand(
    document,
    document.replicaId,
    { type: "addReadingCompletion", value },
    document.heads,
  ).document
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
