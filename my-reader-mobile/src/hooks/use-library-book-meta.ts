import { useEffect, useMemo, useState } from "react";

import { getFormatFromPath, getReadableFormats, pathBelongsToBook, resolveEffectiveFormat } from "@/src/data/book-formats";
import { getAllBookFormats } from "@/src/data/calibre";
import { listFileStates, useFileStateRevision, type FileStateRow, type LocalState } from "@/src/data/file_state";
import type { BookItem, Library } from "@/src/data/types";
import { isRemoteSourceType } from "@/src/data/types";
import type { BookDownloadStatus } from "@/src/features/library/components/books/book-cover";
import { useDownloadStatusTasks, type DownloadStatusTask } from "@/src/sync/download-store";

const downloadedStates = new Set<LocalState>(["present", "local_only", "dirty_push"]);

type BookFileStateMap = Record<string, BookDownloadStatus>;
type BookFileStateRowMap = Record<string, FileStateRow[]>;
type BookFileStateBundle = { statuses: BookFileStateMap; rows: BookFileStateRowMap };

const EMPTY_FILE_STATE_BUNDLE: BookFileStateBundle = { statuses: {}, rows: {} };

type BookFormatMeta = { readableFormats: string[]; effectiveFormat?: string };

export function useLibraryBookMeta(
  selectedLibrary: Library | null,
  books: BookItem[],
  selectedFormatById: Record<string, string>,
) {
  const [bookFormatsById, setBookFormatsById] = useState<Record<string, string[]>>({});
  const [fileStateBundle, setFileStateBundle] = useState<BookFileStateBundle>(EMPTY_FILE_STATE_BUNDLE);
  const fileStateRevision = useFileStateRevision();
  const statusTasks = useDownloadStatusTasks();

  useEffect(() => {
    if (!selectedLibrary) {
      setBookFormatsById({});
      return;
    }
    let cancelled = false;
    void getAllBookFormats(selectedLibrary).then((formats) => {
      if (cancelled) return;
      setBookFormatsById(formats);
    });
    return () => {
      cancelled = true;
    };
  }, [books, selectedLibrary]);

  useEffect(() => {
    if (!selectedLibrary) {
      setFileStateBundle(EMPTY_FILE_STATE_BUNDLE);
      return;
    }

    if (!isRemoteSourceType(selectedLibrary.sourceType) || !selectedLibrary.dataSourceId) {
      const statuses: BookFileStateMap = {};
      for (const book of books) statuses[book.id] = "downloaded";
      setFileStateBundle({ statuses, rows: {} });
      return;
    }

    let cancelled = false;
    void listFileStates(
      selectedLibrary,
    ).then((rows) => {
      if (cancelled) return;
      const statuses: BookFileStateMap = {};
      const rowsByBook: BookFileStateRowMap = {};
      for (const book of books) {
        const matchedRows = rows.filter((row) => pathBelongsToBook(row.path, book.path));
        rowsByBook[book.id] = matchedRows;
        statuses[book.id] = matchedRows.some((row) => downloadedStates.has(row.localState))
          ? "downloaded"
          : "notDownloaded";
      }
      setFileStateBundle({ statuses, rows: rowsByBook });
    });

    return () => {
      cancelled = true;
    };
  }, [books, fileStateRevision, selectedLibrary]);

  const bookFormatMetaById = useMemo(() => {
    const map = new Map<string, BookFormatMeta>();
    for (const book of books) {
      const readableFormats = getReadableFormats(bookFormatsById[book.id]);
      const effectiveFormat = resolveEffectiveFormat(readableFormats, selectedFormatById[book.id]);
      map.set(book.id, { readableFormats, effectiveFormat });
    }
    return map;
  }, [books, bookFormatsById, selectedFormatById]);

  const isRemote = isRemoteSourceType(selectedLibrary?.sourceType);
  const selectedLibraryId = selectedLibrary?.id;

  const tasksByBookId = useMemo(() => {
    const map = new Map<string, DownloadStatusTask[]>();
    if (!selectedLibraryId) return map;

    let needPathLookup = false;
    for (const task of statusTasks) {
      if (task.libraryId !== selectedLibraryId) continue;
      if (
        task.status !== "queued" &&
        task.status !== "starting" &&
        task.status !== "downloading" &&
        task.status !== "done"
      )
        continue;
      if (!task.bookId) {
        needPathLookup = true;
        continue;
      }
      const existing = map.get(task.bookId);
      if (existing) existing.push(task);
      else map.set(task.bookId, [task]);
    }

    if (needPathLookup) {
      for (const task of statusTasks) {
        if (task.bookId) continue;
        if (task.libraryId !== selectedLibraryId) continue;
        if (
          task.status !== "queued" &&
          task.status !== "starting" &&
          task.status !== "downloading" &&
          task.status !== "done"
        )
          continue;
        const book = books.find((candidate) => pathBelongsToBook(task.relativePath, candidate.path));
        if (!book) continue;
        const existing = map.get(book.id);
        if (existing) existing.push(task);
        else map.set(book.id, [task]);
      }
    }

    return map;
  }, [statusTasks, books, selectedLibraryId]);

  const bookDownloadStatusById = useMemo(() => {
    const next: BookFileStateMap = {};
    const { statuses, rows } = fileStateBundle;

    for (const book of books) {
      if (!isRemote) {
        next[book.id] = statuses[book.id] ?? "downloaded";
        continue;
      }
      const meta = bookFormatMetaById.get(book.id);
      const effectiveFormat = meta?.effectiveFormat;
      const bookRows = rows[book.id] ?? [];
      const isDownloadedByEffectiveFormat = effectiveFormat
        ? bookRows.some(
            (row) =>
              downloadedStates.has(row.localState) &&
              getFormatFromPath(row.path) === effectiveFormat,
          )
        : false;
      next[book.id] = isDownloadedByEffectiveFormat ? "downloaded" : "notDownloaded";
    }

    for (const [bookId, tasks] of tasksByBookId) {
      const meta = bookFormatMetaById.get(bookId);
      const effectiveFormat = meta?.effectiveFormat;
      if (!effectiveFormat) continue;
      for (const task of tasks) {
        const taskFormat = task.format?.toUpperCase() ?? getFormatFromPath(task.relativePath);
        if (taskFormat !== effectiveFormat) continue;
        if (task.status === "done") {
          next[bookId] = "downloaded";
        } else if (next[bookId] !== "downloaded") {
          next[bookId] = "downloading";
        }
      }
    }

    return next;
  }, [bookFormatMetaById, books, fileStateBundle, isRemote, tasksByBookId]);

  return { bookFormatsById, bookFormatMetaById, fileStateBundle, bookDownloadStatusById };
}
