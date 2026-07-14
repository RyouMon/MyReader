import { bookmarks } from "@my-reader/db/schema"
import type { Bookmark } from "@my-reader/db/types"
import type { Library } from "@my-reader/tools/types/library"
import { and, eq, gte, isNull, sql } from "drizzle-orm"
import { getLibraryDatabase } from "@/src/services/db/library-db"

function normalizedFormat(format: string): string {
  return format.toUpperCase()
}

export async function getReaderBookmarkRow(
  library: Library,
  bookId: number,
  format: string,
  locatorKey: string,
): Promise<Bookmark | null> {
  const { db } = await getLibraryDatabase(library)
  const rows = await db
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.bookId, bookId),
        eq(bookmarks.format, normalizedFormat(format)),
        eq(bookmarks.locatorKey, locatorKey),
      ),
    )
  return rows[0] ?? null
}

export async function listActiveReaderBookmarkRows(
  library: Library,
  bookId: number,
  format: string,
): Promise<Bookmark[]> {
  const { db } = await getLibraryDatabase(library)
  return db
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.bookId, bookId),
        eq(bookmarks.format, normalizedFormat(format)),
        isNull(bookmarks.deletedAt),
      ),
    )
}

export type ReaderBookmarkUpsert = {
  id: string
  bookId: number
  format: string
  locatorKey: string
  locatorJson: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export type ReaderBookmarkLocalCreate = Pick<
  ReaderBookmarkUpsert,
  "id" | "bookId" | "format" | "locatorKey" | "locatorJson"
>

/**
 * Creates or revives a bookmark in one SQLite statement. Conflict expressions
 * read the row version current when SQLite executes the statement, so a pull
 * racing this mutation cannot be overwritten by a stale local timestamp.
 */
export async function addOrReviveReaderBookmarkRow(
  library: Library,
  patch: ReaderBookmarkLocalCreate,
): Promise<Bookmark> {
  const now = Date.now()
  const format = normalizedFormat(patch.format)
  const { db } = await getLibraryDatabase(library)
  const rows = await db
    .insert(bookmarks)
    .values({
      ...patch,
      format,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .onConflictDoUpdate({
      target: [bookmarks.bookId, bookmarks.format, bookmarks.locatorKey],
      set: {
        locatorJson: sql<string>`CASE
          WHEN ${bookmarks.deletedAt} IS NOT NULL THEN excluded.locator_json
          ELSE ${bookmarks.locatorJson}
        END`,
        updatedAt: sql<number>`CASE
          WHEN ${bookmarks.deletedAt} IS NOT NULL
            THEN max(excluded.updated_at, ${bookmarks.updatedAt} + 1)
          ELSE ${bookmarks.updatedAt}
        END`,
        deletedAt: null,
      },
    })
    .returning()
  const row = rows[0]
  if (!row) throw new Error("Bookmark mutation returned no row")
  return row
}

export type ReaderBookmarkIdentity = Pick<
  ReaderBookmarkUpsert,
  "bookId" | "format" | "locatorKey"
>

/** Tombstones an active bookmark using the row version current in SQLite. */
export async function tombstoneReaderBookmarkRow(
  library: Library,
  identity: ReaderBookmarkIdentity,
): Promise<Bookmark | null> {
  const now = Date.now()
  const { db } = await getLibraryDatabase(library)
  const rows = await db
    .update(bookmarks)
    .set({
      updatedAt: sql<number>`max(${now}, ${bookmarks.updatedAt} + 1)`,
      deletedAt: sql<number>`max(${now}, ${bookmarks.updatedAt} + 1)`,
    })
    .where(
      and(
        eq(bookmarks.bookId, identity.bookId),
        eq(bookmarks.format, normalizedFormat(identity.format)),
        eq(bookmarks.locatorKey, identity.locatorKey),
        isNull(bookmarks.deletedAt),
      ),
    )
    .returning()
  return rows[0] ?? null
}

/**
 * Atomically applies the deterministic bookmark LWW order:
 * updated_at, tombstone flag, id, locator_json, created_at, deleted_at.
 * Text fields use SQLite BINARY ordering, matching Rust UTF-8 byte ordering.
 */
export async function upsertReaderBookmarkIfNewer(
  library: Library,
  patch: ReaderBookmarkUpsert,
): Promise<boolean> {
  const format = normalizedFormat(patch.format)
  const { db } = await getLibraryDatabase(library)
  const rows = await db
    .insert(bookmarks)
    .values({ ...patch, format })
    .onConflictDoUpdate({
      target: [bookmarks.bookId, bookmarks.format, bookmarks.locatorKey],
      set: {
        id: patch.id,
        locatorJson: patch.locatorJson,
        createdAt: patch.createdAt,
        updatedAt: patch.updatedAt,
        deletedAt: patch.deletedAt,
      },
      setWhere: sql`
        excluded.updated_at > ${bookmarks.updatedAt}
        OR (
          excluded.updated_at = ${bookmarks.updatedAt}
          AND (
            (
              excluded.deleted_at IS NOT NULL
              AND ${bookmarks.deletedAt} IS NULL
            )
            OR (
              (
                (
                  excluded.deleted_at IS NULL
                  AND ${bookmarks.deletedAt} IS NULL
                )
                OR (
                  excluded.deleted_at IS NOT NULL
                  AND ${bookmarks.deletedAt} IS NOT NULL
                )
              )
              AND (
                excluded.id COLLATE BINARY > ${bookmarks.id} COLLATE BINARY
                OR (
                  excluded.id = ${bookmarks.id}
                  AND (
                    excluded.locator_json COLLATE BINARY > ${bookmarks.locatorJson} COLLATE BINARY
                    OR (
                      excluded.locator_json = ${bookmarks.locatorJson}
                      AND (
                        excluded.created_at > ${bookmarks.createdAt}
                        OR (
                          excluded.created_at = ${bookmarks.createdAt}
                          AND coalesce(excluded.deleted_at, -1) > coalesce(${bookmarks.deletedAt}, -1)
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      `,
    })
    .returning({ id: bookmarks.id })
  return rows.length > 0
}

export type ReaderBookmarkChangeRow = ReaderBookmarkUpsert

export async function listReaderBookmarksAtOrAfter(
  library: Library,
  sinceMs: number,
): Promise<ReaderBookmarkChangeRow[]> {
  const { db } = await getLibraryDatabase(library)
  return db
    .select()
    .from(bookmarks)
    .where(gte(bookmarks.updatedAt, sinceMs))
    .orderBy(bookmarks.updatedAt, bookmarks.id)
}
