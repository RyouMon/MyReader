import { useMemo } from "react";

import type { BookItem } from "@/src/data/types";

export type SortOption = "书名" | "作者" | "最近添加";
export type DownloadFilterOption = "all" | "downloaded" | "notDownloaded" | "downloading";

/** Compares newest Calibre additions first, falling back to id for older rows without timestamps. */
function compareRecentlyAdded(left: BookItem, right: BookItem): number {
  const byTimestamp = (right.timestamp ?? "").localeCompare(left.timestamp ?? "");
  if (byTimestamp !== 0) return byTimestamp;

  const leftId = left.calibreId ?? Number(left.id);
  const rightId = right.calibreId ?? Number(right.id);
  if (Number.isFinite(leftId) && Number.isFinite(rightId)) {
    return rightId - leftId;
  }

  return left.id.localeCompare(right.id, "zh-CN", { numeric: true });
}

export function useLibraryBookSearch(
  books: BookItem[],
  debouncedQuery: string,
  sortBy: SortOption,
  downloadFilter: DownloadFilterOption,
  bookDownloadStatusById: Record<string, string>,
) {
  const sortedSearchedBooks = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase();
    const searchedBooks = !needle
      ? books
      : books.filter((book) => {
          const authorMatches = book.authors?.some((author) => author.toLowerCase().includes(needle));
          return (
            book.title.toLowerCase().includes(needle) ||
            book.author.toLowerCase().includes(needle) ||
            Boolean(authorMatches)
          );
        });

    return [...searchedBooks].sort((left, right) => {
      switch (sortBy) {
        case "作者":
          return left.author.localeCompare(right.author, "zh-CN");
        case "最近添加":
          return compareRecentlyAdded(left, right);
        case "书名":
        default:
          return left.title.localeCompare(right.title, "zh-CN");
      }
    });
  }, [books, debouncedQuery, sortBy]);

  const visibleBooks = useMemo(() => {
    if (downloadFilter === "all") return sortedSearchedBooks;
    return sortedSearchedBooks.filter(
      (book) => (bookDownloadStatusById[book.id] ?? "notDownloaded") === downloadFilter,
    );
  }, [bookDownloadStatusById, downloadFilter, sortedSearchedBooks]);

  return { sortedSearchedBooks, visibleBooks };
}
