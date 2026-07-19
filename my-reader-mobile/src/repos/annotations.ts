import { annotations } from "@my-reader/db/schema"
import type { Annotation } from "@my-reader/db/types"
import type { Library } from "@my-reader/tools/types/library"
import { and, eq, isNull, sql } from "drizzle-orm"

import { getLibraryDatabase } from "@/src/services/db/library-db"

export type ReaderAnnotationCreateRow = Pick<
  Annotation,
  "id" | "bookId" | "format" | "kind" | "locatorJson" | "color" | "note"
>

export async function listActiveReaderAnnotationRows(
  library: Library,
  bookId: number,
  format: string,
): Promise<Annotation[]> {
  const { db } = await getLibraryDatabase(library)
  return db
    .select()
    .from(annotations)
    .where(
      and(
        eq(annotations.bookId, bookId),
        eq(annotations.format, format.toUpperCase()),
        isNull(annotations.deletedAt),
      ),
    )
}

export async function createReaderAnnotationRow(
  library: Library,
  patch: ReaderAnnotationCreateRow,
): Promise<Annotation> {
  const now = Date.now()
  const { db } = await getLibraryDatabase(library)
  const rows = await db
    .insert(annotations)
    .values({
      ...patch,
      format: patch.format.toUpperCase(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .returning()
  const row = rows[0]
  if (!row) throw new Error("Annotation creation returned no row")
  return row
}

export async function updateReaderAnnotationRow(
  library: Library,
  id: string,
  patch: Pick<Annotation, "color" | "note">,
): Promise<Annotation | null> {
  const now = Date.now()
  const { db } = await getLibraryDatabase(library)
  const rows = await db
    .update(annotations)
    .set({
      ...patch,
      updatedAt: sql<number>`max(${now}, ${annotations.updatedAt} + 1)`,
    })
    .where(and(eq(annotations.id, id), isNull(annotations.deletedAt)))
    .returning()
  return rows[0] ?? null
}

export async function tombstoneReaderAnnotationRow(
  library: Library,
  id: string,
): Promise<boolean> {
  const now = Date.now()
  const { db } = await getLibraryDatabase(library)
  const rows = await db
    .update(annotations)
    .set({
      updatedAt: sql<number>`max(${now}, ${annotations.updatedAt} + 1)`,
      deletedAt: sql<number>`max(${now}, ${annotations.updatedAt} + 1)`,
    })
    .where(and(eq(annotations.id, id), isNull(annotations.deletedAt)))
    .returning({ id: annotations.id })
  return rows.length > 0
}
