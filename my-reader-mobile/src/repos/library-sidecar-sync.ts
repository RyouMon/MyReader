import type { Scalar, Transaction } from "@op-engineering/op-sqlite"

import type { Library } from "@my-reader/tools/types/library"
import { getLibraryDatabase } from "@/src/services/db/library-db"

export type LibrarySidecarSyncTransaction = Transaction

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

/** Runs the remaining mobile-owned product projection reads atomically. */
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
