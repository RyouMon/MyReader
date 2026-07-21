import { isCurrentReaderBookmarkLocatorKey } from "@my-reader/tools/reader-bookmarks"
import type { ReaderBookmarkChangeRow } from "../../repos/bookmarks"
import type { ReadingProgressChangeRow } from "../../repos/reading-progress"

export type DbChangeRow = {
  t: string
  k: Record<string, unknown>
  v: Record<string, unknown>
}

export type DbPushCursor = {
  ts: number
  seen: string[]
}

const FNV1A_128_OFFSET = 0x6c62272e07bb014262b821756295c58dn
const FNV1A_128_PRIME = 0x0000000001000000000000000000013bn
const UINT128_MASK = (1n << 128n) - 1n
let lastAllocatedChangeSequence = 0

export function dbSyncLastPushCursorKey(deviceId: string): string {
  return `last_push_cursor_v3::${deviceId}`
}

export function dbSyncLastExternalMirrorSeqKey(deviceId: string): string {
  return `last_external_mirror_seq_v3::${deviceId}`
}

export function dbSyncLastPullCursorKey(
  deviceId: string,
  remoteDeviceId: string,
): string {
  return `last_pull_cursor_v3::${deviceId}::${remoteDeviceId}`
}

export function dbSyncLastLocalSequenceKey(deviceId: string): string {
  return `last_local_change_seq_v3::${deviceId}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function positiveSafeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function nonBlankString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

function trimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isValidReaderLocatorJson(value: string): boolean {
  let locator: unknown
  try {
    locator = JSON.parse(value) as unknown
  } catch {
    return false
  }
  if (!isRecord(locator)) return false
  if (nonEmptyString(locator.href) === null) return false
  if (nonEmptyString(locator.type) === null) return false
  if (Object.hasOwn(locator, "locations") && !isRecord(locator.locations)) {
    return false
  }
  return true
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function canonicalJsonValue(value: unknown): string | undefined {
  if (value === null) return "null"
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value)
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? JSON.stringify(value) : "null"
  }
  if (Array.isArray(value)) {
    return `[${value
      .map((item) => canonicalJsonValue(item) ?? "null")
      .join(",")}]`
  }
  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .flatMap((key) => {
        const item = canonicalJsonValue(value[key])
        return item === undefined ? [] : [`${JSON.stringify(key)}:${item}`]
      })
    return `{${entries.join(",")}}`
  }
  return undefined
}

function shortStableHash(value: string): string {
  let hash = FNV1A_128_OFFSET
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte)
    hash = (hash * FNV1A_128_PRIME) & UINT128_MASK
  }
  return hash.toString(16).padStart(32, "0")
}

export function dbChangeRevisionFingerprint(change: DbChangeRow): string {
  return shortStableHash(canonicalJsonValue(change) ?? "null")
}

export function parseDbPushCursor(value: string | null): DbPushCursor {
  if (value === null) return { ts: 0, seen: [] }

  const legacyTs = Number(value)
  if (Number.isFinite(legacyTs) && legacyTs >= 0) {
    return { ts: legacyTs, seen: [] }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(value) as unknown
  } catch {
    return { ts: 0, seen: [] }
  }
  if (!isRecord(parsed)) return { ts: 0, seen: [] }

  const ts = finiteNumber(parsed.ts)
  if (ts === null || ts < 0 || !Array.isArray(parsed.seen)) {
    return { ts: 0, seen: [] }
  }
  const seen = [
    ...new Set(
      parsed.seen.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      ),
    ),
  ].sort()
  return { ts, seen }
}

export function serializeDbPushCursor(cursor: DbPushCursor): string {
  return JSON.stringify({
    ts: cursor.ts,
    seen: [...new Set(cursor.seen)].sort(),
  })
}

export function selectPendingDbChanges(
  changes: readonly DbChangeRow[],
  cursor: DbPushCursor,
): DbChangeRow[] {
  const seen = new Set(cursor.seen)
  return changes.filter((change) => {
    const updatedAt = dbChangeUpdatedAt(change)
    return (
      updatedAt > cursor.ts ||
      (updatedAt === cursor.ts &&
        !seen.has(dbChangeRevisionFingerprint(change)))
    )
  })
}

export function advanceDbPushCursor(
  cursor: DbPushCursor,
  changes: readonly DbChangeRow[],
): DbPushCursor {
  if (changes.length === 0) return { ...cursor, seen: [...cursor.seen] }

  const maxTs = Math.max(
    cursor.ts,
    ...changes.map((change) => dbChangeUpdatedAt(change)),
  )
  const boundaryFingerprints = changes
    .filter((change) => dbChangeUpdatedAt(change) === maxTs)
    .map(dbChangeRevisionFingerprint)
  const seen =
    maxTs === cursor.ts
      ? [...cursor.seen, ...boundaryFingerprints]
      : boundaryFingerprints
  return { ts: maxTs, seen: [...new Set(seen)].sort() }
}

/** Synchronous allocation keeps same-process change file names monotonic. */
export function allocateDbChangeSequence(
  persistedSequence: number,
  now = Date.now(),
): number {
  const next = Math.max(
    Math.floor(now),
    Math.floor(persistedSequence) + 1,
    lastAllocatedChangeSequence + 1,
  )
  lastAllocatedChangeSequence = next
  return next
}

export function parseDbChangeRow(value: unknown): DbChangeRow | null {
  if (!isRecord(value)) return null
  if (typeof value.t !== "string") return null
  if (!isRecord(value.k) || !isRecord(value.v)) return null
  return { t: value.t, k: value.k, v: value.v }
}

export function dbChangeUpdatedAt(change: DbChangeRow): number {
  return finiteNumber(change.v.updated_at) ?? 0
}

export function buildDbChangeRows(
  readingProgressRows: readonly ReadingProgressChangeRow[],
  bookmarkRows: readonly ReaderBookmarkChangeRow[],
): DbChangeRow[] {
  const changes: DbChangeRow[] = [
    ...readingProgressRows.map(
      (row): DbChangeRow => ({
        t: "reading_progress",
        k: { book_id: row.bookId, format: row.format.toUpperCase() },
        v: {
          locator_json: row.locatorJson,
          display_progression: row.displayProgression,
          updated_at: row.updatedAt,
        },
      }),
    ),
    ...bookmarkRows.map(
      (row): DbChangeRow => ({
        t: "bookmarks",
        k: {
          book_id: row.bookId,
          format: row.format.toUpperCase(),
          locator_key: row.locatorKey,
        },
        v: {
          id: row.id,
          locator_json: row.locatorJson,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
          deleted_at: row.deletedAt,
        },
      }),
    ),
  ]

  return changes.sort((left, right) => {
    const byUpdatedAt = dbChangeUpdatedAt(left) - dbChangeUpdatedAt(right)
    if (byUpdatedAt !== 0) return byUpdatedAt

    const byTable = compareStrings(left.t, right.t)
    if (byTable !== 0) return byTable
    return compareStrings(JSON.stringify(left.k), JSON.stringify(right.k))
  })
}

export function parseReadingProgressChange(
  change: DbChangeRow,
): ReadingProgressChangeRow | null {
  if (change.t !== "reading_progress") return null

  const bookId = positiveSafeInteger(change.k.book_id)
  const format = trimmedNonEmptyString(change.k.format)
  const locatorJson = nonEmptyString(change.v.locator_json)
  const rawDisplayProgression = change.v.display_progression
  const displayProgression =
    rawDisplayProgression == null ? null : finiteNumber(rawDisplayProgression)
  const updatedAt = finiteNumber(change.v.updated_at)
  if (
    bookId === null ||
    format === null ||
    locatorJson === null ||
    (rawDisplayProgression != null &&
      (displayProgression === null ||
        displayProgression < 0 ||
        displayProgression > 1)) ||
    updatedAt === null ||
    updatedAt <= 0
  ) {
    return null
  }

  return {
    bookId,
    format: format.toUpperCase(),
    locatorJson,
    displayProgression,
    updatedAt,
  }
}

export function parseReaderBookmarkChange(
  change: DbChangeRow,
): ReaderBookmarkChangeRow | null {
  if (change.t !== "bookmarks") return null

  const id = nonBlankString(change.v.id)
  const bookId = positiveSafeInteger(change.k.book_id)
  const format = trimmedNonEmptyString(change.k.format)
  const locatorKey = trimmedNonEmptyString(change.k.locator_key)
  const locatorJson = nonEmptyString(change.v.locator_json)
  const createdAt = finiteNumber(change.v.created_at)
  const updatedAt = finiteNumber(change.v.updated_at)
  const hasDeletedAt = Object.hasOwn(change.v, "deleted_at")
  const deletedAt =
    change.v.deleted_at === null ? null : finiteNumber(change.v.deleted_at)

  if (
    id === null ||
    bookId === null ||
    format === null ||
    locatorKey === null ||
    locatorKey.length > 2048 ||
    !isCurrentReaderBookmarkLocatorKey(locatorKey) ||
    locatorJson === null ||
    !isValidReaderLocatorJson(locatorJson) ||
    createdAt === null ||
    createdAt <= 0 ||
    updatedAt === null ||
    updatedAt <= 0 ||
    !hasDeletedAt ||
    (change.v.deleted_at !== null && deletedAt === null) ||
    (deletedAt !== null && deletedAt <= 0)
  ) {
    return null
  }

  return {
    id,
    bookId,
    format: format.toUpperCase(),
    locatorKey,
    locatorJson,
    createdAt,
    updatedAt,
    deletedAt,
  }
}
