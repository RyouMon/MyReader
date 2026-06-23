import { eq } from "drizzle-orm";

import { uuid } from "@/src/utils/common";
import { bookReadingFormat } from "@my-reader/db/schema";
import type { BookReadingFormat } from "@my-reader/db/types";
import { getLibraryDatabase } from "../domain/library/library-db";
import type { Library } from "@my-reader/tools/types/library";

type Listener = () => void;

const listeners = new Set<Listener>();
let revision = 0;

function emitBookReadingFormatChanged(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

export function subscribeBookReadingFormat(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getBookReadingFormatRevision(): number {
  return revision;
}

export async function getBookReadingFormat(
  library: Library,
  bookId: number,
): Promise<BookReadingFormat | null> {
  const { db } = await getLibraryDatabase(library);
  const rows = await db
    .select()
    .from(bookReadingFormat)
    .where(eq(bookReadingFormat.bookId, bookId));
  return rows[0] ?? null;
}

export async function listBookReadingFormats(library: Library): Promise<BookReadingFormat[]> {
  const { db } = await getLibraryDatabase(library);
  return db.select().from(bookReadingFormat).orderBy(bookReadingFormat.bookId);
}

export async function setBookReadingFormat(
  library: Library,
  bookId: number,
  format: string,
): Promise<void> {
  const { db } = await getLibraryDatabase(library);
  const fmt = format.toUpperCase();
  const updatedAt = Date.now();
  await db
    .insert(bookReadingFormat)
    .values({
      id: uuid(),
      bookId,
      readingFormat: fmt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [bookReadingFormat.bookId],
      set: { readingFormat: fmt, updatedAt },
    });
  emitBookReadingFormatChanged();
}

export async function clearBookReadingFormat(
  library: Library,
  bookId: number,
): Promise<void> {
  const { db } = await getLibraryDatabase(library);
  await db.delete(bookReadingFormat).where(eq(bookReadingFormat.bookId, bookId));
  emitBookReadingFormatChanged();
}

export async function clearBookReadingFormatsForLibrary(library: Library): Promise<void> {
  const { db } = await getLibraryDatabase(library);
  await db.delete(bookReadingFormat);
  emitBookReadingFormatChanged();
}
