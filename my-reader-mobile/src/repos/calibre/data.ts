import { and, eq, sql } from "drizzle-orm";

import { books, data } from "@my-reader/db/schema/calibre";

import { withCalibreDb } from "../../services/db/calibre-db";

export type BookFormatRow = {
  format: string;
  name: string | null;
};

export type BookFileLocationRow = {
  path: string;
  name: string | null;
};

export async function getBookFormatRows(
  metadataUri: string,
  calibreBookId: number,
): Promise<{ bookPath: string | null; formats: BookFormatRow[] }> {
  return withCalibreDb(metadataUri, async (db) => {
    const bookPathRow = await db
      .select({ path: books.path })
      .from(books)
      .where(eq(books.id, calibreBookId))
      .get();

    if (!bookPathRow?.path) {
      return { bookPath: null, formats: [] };
    }

    const formatRows = await db
      .select({
        format: data.format,
        name: data.name,
      })
      .from(data)
      .where(eq(data.book, calibreBookId))
      .all();

    return { bookPath: bookPathRow.path, formats: formatRows };
  });
}

export async function listAllFormatRows(
  metadataUri: string,
): Promise<{ bookId: number; format: string | null }[]> {
  return withCalibreDb(metadataUri, async (db) =>
    db
      .select({
        bookId: data.book,
        format: data.format,
      })
      .from(data)
      .all(),
  );
}

export async function lookupBookFileRow(
  metadataUri: string,
  calibreBookId: number,
  format: string,
): Promise<BookFileLocationRow | null> {
  return withCalibreDb(metadataUri, async (db) => {
    const row = await db
      .select({
        path: books.path,
        name: data.name,
      })
      .from(books)
      .innerJoin(data, eq(data.book, books.id))
      .where(
        and(eq(books.id, calibreBookId), sql`UPPER(${data.format}) = ${format.toUpperCase()}`),
      )
      .get();

    if (!row?.path) {
      return null;
    }

    return { path: row.path, name: row.name };
  });
}
