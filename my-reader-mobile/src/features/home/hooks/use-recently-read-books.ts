import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { listAllReadingProgress } from "@/src/repos/reading_progress";
import type { BookItem, Library } from "@/src/domain/types";

/**
 * Returns books with reading progress for the given library, sorted by most
 * recent read time in descending order.
 */
export function useRecentlyReadBooks(library: Library | null, books: BookItem[]) {
  const { data: progressRows = [] } = useQuery({
    queryKey: ["reading-books", library?.id],
    queryFn: async () => {
      if (!library) return [];
      return listAllReadingProgress(library);
    },
    enabled: !!library,
    staleTime: 1000 * 60 * 5,
  });

  return useMemo(() => {
    const bookById = new Map(books.map((book) => [book.id, book]));
    const latestReadAtByBook = new Map<string, number>();

    for (const row of progressRows) {
      const bookId = String(row.bookId);
      if (!bookById.has(bookId)) continue;

      const existing = latestReadAtByBook.get(bookId);
      if (!existing || row.updatedAt > existing) {
        latestReadAtByBook.set(bookId, row.updatedAt);
      }
    }

    return Array.from(latestReadAtByBook.entries())
      .map(([bookId]) => bookById.get(bookId)!)
      .sort((a, b) => latestReadAtByBook.get(b.id)! - latestReadAtByBook.get(a.id)!);
  }, [books, progressRows]);
}
