import { useCallback } from "react";

import { useQuery } from "@tanstack/react-query";

import { getAllBookFormats } from "@/src/domain/library/calibre";
import type { Library } from "@/src/domain/types";
import {
  clearBookReadingFormat,
  listBookReadingFormats,
  setBookReadingFormat as setBookReadingFormatRepo,
} from "@/src/repos/book-reading-format";
import { queryKeys } from "@/src/services/query/query-keys";
import { getReadableFormats } from "../book-formats";

export async function fetchBookReadingFormats(
  selectedLibrary: Library | null,
): Promise<Record<string, string>> {
  if (!selectedLibrary) return {};
  const [rows, allFormats] = await Promise.all([
    listBookReadingFormats(selectedLibrary),
    getAllBookFormats(selectedLibrary),
  ]);
  const map: Record<string, string> = {};
  for (const row of rows) {
    const bookId = String(row.bookId);
    const readableFormats = getReadableFormats(allFormats[bookId]);
    if (readableFormats.length <= 1) continue;
    map[bookId] = row.readingFormat;
  }
  return map;
}

export function useBookReadingFormat(selectedLibrary: Library | null) {
  const query = useQuery({
    queryKey: queryKeys.bookReadingFormat(selectedLibrary?.id),
    queryFn: () => fetchBookReadingFormats(selectedLibrary),
    enabled: !!selectedLibrary,
    staleTime: 0,
  });

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
        await clearBookReadingFormat(selectedLibrary, Number(bookId));
        return;
      }

      await setBookReadingFormatRepo(selectedLibrary, Number(bookId), format);
    },
    [selectedLibrary],
  );

  return { selectedFormatById: query.data ?? {}, setBookReadingFormat };
}
