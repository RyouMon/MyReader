import { CryptoDigestAlgorithm, digest } from "expo-crypto"

import {
  LIBRARY_SIDECAR_HASH_PREFIX_HEX_LENGTH,
  LIBRARY_SIDECAR_MAX_SESSION_DURATION_SECONDS,
  LIBRARY_SIDECAR_PROTOCOL,
  type LibrarySidecarChange,
  type LibrarySidecarHlc,
  type LibrarySidecarProtocolError,
  type LibrarySidecarSegment,
  type LibrarySidecarState,
} from "./contract"
import {
  isLibrarySidecarHlcInFuture,
  LibrarySidecarContractError,
  parseLibrarySidecarHlc,
} from "./hlc"
import { assertLibrarySidecarWriter } from "./merge"

const LIBRARY_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const REPLICA_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const COMPACT_UUID_V4_PATTERN = /^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/
const SEQUENCE_PATTERN = /^[1-9][0-9]*$/
const HASH_PATTERN = /^[0-9a-f]{64}$/
const FILE_NAME_PATTERN = /^([1-9][0-9]*)-([0-9a-f]{32})\.json$/
const LOCAL_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const U64_MAX = (1n << 64n) - 1n
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder("utf-8", { fatal: true })

type UnknownRecord = Record<string, unknown>

export class LibrarySidecarSegmentError extends LibrarySidecarContractError {
  constructor(
    readonly code: LibrarySidecarProtocolError,
    message: string,
  ) {
    super(message)
    this.name = "LibrarySidecarSegmentError"
  }
}

export type LibrarySidecarPreparedSegment = {
  sequence: string
  path: string
  bytes: Uint8Array
  sha256: string
  changeIds: string[]
}

export type LibrarySidecarSegmentFileName = {
  sequence: string
  hashPrefix: string
}

function fail(code: LibrarySidecarProtocolError, message: string): never {
  throw new LibrarySidecarSegmentError(code, message)
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  )
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return bytesToHex(
    new Uint8Array(
      await digest(CryptoDigestAlgorithm.SHA256, Uint8Array.from(bytes).buffer),
    ),
  )
}

export function hashLibrarySidecarSegmentBytes(
  bytes: Uint8Array,
): Promise<string> {
  return sha256Hex(bytes)
}

export function assertLibrarySidecarLibraryUuid(value: string): void {
  if (!LIBRARY_UUID_PATTERN.test(value)) {
    fail("invalid_change", "library UUID must use lowercase canonical form")
  }
}

function record(value: unknown, field: string): UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_change", `${field} must be an object`)
  }
  return value as UnknownRecord
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("invalid_change", `${field} must be a non-empty string`)
  }
  return value
}

function safeInteger(value: unknown, field: string, minimum = 0): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum
  ) {
    fail("invalid_change", `${field} must be a safe integer`)
  }
  return value
}

function optionalTimestamp(value: unknown, field: string): number | null {
  return value === null ? null : safeInteger(value, field)
}

function validateClock(value: unknown, field: string, nowMs: number): string {
  const clock = nonEmptyString(value, field) as LibrarySidecarHlc
  try {
    parseLibrarySidecarHlc(clock)
  } catch {
    fail("invalid_change", `${field} must be a valid HLC`)
  }
  if (isLibrarySidecarHlcInFuture(clock, nowMs)) {
    fail("future_clock", `${field} exceeds the future clock limit`)
  }
  return clock
}

function validateFormat(value: unknown, field: string): string {
  const format = nonEmptyString(value, field)
  if (format !== format.toUpperCase()) {
    fail("invalid_change", `${field} must be uppercase`)
  }
  return format
}

function validateLocalDay(value: unknown, field: string): string {
  const localDay = nonEmptyString(value, field)
  if (!LOCAL_DAY_PATTERN.test(localDay)) {
    fail("invalid_change", `${field} must use YYYY-MM-DD`)
  }
  return localDay
}

function validateCompactUuid(value: unknown, field: string): string {
  const id = nonEmptyString(value, field)
  if (!COMPACT_UUID_V4_PATTERN.test(id)) {
    fail("invalid_change", `${field} must be a compact UUIDv4`)
  }
  return id
}

function validateReplicaUuid(value: unknown, field: string): string {
  const id = nonEmptyString(value, field)
  if (!REPLICA_UUID_PATTERN.test(id)) {
    fail("invalid_change", `${field} must be a UUIDv4`)
  }
  return id
}

function validateSequence(value: string, field: string): bigint {
  if (!SEQUENCE_PATTERN.test(value)) {
    fail("invalid_change", `${field} must be a positive decimal`)
  }
  const sequence = BigInt(value)
  if (sequence > U64_MAX) {
    fail("invalid_change", `${field} exceeds the u64 limit`)
  }
  return sequence
}

function validateLocator(value: unknown, field: string): void {
  const locator = record(value, field)
  nonEmptyString(locator.href, `${field}.href`)
  nonEmptyString(locator.type, `${field}.type`)
  if (locator.target !== undefined) {
    safeInteger(locator.target, `${field}.target`)
  }
  if (locator.title !== undefined && typeof locator.title !== "string") {
    fail("invalid_change", `${field}.title must be a string`)
  }
  for (const key of ["locations", "text"] as const) {
    if (locator[key] !== undefined) {
      record(locator[key], `${field}.${key}`)
    }
  }
}

function validateLww(
  value: unknown,
  field: string,
  nowMs: number,
  validateValue: (item: unknown, field: string) => void,
): void {
  const lww = record(value, field)
  validateClock(lww.clock, `${field}.clock`, nowMs)
  validateValue(lww.value, `${field}.value`)
}

function validateState(value: unknown, nowMs: number): LibrarySidecarState {
  const state = record(value, "state")
  const domain = nonEmptyString(state.domain, "state.domain")
  const book = () => safeInteger(state.bookId, "state.bookId", 1)

  switch (domain) {
    case "book_favorite.v1":
      book()
      validateLww(state.register, "state.register", nowMs, (item, field) => {
        const favorite = record(item, field)
        if (typeof favorite.isFavorite !== "boolean") {
          fail("invalid_change", `${field}.isFavorite must be boolean`)
        }
        const addedAt = optionalTimestamp(
          favorite.addedAtMs,
          `${field}.addedAtMs`,
        )
        if (favorite.isFavorite !== (addedAt !== null)) {
          fail("invalid_change", `${field}.addedAtMs must match isFavorite`)
        }
      })
      break
    case "reading_position.v1":
      book()
      validateFormat(state.format, "state.format")
      validateLww(state.register, "state.register", nowMs, (item, field) => {
        const position = record(item, field)
        validateLocator(position.locator, `${field}.locator`)
        if (
          position.displayProgression !== null &&
          (typeof position.displayProgression !== "number" ||
            !Number.isFinite(position.displayProgression) ||
            position.displayProgression < 0 ||
            position.displayProgression > 1)
        ) {
          fail(
            "invalid_change",
            `${field}.displayProgression must be between 0 and 1`,
          )
        }
      })
      break
    case "bookmark.v1":
      book()
      validateFormat(state.format, "state.format")
      nonEmptyString(state.locatorKey, "state.locatorKey")
      validateLww(state.register, "state.register", nowMs, (item, field) => {
        const bookmark = record(item, field)
        if (typeof bookmark.present !== "boolean") {
          fail("invalid_change", `${field}.present must be boolean`)
        }
        validateCompactUuid(bookmark.id, `${field}.id`)
        validateLocator(bookmark.locator, `${field}.locator`)
        safeInteger(bookmark.createdAtMs, `${field}.createdAtMs`)
        const deletedAt = optionalTimestamp(
          bookmark.deletedAtMs,
          `${field}.deletedAtMs`,
        )
        if (bookmark.present === (deletedAt !== null)) {
          fail("invalid_change", `${field}.deletedAtMs must match present`)
        }
      })
      break
    case "annotation.v1": {
      validateCompactUuid(state.id, "state.id")
      const header = record(state.header, "state.header")
      safeInteger(header.bookId, "state.header.bookId", 1)
      validateFormat(header.format, "state.header.format")
      nonEmptyString(header.kind, "state.header.kind")
      validateLocator(header.locator, "state.header.locator")
      safeInteger(header.createdAtMs, "state.header.createdAtMs")
      validateLww(state.color, "state.color", nowMs, (item, field) => {
        nonEmptyString(item, field)
      })
      validateLww(state.note, "state.note", nowMs, (item, field) => {
        if (item !== null && typeof item !== "string") {
          fail("invalid_change", `${field} must be a string or null`)
        }
      })
      if (state.tombstone !== null) {
        const tombstone = record(state.tombstone, "state.tombstone")
        validateClock(tombstone.clock, "state.tombstone.clock", nowMs)
        safeInteger(tombstone.deletedAtMs, "state.tombstone.deletedAtMs")
      }
      break
    }
    case "reading_session.v1": {
      validateCompactUuid(state.id, "state.id")
      const header = record(state.header, "state.header")
      validateReplicaUuid(
        header.originReplicaId,
        "state.header.originReplicaId",
      )
      safeInteger(header.bookId, "state.header.bookId", 1)
      validateFormat(header.format, "state.header.format")
      validateLocalDay(header.localDay, "state.header.localDay")
      safeInteger(header.startedAtMs, "state.header.startedAtMs")
      const duration = safeInteger(
        state.durationSeconds,
        "state.durationSeconds",
      )
      if (duration > LIBRARY_SIDECAR_MAX_SESSION_DURATION_SECONDS) {
        fail("invalid_change", "state.durationSeconds exceeds the limit")
      }
      break
    }
    case "reading_completion.v1":
      book()
      validateCompactUuid(state.id, "state.id")
      validateFormat(state.format, "state.format")
      validateLocalDay(state.localDay, "state.localDay")
      safeInteger(state.completedAtMs, "state.completedAtMs")
      break
    default:
      fail("unsupported_domain", `unsupported domain: ${domain}`)
  }

  return state as unknown as LibrarySidecarState
}

function validateChange(
  value: unknown,
  replicaId: string,
  nowMs: number,
): LibrarySidecarChange {
  const change = record(value, "change")
  validateCompactUuid(change.changeId, "change.changeId")
  const clock = validateClock(change.clock, "change.clock", nowMs)
  if (parseLibrarySidecarHlc(clock).replicaId !== replicaId) {
    fail("invalid_change", "change clock must belong to segment replica")
  }
  const state = validateState(change.state, nowMs)
  try {
    assertLibrarySidecarWriter(state, replicaId)
  } catch {
    fail("invalid_change", "change writer is not allowed for this state")
  }
  return change as unknown as LibrarySidecarChange
}

export function validateLibrarySidecarSegment(
  value: unknown,
  options: {
    libraryUuid?: string
    replicaId?: string
    sequence?: string
    nowMs?: number
  } = {},
): LibrarySidecarSegment {
  const segment = record(value, "segment")
  if (segment.protocol !== LIBRARY_SIDECAR_PROTOCOL) {
    fail("unsupported_protocol", "unsupported sidecar protocol")
  }
  const libraryUuid = nonEmptyString(segment.libraryUuid, "segment.libraryUuid")
  assertLibrarySidecarLibraryUuid(libraryUuid)
  if (options.libraryUuid && libraryUuid !== options.libraryUuid) {
    fail("library_mismatch", "segment belongs to another library")
  }
  const replicaId = validateReplicaUuid(segment.replicaId, "segment.replicaId")
  if (options.replicaId && replicaId !== options.replicaId) {
    fail("invalid_change", "segment replica does not match its directory")
  }
  const sequence = nonEmptyString(segment.sequence, "segment.sequence")
  validateSequence(sequence, "segment.sequence")
  if (options.sequence && sequence !== options.sequence) {
    fail("invalid_change", "segment sequence does not match its filename")
  }
  if (!Array.isArray(segment.changes) || segment.changes.length === 0) {
    fail("invalid_change", "segment.changes must not be empty")
  }

  const nowMs = options.nowMs ?? Date.now()
  const changeIds = new Set<string>()
  for (const rawChange of segment.changes) {
    const change = validateChange(rawChange, replicaId, nowMs)
    if (changeIds.has(change.changeId)) {
      fail("invalid_change", "segment contains a duplicate changeId")
    }
    changeIds.add(change.changeId)
  }
  return segment as unknown as LibrarySidecarSegment
}

export function encodeLibrarySidecarSegment(
  segment: LibrarySidecarSegment,
  nowMs?: number,
): Uint8Array {
  validateLibrarySidecarSegment(segment, { nowMs })
  return textEncoder.encode(JSON.stringify(segment))
}

export function decodeLibrarySidecarSegment(
  bytes: Uint8Array,
  options?: Parameters<typeof validateLibrarySidecarSegment>[1],
): LibrarySidecarSegment {
  let value: unknown
  try {
    value = JSON.parse(textDecoder.decode(bytes)) as unknown
  } catch {
    fail("invalid_json", "segment is not valid UTF-8 JSON")
  }
  return validateLibrarySidecarSegment(value, options)
}

export function parseLibrarySidecarSegmentFileName(
  fileName: string,
): LibrarySidecarSegmentFileName {
  const match = FILE_NAME_PATTERN.exec(fileName)
  if (!match) {
    fail("invalid_change", "invalid segment filename")
  }
  validateSequence(match[1]!, "segment filename sequence")
  return { sequence: match[1]!, hashPrefix: match[2]! }
}

export async function prepareLibrarySidecarSegment(
  segment: LibrarySidecarSegment,
  nowMs?: number,
): Promise<LibrarySidecarPreparedSegment> {
  const bytes = encodeLibrarySidecarSegment(segment, nowMs)
  const fullHash = await sha256Hex(bytes)
  const fileName = `${segment.sequence}-${fullHash.slice(
    0,
    LIBRARY_SIDECAR_HASH_PREFIX_HEX_LENGTH,
  )}.json`
  return {
    sequence: segment.sequence,
    path: `.myreader/changes-v4/${segment.replicaId}/${fileName}`,
    bytes,
    sha256: fullHash,
    changeIds: segment.changes.map((change) => change.changeId),
  }
}

export async function decodeLibrarySidecarSegmentFile(
  fileName: string,
  bytes: Uint8Array,
  options: {
    libraryUuid: string
    replicaId: string
    nowMs?: number
  },
): Promise<LibrarySidecarSegment> {
  const parsedName = parseLibrarySidecarSegmentFileName(fileName)
  const fullHash = await sha256Hex(bytes)
  if (
    !HASH_PATTERN.test(fullHash) ||
    fullHash.slice(0, LIBRARY_SIDECAR_HASH_PREFIX_HEX_LENGTH) !==
      parsedName.hashPrefix
  ) {
    fail("file_hash_mismatch", "segment hash does not match its filename")
  }
  return decodeLibrarySidecarSegment(bytes, {
    ...options,
    sequence: parsedName.sequence,
  })
}
