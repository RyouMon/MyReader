import { useCallback, useEffect, useState } from "react";

import type { BookItem, Library } from "@/src/domain/types";
import {
  addFavoriteBook,
  listFavoriteBooks,
  removeFavoriteBook,
  subscribeFavoriteBooks,
} from "@/src/repos/favorite_books";

export function useFavoriteBooks(selectedLibrary: Library | null, books: BookItem[]) {
  const [favoriteSet, setFavoriteSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedLibrary) {
      queueMicrotask(() => setFavoriteSet(new Set()));
      return;
    }

    let cancelled = false;
    const load = async () => {
      const rows = await listFavoriteBooks(selectedLibrary);
      if (cancelled) return;

      const bookIds = new Set(books.map((b) => b.id));
      const next = new Set<string>();
      for (const row of rows) {
        const id = String(row.bookId);
        if (bookIds.has(id)) {
          next.add(id);
        }
      }
      queueMicrotask(() => {
        if (!cancelled) setFavoriteSet(next);
      });
    };

    void load();
    const unsubscribe = subscribeFavoriteBooks(() => {
      if (!cancelled) void load();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [selectedLibrary, books]);

  const toggleFavorite = useCallback(
    async (bookId: string) => {
      if (!selectedLibrary) return;
      const numericId = Number(bookId);
      if (!Number.isFinite(numericId) || numericId <= 0) return;

      if (favoriteSet.has(bookId)) {
        await removeFavoriteBook(selectedLibrary, numericId);
      } else {
        await addFavoriteBook(selectedLibrary, numericId);
      }
    },
    [selectedLibrary, favoriteSet],
  );

  const isFavorite = useCallback(
    (bookId: string) => favoriteSet.has(bookId),
    [favoriteSet],
  );

  return { favoriteSet, isFavorite, toggleFavorite };
}
