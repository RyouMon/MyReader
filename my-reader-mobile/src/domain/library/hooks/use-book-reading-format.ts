import { useCallback, useEffect, useState } from "react";

import { getAllBookFormats } from "@/src/domain/library/calibre";
import type { BookItem, Library } from "@/src/domain/types";
import {
  clearBookReadingFormat,
  listBookReadingFormats,
  setBookReadingFormat as setBookReadingFormatRepo,
  subscribeBookReadingFormat,
} from "@/src/repos/book-reading-format";
import { getReadableFormats } from "../book-formats";

export function useBookReadingFormat(selectedLibrary: Library | null, books: BookItem[]) {
  const [selectedFormatById, setSelectedFormatById] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!selectedLibrary) {
      queueMicrotask(() => setSelectedFormatById({}));
      return;
    }

    let cancelled = false;
    const load = async () => {
      const [rows, allFormats] = await Promise.all([
        listBookReadingFormats(selectedLibrary),
        getAllBookFormats(selectedLibrary),
      ]);
      if (cancelled) return;

      const map: Record<string, string> = {};
      for (const book of books) {
        const readableFormats = getReadableFormats(allFormats[book.id]);
        if (readableFormats.length <= 1) continue; // short-circuit: single-format books use their only format
        const row = rows.find((r) => String(r.bookId) === book.id);
        if (row) map[book.id] = row.readingFormat;
      }
      queueMicrotask(() => {
        if (!cancelled) setSelectedFormatById(map);
      });
    };

    void load();
    const unsubscribe = subscribeBookReadingFormat(() => {
      if (!cancelled) void load();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [selectedLibrary, books]);

  const setBookReadingFormat = useCallback(
    async (bookId: string, format: string | null) => {
      if (!selectedLibrary) return;

      if (format === null) {
        await clearBookReadingFormat(selectedLibrary, Number(bookId));
        return;
      }

      const allFormats = await getAllBookFormats(selectedLibrary);
      const readableFormats = getReadableFormats(allFormats[bookId]);
      if (readableFormats.length <= 1) {
        // Single-format books short-circuit; clear any stale persisted row.
        await clearBookReadingFormat(selectedLibrary, Number(bookId));
        return;
      }

      await setBookReadingFormatRepo(selectedLibrary, Number(bookId), format);
    },
    [selectedLibrary],
  );

  return { selectedFormatById, setBookReadingFormat };
}
