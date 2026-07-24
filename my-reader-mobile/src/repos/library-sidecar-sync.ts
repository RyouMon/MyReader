import type { Scalar, Transaction } from "@op-engineering/op-sqlite"

import type { Library } from "@my-reader/tools/types/library"
import { getLibraryDatabase } from "@/src/services/db/library-db"
import { uuid } from "@/src/utils/common"

export type LibrarySidecarSyncTransaction = Transaction

export type LibrarySidecarLocalMetaRow = {
  protocol: string
  libraryUuid: string
  replicaId: string
}

export type LibrarySidecarReadingPositionRow = {
  id: string
  bookId: number
  format: string
  locatorJson: string
  displayProgression: number | null
  updatedAt: number
  syncConflictCount: number
}

export type LibrarySidecarFavoriteRow = {
  id: string
  bookId: number
  addedAt: number
  isFavorite: boolean
}

export type LibrarySidecarBookmarkRow = {
  id: string
  bookId: number
  format: string
  locatorKey: string
  locatorJson: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export type LibrarySidecarAnnotationRow = {
  id: string
  bookId: number
  format: string
  kind: string
  locatorJson: string
  color: string
  note: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

type DbRow = Record<string, Scalar>

function requiredString(row: DbRow, key: string): string {
  const value = row[key]
  if (typeof value !== "string") {
    throw new Error(`Expected ${key} to be text`)
  }
  return value
}

function optionalString(row: DbRow, key: string): string | null {
  const value = row[key]
  if (value === null) return null
  return requiredString(row, key)
}

/**
 * This repository intentionally uses OP-SQLite's native transaction and raw
 * SQL instead of the Drizzle OP-SQLite adapter. The Drizzle adapter commits
 * immediately after invoking a transaction callback without awaiting an async
 * callback, but sync mutations must keep awaited Automerge state, outbox, and
 * projection writes in one transaction. OP-SQLite's native transaction awaits
 * the callback correctly, but its transaction handle exposes only execute()
 * and cannot be wrapped as a Drizzle connection. Raw SQL stays confined here
 * so those transaction boundaries remain explicit and atomic.
 */
export async function withLibrarySidecarSyncTransaction<T>(
  library: Library,
  operation: (tx: LibrarySidecarSyncTransaction) => Promise<T>,
): Promise<T> {
  const { raw } = await getLibraryDatabase(library)
  let result: T | undefined
  await raw.transaction(async (tx) => {
    result = await operation(tx)
  })
  return result as T
}

export async function readLibrarySidecarLocalMeta(
  tx: LibrarySidecarSyncTransaction,
): Promise<LibrarySidecarLocalMetaRow | null> {
  const result = await tx.execute(
    "SELECT protocol, library_uuid, replica_id FROM sync_local_meta LIMIT 1",
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    protocol: requiredString(row, "protocol"),
    libraryUuid: requiredString(row, "library_uuid"),
    replicaId: requiredString(row, "replica_id"),
  }
}

export async function insertLibrarySidecarLocalMeta(
  tx: LibrarySidecarSyncTransaction,
  row: LibrarySidecarLocalMetaRow,
): Promise<void> {
  await tx.execute(
    `INSERT INTO sync_local_meta
      (id, protocol, library_uuid, replica_id)
      VALUES (?, ?, ?, ?)`,
    [uuid(), row.protocol, row.libraryUuid, row.replicaId],
  )
}

export async function readLibrarySidecarFavorite(
  tx: LibrarySidecarSyncTransaction,
  bookId: number,
): Promise<LibrarySidecarFavoriteRow | null> {
  const result = await tx.execute(
    `SELECT id, book_id, added_at, is_favorite
      FROM favorite_books
      WHERE book_id = ?`,
    [bookId],
  )
  const row = result.rows[0]
  if (!row) return null
  const addedAt = row.added_at
  const isFavorite = row.is_favorite
  if (typeof addedAt !== "number") {
    throw new Error("Expected added_at to be numeric")
  }
  if (isFavorite !== 0 && isFavorite !== 1) {
    throw new Error("Expected is_favorite to be boolean")
  }
  return {
    id: requiredString(row, "id"),
    bookId: Number(row.book_id),
    addedAt,
    isFavorite: isFavorite === 1,
  }
}

export async function writeLibrarySidecarFavorite(
  tx: LibrarySidecarSyncTransaction,
  row: Omit<LibrarySidecarFavoriteRow, "id">,
): Promise<void> {
  await tx.execute(
    `INSERT INTO favorite_books
      (id, book_id, added_at, is_favorite)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(book_id) DO UPDATE SET
        added_at = excluded.added_at,
        is_favorite = excluded.is_favorite`,
    [uuid(), row.bookId, row.addedAt, row.isFavorite ? 1 : 0],
  )
}

export async function readLibrarySidecarBookmark(
  tx: LibrarySidecarSyncTransaction,
  bookId: number,
  format: string,
  locatorKey: string,
): Promise<LibrarySidecarBookmarkRow | null> {
  const result = await tx.execute(
    `SELECT id, book_id, format, locator_key, locator_json,
        created_at, updated_at, deleted_at
      FROM bookmarks
      WHERE book_id = ? AND format = ? AND locator_key = ?`,
    [bookId, format, locatorKey],
  )
  const row = result.rows[0]
  if (!row) return null
  const createdAt = row.created_at
  const updatedAt = row.updated_at
  const deletedAt = row.deleted_at
  if (
    typeof createdAt !== "number" ||
    typeof updatedAt !== "number" ||
    (deletedAt !== null && typeof deletedAt !== "number")
  ) {
    throw new Error("Expected bookmark timestamps to be numeric")
  }
  return {
    id: requiredString(row, "id"),
    bookId: Number(row.book_id),
    format: requiredString(row, "format"),
    locatorKey: requiredString(row, "locator_key"),
    locatorJson: requiredString(row, "locator_json"),
    createdAt,
    updatedAt,
    deletedAt,
  }
}

export async function writeLibrarySidecarBookmark(
  tx: LibrarySidecarSyncTransaction,
  row: LibrarySidecarBookmarkRow,
): Promise<LibrarySidecarBookmarkRow> {
  await tx.execute(
    `INSERT INTO bookmarks
      (id, book_id, format, locator_key, locator_json,
        created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(book_id, format, locator_key) DO UPDATE SET
        id = excluded.id,
        locator_json = excluded.locator_json,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at`,
    [
      row.id,
      row.bookId,
      row.format,
      row.locatorKey,
      row.locatorJson,
      row.createdAt,
      row.updatedAt,
      row.deletedAt,
    ],
  )
  const stored = await readLibrarySidecarBookmark(
    tx,
    row.bookId,
    row.format,
    row.locatorKey,
  )
  if (!stored) throw new Error("Bookmark state write returned no row")
  return stored
}

export async function readLibrarySidecarReadingPosition(
  tx: LibrarySidecarSyncTransaction,
  bookId: number,
  format: string,
): Promise<LibrarySidecarReadingPositionRow | null> {
  const result = await tx.execute(
    `SELECT id, book_id, format, locator_json, display_progression, updated_at,
        sync_conflict_count
      FROM reading_progress
      WHERE book_id = ? AND format = ?`,
    [bookId, format],
  )
  const row = result.rows[0]
  if (!row) return null
  const displayProgression = row.display_progression
  const updatedAt = row.updated_at
  if (displayProgression !== null && typeof displayProgression !== "number") {
    throw new Error("Expected display_progression to be numeric")
  }
  if (typeof updatedAt !== "number") {
    throw new Error("Expected updated_at to be numeric")
  }
  return {
    id: requiredString(row, "id"),
    bookId: Number(row.book_id),
    format: requiredString(row, "format"),
    locatorJson: requiredString(row, "locator_json"),
    displayProgression,
    updatedAt,
    syncConflictCount: Number(row.sync_conflict_count),
  }
}

export async function writeLibrarySidecarReadingPosition(
  tx: LibrarySidecarSyncTransaction,
  row: Omit<LibrarySidecarReadingPositionRow, "id">,
): Promise<void> {
  await tx.execute(
    `INSERT INTO reading_progress
      (id, book_id, format, locator_json, display_progression, updated_at,
        sync_conflict_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(book_id, format) DO UPDATE SET
        locator_json = excluded.locator_json,
        display_progression = excluded.display_progression,
        updated_at = excluded.updated_at,
        sync_conflict_count = excluded.sync_conflict_count`,
    [
      uuid(),
      row.bookId,
      row.format,
      row.locatorJson,
      row.displayProgression,
      row.updatedAt,
      row.syncConflictCount,
    ],
  )
}

export async function readLibrarySidecarAnnotation(
  tx: LibrarySidecarSyncTransaction,
  id: string,
): Promise<LibrarySidecarAnnotationRow | null> {
  const result = await tx.execute(
    `SELECT id, book_id, format, kind, locator_json, color, note, created_at,
        updated_at, deleted_at
      FROM annotations
      WHERE id = ?`,
    [id],
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    id: requiredString(row, "id"),
    bookId: Number(row.book_id),
    format: requiredString(row, "format"),
    kind: requiredString(row, "kind"),
    locatorJson: requiredString(row, "locator_json"),
    color: requiredString(row, "color"),
    note: optionalString(row, "note"),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    deletedAt: row.deleted_at === null ? null : Number(row.deleted_at),
  }
}

export async function writeLibrarySidecarAnnotation(
  tx: LibrarySidecarSyncTransaction,
  row: LibrarySidecarAnnotationRow,
): Promise<void> {
  await tx.execute(
    `INSERT INTO annotations
      (id, book_id, format, kind, locator_json, color, note, created_at,
        updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        book_id = excluded.book_id,
        format = excluded.format,
        kind = excluded.kind,
        locator_json = excluded.locator_json,
        color = excluded.color,
        note = excluded.note,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at`,
    [
      row.id,
      row.bookId,
      row.format,
      row.kind,
      row.locatorJson,
      row.color,
      row.note,
      row.createdAt,
      row.updatedAt,
      row.deletedAt,
    ],
  )
}

export async function writeLibrarySidecarReadingSession(
  tx: LibrarySidecarSyncTransaction,
  row: {
    id: string
    bookId: number
    format: string
    localDay: string
    startedAt: number
    durationSeconds: number
    updatedAt: number
  },
): Promise<void> {
  await tx.execute(
    `INSERT INTO reading_sessions
      (id, book_id, format, local_day, started_at, duration_seconds, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        book_id = excluded.book_id,
        format = excluded.format,
        local_day = excluded.local_day,
        started_at = excluded.started_at,
        duration_seconds = excluded.duration_seconds,
        updated_at = excluded.updated_at`,
    [
      row.id,
      row.bookId,
      row.format,
      row.localDay,
      row.startedAt,
      row.durationSeconds,
      row.updatedAt,
    ],
  )
}

export async function writeLibrarySidecarReadingCompletion(
  tx: LibrarySidecarSyncTransaction,
  row: {
    id: string
    bookId: number
    format: string
    localDay: string
    completedAt: number
    updatedAt: number
  },
): Promise<void> {
  await tx.execute(
    `INSERT INTO reading_completions
      (id, book_id, format, local_day, completed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(book_id) DO UPDATE SET
        id = excluded.id,
        format = excluded.format,
        local_day = excluded.local_day,
        completed_at = excluded.completed_at,
        updated_at = excluded.updated_at`,
    [
      row.id,
      row.bookId,
      row.format,
      row.localDay,
      row.completedAt,
      row.updatedAt,
    ],
  )
}
