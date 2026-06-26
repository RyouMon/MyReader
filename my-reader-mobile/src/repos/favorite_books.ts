import { eq } from "drizzle-orm";

import { uuid } from "@/src/utils/common";
import { favoriteBooks } from "@my-reader/db/schema";
import type { FavoriteBook } from "@my-reader/db/types";
import { getLibraryDatabase } from "@/src/services/db/library-db";
import type { Library } from "@my-reader/tools/types/library";

type Listener = () => void;

const listeners = new Set<Listener>();
let revision = 0;

function emitFavoriteBooksChanged(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

export function subscribeFavoriteBooks(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFavoriteBooksRevision(): number {
  return revision;
}

export async function getFavoriteBook(
  library: Library,
  bookId: number,
): Promise<FavoriteBook | null> {
  const { db } = await getLibraryDatabase(library);
  const rows = await db
    .select()
    .from(favoriteBooks)
    .where(eq(favoriteBooks.bookId, bookId));
  return rows[0] ?? null;
}

export async function listFavoriteBooks(library: Library): Promise<FavoriteBook[]> {
  const { db } = await getLibraryDatabase(library);
  return db.select().from(favoriteBooks).orderBy(favoriteBooks.addedAt);
}

export async function addFavoriteBook(
  library: Library,
  bookId: number,
): Promise<void> {
  const { db } = await getLibraryDatabase(library);
  const addedAt = Date.now();
  await db
    .insert(favoriteBooks)
    .values({
      id: uuid(),
      bookId,
      addedAt,
    })
    .onConflictDoNothing({
      target: favoriteBooks.bookId,
    });
  emitFavoriteBooksChanged();
}

export async function removeFavoriteBook(
  library: Library,
  bookId: number,
): Promise<void> {
  const { db } = await getLibraryDatabase(library);
  await db.delete(favoriteBooks).where(eq(favoriteBooks.bookId, bookId));
  emitFavoriteBooksChanged();
}

export async function clearFavoriteBooksForLibrary(library: Library): Promise<void> {
  const { db } = await getLibraryDatabase(library);
  await db.delete(favoriteBooks);
  emitFavoriteBooksChanged();
}
