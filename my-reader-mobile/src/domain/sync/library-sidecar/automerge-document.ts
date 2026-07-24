import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64"
import {
  change,
  decodeChange,
  getActorId,
  getChangesSince,
  getConflicts,
  getHeads,
  getMissingDeps,
  ImmutableString,
  initializeBase64Wasm,
  isImmutableString,
  isWasmInitialized,
  load,
  loadIncremental,
  save,
  saveSince,
  type Change,
  type Doc,
  type Heads,
} from "@automerge/automerge/slim"
import { decode as decodeBase64 } from "base-64"

import {
  LIBRARY_SIDECAR_GENESIS_BASE64,
  LIBRARY_SIDECAR_GENESIS_HEADS,
} from "./automerge-genesis.generated"
import {
  librarySidecarActorId,
  librarySidecarReplicaId,
} from "./automerge-identity"

export const LIBRARY_SIDECAR_SCHEMA_VERSION = 1

export type LibrarySidecarDocument = {
  schema: number
  libraryUuid?: ImmutableString
  favorites: Record<string, ImmutableString>
  positions: Record<string, ImmutableString>
  bookmarks: Record<string, ImmutableString>
  annotations: Record<string, LibrarySidecarAnnotation>
  sessions: Record<string, ImmutableString>
  completions: Record<string, ImmutableString>
}

export type LibrarySidecarFavorite = {
  isFavorite: boolean
  addedAt: number | null
  recordedAt: number
  replicaId: string
}

export type LibrarySidecarBookmark = {
  id: string
  bookId: number
  format: "EPUB" | "PDF" | "CBZ"
  locatorKey: string
  locatorJson: string
  createdAt: number
  deletedAt: number | null
  recordedAt: number
  replicaId: string
}

export type LibrarySidecarAnnotation = {
  id: ImmutableString
  bookId: number
  format: ImmutableString
  kind: ImmutableString
  locatorJson: ImmutableString
  createdAt: number
  color: ImmutableString
  note: ImmutableString | null
  updatedAt: number
  deleted: boolean
  deletedAt: number | null
}

export type LibrarySidecarAnnotationValue = {
  id: string
  bookId: number
  format: "EPUB" | "PDF" | "CBZ"
  kind: "highlight"
  locatorJson: string
  createdAt: number
  color: string
  note: string | null
  updatedAt: number
  deleted: boolean
  deletedAt: number | null
}

export type LibrarySidecarReadingSession = {
  id: string
  originReplicaId: string
  bookId: number
  format: "EPUB" | "PDF" | "CBZ"
  localDay: string
  startedAt: number
  durationSeconds: number
  updatedAt: number
}

export type LibrarySidecarReadingCompletion = {
  id: string
  bookId: number
  format: "EPUB" | "PDF" | "CBZ"
  localDay: string
  completedAt: number
  updatedAt: number
  replicaId: string
}

export type LibrarySidecarReadingPosition = {
  format: "EPUB" | "PDF" | "CBZ"
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

let initialization: Promise<void> | null = null

function binaryStringToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length)
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index)
  }
  return bytes
}

export function initializeLibrarySidecarAutomerge(): Promise<void> {
  if (isWasmInitialized()) return Promise.resolve()
  initialization ??= initializeBase64Wasm(automergeWasmBase64)
  return initialization
}

export async function createLibrarySidecarDocument(
  replicaId: string,
): Promise<Doc<LibrarySidecarDocument>> {
  const actor = librarySidecarActorId(replicaId)
  await initializeLibrarySidecarAutomerge()
  const bytes = binaryStringToBytes(
    decodeBase64(LIBRARY_SIDECAR_GENESIS_BASE64),
  )
  const document = load<LibrarySidecarDocument>(bytes, {
    actor,
  })
  const heads = getHeads(document)
  if (
    document.schema !== LIBRARY_SIDECAR_SCHEMA_VERSION ||
    JSON.stringify(heads) !== JSON.stringify(LIBRARY_SIDECAR_GENESIS_HEADS)
  ) {
    throw new Error(
      `canonical library sidecar genesis is invalid: schema=${document.schema}, heads=${JSON.stringify(heads)}`,
    )
  }
  return document
}

export async function loadLibrarySidecarDocument(
  bytes: Uint8Array,
  replicaId: string,
): Promise<Doc<LibrarySidecarDocument>> {
  const actor = librarySidecarActorId(replicaId)
  await initializeLibrarySidecarAutomerge()
  const document = load<LibrarySidecarDocument>(bytes, { actor })
  if (document.schema !== LIBRARY_SIDECAR_SCHEMA_VERSION) {
    throw new Error(`unsupported Automerge schema ${document.schema}`)
  }
  return document
}

export function librarySidecarDocumentHeads(
  document: Doc<LibrarySidecarDocument>,
): string[] {
  return [...getHeads(document)].sort()
}

export function saveLibrarySidecarDocument(
  document: Doc<LibrarySidecarDocument>,
): Uint8Array {
  return save(document)
}

export function saveLibrarySidecarIncremental(
  document: Doc<LibrarySidecarDocument>,
  heads: Heads,
): Uint8Array {
  return saveSince(document, heads)
}

export function applyLibrarySidecarIncremental(
  document: Doc<LibrarySidecarDocument>,
  bytes: Uint8Array,
): Doc<LibrarySidecarDocument> {
  return loadIncremental(document, bytes)
}

function describeChange(changeBytes: Change): LibrarySidecarAutomergeChange {
  const decoded = decodeChange(changeBytes)
  return {
    actorId: decoded.actor,
    sequence: decoded.seq.toString(),
    hash: decoded.hash,
    bytes: Uint8Array.from(changeBytes),
  }
}

export function librarySidecarChangesSince(
  document: Doc<LibrarySidecarDocument>,
  heads: Heads,
): LibrarySidecarAutomergeChange[] {
  return getChangesSince(document, heads).map(describeChange)
}

export function librarySidecarAllChanges(
  document: Doc<LibrarySidecarDocument>,
): LibrarySidecarAutomergeChange[] {
  return getChangesSince(document, []).map(describeChange)
}

export function librarySidecarMissingDependencies(
  document: Doc<LibrarySidecarDocument>,
  heads: Heads,
): string[] {
  return getMissingDeps(document, heads)
}

export function setLibrarySidecarIdentity(
  document: Doc<LibrarySidecarDocument>,
  libraryUuid: string,
  recordedAt: number,
): Doc<LibrarySidecarDocument> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      libraryUuid,
    )
  ) {
    throw new Error("library identity must be a lowercase UUID")
  }
  assertLibrarySidecarIdentity(document, libraryUuid)
  return change(
    document,
    {
      message: "myreader:set-library-identity",
      time: Math.floor(recordedAt / 1000),
    },
    (draft) => {
      draft.libraryUuid = new ImmutableString(libraryUuid)
    },
  )
}

export function assertLibrarySidecarIdentity(
  document: Doc<LibrarySidecarDocument>,
  libraryUuid: string,
): void {
  const identities = Object.values(getConflicts(document, "libraryUuid") ?? {})
  if (identities.length === 0) {
    return
  }
  if (
    identities.some(
      (identity) =>
        automergeString(identity, "library identity") !== libraryUuid,
    )
  ) {
    throw new Error("Automerge document belongs to a different library")
  }
}

function readingPositionKey(bookId: number, format: string): string {
  if (!Number.isSafeInteger(bookId) || bookId < 1) {
    throw new Error("book ID must be a positive safe integer")
  }
  if (!["EPUB", "PDF", "CBZ"].includes(format)) {
    throw new Error("reading position format is unsupported")
  }
  return `${bookId}:${format}`
}

function validateReadingPosition(value: LibrarySidecarReadingPosition): void {
  readingPositionKey(1, value.format)
  if (
    value.displayProgressionPpm !== null &&
    (!Number.isSafeInteger(value.displayProgressionPpm) ||
      value.displayProgressionPpm < 0 ||
      value.displayProgressionPpm > 1_000_000)
  ) {
    throw new Error("reading position display progression is out of range")
  }
  librarySidecarActorId(value.replicaId)
}

function automergeString(value: unknown, name: string): string {
  if (typeof value === "string") return value
  if (isImmutableString(value)) return value.toString()
  throw new Error(`${name} is not a string`)
}

function decodeReadingPosition(value: unknown): LibrarySidecarReadingPosition {
  const decoded = JSON.parse(
    automergeString(value, "reading position value"),
  ) as LibrarySidecarReadingPosition
  validateReadingPosition(decoded)
  return decoded
}

export function setLibrarySidecarReadingPosition(
  document: Doc<LibrarySidecarDocument>,
  bookId: number,
  value: LibrarySidecarReadingPosition,
): Doc<LibrarySidecarDocument> {
  validateReadingPosition(value)
  const key = readingPositionKey(bookId, value.format)
  return change(
    document,
    {
      message: "myreader:set-reading-position",
      time: Math.floor(value.recordedAt / 1000),
    },
    (draft) => {
      draft.positions[key] = new ImmutableString(JSON.stringify(value))
    },
  )
}

export function librarySidecarReadingPositionCandidates(
  document: Doc<LibrarySidecarDocument>,
  bookId: number,
  format: LibrarySidecarReadingPosition["format"],
): LibrarySidecarReadingPositionCandidate[] {
  const key = readingPositionKey(bookId, format)
  return Object.entries(getConflicts(document.positions, key) ?? {})
    .map(([operationId, encoded]) => {
      return { operationId, value: decodeReadingPosition(encoded) }
    })
    .sort((left, right) => left.operationId.localeCompare(right.operationId))
}

export function librarySidecarReadingPositionProjections(
  document: Doc<LibrarySidecarDocument>,
): LibrarySidecarReadingPositionProjection[] {
  return Object.entries(document.positions)
    .map(([key, encoded]) => {
      const separator = key.lastIndexOf(":")
      const bookId = Number(key.slice(0, separator))
      const value = decodeReadingPosition(encoded)
      if (readingPositionKey(bookId, value.format) !== key) {
        throw new Error("reading position key does not match its value")
      }
      const conflicts = librarySidecarReadingPositionCandidates(
        document,
        bookId,
        value.format,
      )
      return {
        bookId,
        value,
        conflictCount: Math.max(1, conflicts.length),
      }
    })
    .sort(
      (left, right) =>
        left.bookId - right.bookId ||
        left.value.format.localeCompare(right.value.format),
    )
}

export function resolveLibrarySidecarReadingPosition(
  document: Doc<LibrarySidecarDocument>,
  bookId: number,
  format: LibrarySidecarReadingPosition["format"],
  operationId: string,
  recordedAt: number,
): Doc<LibrarySidecarDocument> {
  const candidate = librarySidecarReadingPositionCandidates(
    document,
    bookId,
    format,
  ).find((item) => item.operationId === operationId)
  if (!candidate) {
    throw new Error("reading position candidate does not exist")
  }
  return setLibrarySidecarReadingPosition(document, bookId, {
    ...candidate.value,
    recordedAt,
    replicaId: librarySidecarReplicaId(getActorId(document)),
  })
}

function validateReplicaValue(replicaId: string): void {
  librarySidecarActorId(replicaId)
}

function validateBookFormat(
  bookId: number,
  format: string,
): asserts format is "EPUB" | "PDF" | "CBZ" {
  readingPositionKey(bookId, format)
}

export function setLibrarySidecarFavorite(
  document: Doc<LibrarySidecarDocument>,
  bookId: number,
  value: LibrarySidecarFavorite,
): Doc<LibrarySidecarDocument> {
  if (!Number.isSafeInteger(bookId) || bookId < 1) {
    throw new Error("favorite book ID is invalid")
  }
  validateReplicaValue(value.replicaId)
  return change(
    document,
    {
      message: "myreader:set-favorite",
      time: Math.floor(value.recordedAt / 1000),
    },
    (draft) => {
      draft.favorites[String(bookId)] = new ImmutableString(
        JSON.stringify(value),
      )
    },
  )
}

export function librarySidecarFavoriteProjections(
  document: Doc<LibrarySidecarDocument>,
): Array<{ bookId: number; value: LibrarySidecarFavorite }> {
  return Object.entries(document.favorites)
    .map(([key, encoded]) => {
      const bookId = Number(key)
      const value = JSON.parse(
        automergeString(encoded, "favorite value"),
      ) as LibrarySidecarFavorite
      if (!Number.isSafeInteger(bookId) || bookId < 1) {
        throw new Error("favorite key is invalid")
      }
      validateReplicaValue(value.replicaId)
      return { bookId, value }
    })
    .sort((left, right) => left.bookId - right.bookId)
}

function bookmarkKey(value: {
  bookId: number
  format: string
  locatorKey: string
}): string {
  validateBookFormat(value.bookId, value.format)
  if (value.locatorKey.length === 0) {
    throw new Error("bookmark locator key is empty")
  }
  return `${value.bookId}:${value.format}:${value.locatorKey}`
}

export function setLibrarySidecarBookmark(
  document: Doc<LibrarySidecarDocument>,
  value: LibrarySidecarBookmark,
): Doc<LibrarySidecarDocument> {
  const key = bookmarkKey(value)
  validateReplicaValue(value.replicaId)
  return change(
    document,
    {
      message: "myreader:set-bookmark",
      time: Math.floor(value.recordedAt / 1000),
    },
    (draft) => {
      draft.bookmarks[key] = new ImmutableString(JSON.stringify(value))
    },
  )
}

export function librarySidecarBookmarkProjections(
  document: Doc<LibrarySidecarDocument>,
): LibrarySidecarBookmark[] {
  return Object.entries(document.bookmarks)
    .map(([key, encoded]) => {
      const value = JSON.parse(
        automergeString(encoded, "bookmark value"),
      ) as LibrarySidecarBookmark
      if (bookmarkKey(value) !== key) {
        throw new Error("bookmark key does not match its value")
      }
      validateReplicaValue(value.replicaId)
      return value
    })
    .sort(
      (left, right) =>
        left.bookId - right.bookId ||
        left.format.localeCompare(right.format) ||
        left.locatorKey.localeCompare(right.locatorKey),
    )
}

function validateAnnotationValue(value: LibrarySidecarAnnotationValue): void {
  validateBookFormat(value.bookId, value.format)
  if (
    !/^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/.test(value.id) ||
    value.kind !== "highlight" ||
    value.locatorJson.length === 0 ||
    value.color.length === 0
  ) {
    throw new Error("annotation value is invalid")
  }
}

export function createLibrarySidecarAnnotation(
  document: Doc<LibrarySidecarDocument>,
  value: LibrarySidecarAnnotationValue,
): Doc<LibrarySidecarDocument> {
  validateAnnotationValue(value)
  if (document.annotations[value.id]) {
    throw new Error("annotation already exists")
  }
  return change(
    document,
    {
      message: "myreader:create-annotation",
      time: Math.floor(value.createdAt / 1000),
    },
    (draft) => {
      draft.annotations[value.id] = {
        id: new ImmutableString(value.id),
        bookId: value.bookId,
        format: new ImmutableString(value.format),
        kind: new ImmutableString(value.kind),
        locatorJson: new ImmutableString(value.locatorJson),
        createdAt: value.createdAt,
        color: new ImmutableString(value.color),
        note: value.note === null ? null : new ImmutableString(value.note),
        updatedAt: value.updatedAt,
        deleted: false,
        deletedAt: null,
      }
    },
  )
}

export function updateLibrarySidecarAnnotation(
  document: Doc<LibrarySidecarDocument>,
  id: string,
  color: string,
  note: string | null,
  updatedAt: number,
): Doc<LibrarySidecarDocument> {
  if (!document.annotations[id]) throw new Error("annotation does not exist")
  return change(
    document,
    {
      message: "myreader:update-annotation",
      time: Math.floor(updatedAt / 1000),
    },
    (draft) => {
      const annotation = draft.annotations[id]
      if (!annotation) throw new Error("annotation does not exist")
      if (automergeString(annotation.color, "annotation color") !== color) {
        annotation.color = new ImmutableString(color)
      }
      const currentNote =
        annotation.note === null
          ? null
          : automergeString(annotation.note, "annotation note")
      if (currentNote !== note) {
        annotation.note = note === null ? null : new ImmutableString(note)
      }
      annotation.updatedAt = updatedAt
    },
  )
}

export function deleteLibrarySidecarAnnotation(
  document: Doc<LibrarySidecarDocument>,
  id: string,
  deletedAt: number,
): Doc<LibrarySidecarDocument> {
  if (!document.annotations[id]) throw new Error("annotation does not exist")
  return change(
    document,
    {
      message: "myreader:delete-annotation",
      time: Math.floor(deletedAt / 1000),
    },
    (draft) => {
      const annotation = draft.annotations[id]
      if (!annotation) throw new Error("annotation does not exist")
      annotation.deleted = true
      annotation.deletedAt = deletedAt
      annotation.updatedAt = deletedAt
    },
  )
}

export function librarySidecarAnnotationProjections(
  document: Doc<LibrarySidecarDocument>,
): LibrarySidecarAnnotationValue[] {
  return Object.entries(document.annotations)
    .map(([id, annotation]) => {
      const deletedValues = Object.values(
        getConflicts(annotation, "deleted") ?? {},
      )
      const deleted =
        annotation.deleted || deletedValues.some((value) => value === true)
      const deletedAtValues = [
        annotation.deletedAt,
        ...Object.values(getConflicts(annotation, "deletedAt") ?? {}),
      ].filter((value): value is number => typeof value === "number")
      const value: LibrarySidecarAnnotationValue = {
        id: automergeString(annotation.id, "annotation ID"),
        bookId: annotation.bookId,
        format: automergeString(
          annotation.format,
          "annotation format",
        ) as LibrarySidecarAnnotationValue["format"],
        kind: automergeString(
          annotation.kind,
          "annotation kind",
        ) as "highlight",
        locatorJson: automergeString(
          annotation.locatorJson,
          "annotation locator",
        ),
        createdAt: annotation.createdAt,
        color: automergeString(annotation.color, "annotation color"),
        note:
          annotation.note === null
            ? null
            : automergeString(annotation.note, "annotation note"),
        updatedAt: annotation.updatedAt,
        deleted,
        deletedAt:
          deleted && deletedAtValues.length > 0
            ? Math.min(...deletedAtValues)
            : null,
      }
      if (id !== value.id) throw new Error("annotation key is invalid")
      validateAnnotationValue(value)
      return value
    })
    .sort((left, right) => left.id.localeCompare(right.id))
}

function validateCompactId(id: string, name: string): void {
  if (!/^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/.test(id)) {
    throw new Error(`${name} ID is invalid`)
  }
}

export function addLibrarySidecarReadingSessionDuration(
  document: Doc<LibrarySidecarDocument>,
  interval: LibrarySidecarReadingSession,
): Doc<LibrarySidecarDocument> {
  validateCompactId(interval.id, "reading session")
  validateBookFormat(interval.bookId, interval.format)
  validateReplicaValue(interval.originReplicaId)
  if (
    librarySidecarReplicaId(getActorId(document)) !== interval.originReplicaId
  ) {
    throw new Error("only the origin replica can update a reading session")
  }
  const currentEncoded = document.sessions[interval.id]
  const current = currentEncoded
    ? (JSON.parse(
        automergeString(currentEncoded, "reading session value"),
      ) as LibrarySidecarReadingSession)
    : null
  if (
    current &&
    (current.originReplicaId !== interval.originReplicaId ||
      current.bookId !== interval.bookId ||
      current.format !== interval.format ||
      current.localDay !== interval.localDay ||
      current.startedAt !== interval.startedAt)
  ) {
    throw new Error("reading session header is immutable")
  }
  if (
    !Number.isSafeInteger(interval.durationSeconds) ||
    interval.durationSeconds < 0
  ) {
    throw new Error("reading session duration is invalid")
  }
  const next = {
    ...(current ?? interval),
    durationSeconds: (current?.durationSeconds ?? 0) + interval.durationSeconds,
    updatedAt: interval.updatedAt,
  }
  return change(
    document,
    {
      message: "myreader:add-reading-session-duration",
      time: Math.floor(interval.updatedAt / 1000),
    },
    (draft) => {
      draft.sessions[interval.id] = new ImmutableString(JSON.stringify(next))
    },
  )
}

export function librarySidecarReadingSessionProjections(
  document: Doc<LibrarySidecarDocument>,
): LibrarySidecarReadingSession[] {
  return Object.entries(document.sessions)
    .map(([id, encoded]) => {
      const value = JSON.parse(
        automergeString(encoded, "reading session value"),
      ) as LibrarySidecarReadingSession
      validateCompactId(value.id, "reading session")
      validateBookFormat(value.bookId, value.format)
      validateReplicaValue(value.originReplicaId)
      if (
        id !== value.id ||
        !Number.isSafeInteger(value.durationSeconds) ||
        value.durationSeconds < 0
      ) {
        throw new Error("reading session value is invalid")
      }
      return value
    })
    .sort((left, right) => left.id.localeCompare(right.id))
}

export function addLibrarySidecarReadingCompletion(
  document: Doc<LibrarySidecarDocument>,
  completion: LibrarySidecarReadingCompletion,
): Doc<LibrarySidecarDocument> {
  validateCompactId(completion.id, "reading completion")
  validateBookFormat(completion.bookId, completion.format)
  validateReplicaValue(completion.replicaId)
  if (document.completions[completion.id]) {
    return document
  }
  return change(
    document,
    {
      message: "myreader:add-reading-completion",
      time: Math.floor(completion.completedAt / 1000),
    },
    (draft) => {
      draft.completions[completion.id] = new ImmutableString(
        JSON.stringify(completion),
      )
    },
  )
}

export function librarySidecarReadingCompletionRecords(
  document: Doc<LibrarySidecarDocument>,
): LibrarySidecarReadingCompletion[] {
  return Object.entries(document.completions)
    .map(([id, encoded]) => {
      const value = JSON.parse(
        automergeString(encoded, "reading completion value"),
      ) as LibrarySidecarReadingCompletion
      validateCompactId(value.id, "reading completion")
      validateBookFormat(value.bookId, value.format)
      validateReplicaValue(value.replicaId)
      if (id !== value.id) throw new Error("reading completion key is invalid")
      return value
    })
    .sort(
      (left, right) =>
        left.completedAt - right.completedAt || left.id.localeCompare(right.id),
    )
}

export function librarySidecarReadingCompletionProjections(
  document: Doc<LibrarySidecarDocument>,
): LibrarySidecarReadingCompletion[] {
  const earliest = new Map<number, LibrarySidecarReadingCompletion>()
  for (const completion of librarySidecarReadingCompletionRecords(document)) {
    if (!earliest.has(completion.bookId)) {
      earliest.set(completion.bookId, completion)
    }
  }
  return [...earliest.values()].sort(
    (left, right) => left.bookId - right.bookId,
  )
}
