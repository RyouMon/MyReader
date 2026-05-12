import { useCallback, useRef } from "react";

import { router } from "expo-router";

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar";
import { getReadableFormats, resolveEffectiveFormat } from "@/src/data/book-formats";
import { getBookFormatPaths } from "@/src/data/calibre";
import type { BookItem, Library } from "@/src/data/types";
import { describeDownloadError } from "@/src/errors";
import {
  dismissTasksForPath,
  enqueue as enqueueDownload,
} from "@/src/sync/download-store";
import type { SyncActions } from "@/src/sync/useSyncActions";
import type { FileStateRow } from "@/src/sync/file_state";

const downloadedStates = new Set(["present", "local_only", "dirty_push"]);

export function useBookActions(
  books: BookItem[],
  bookDownloadStatusById: Record<string, string>,
  bookFormatMetaById: Map<string, { readableFormats: string[]; effectiveFormat?: string }>,
  fileStateBundle: { rows: Record<string, FileStateRow[]> },
  openMenuBookId: string | null,
  selectedFormatById: Record<string, string>,
  selectedLibrary: Library | null,
  syncActions: SyncActions | null,
  setSelectedFormatById: React.Dispatch<React.SetStateAction<Record<string, string>>> | null,
) {
  const isNavigatingRef = useRef(false);

  // Sync latest props into a ref so callbacks always read current values
  // without rebuilding their references on every parent render.
  const stateRef = useRef({
    books,
    bookDownloadStatusById,
    bookFormatMetaById,
    fileStateBundle,
    openMenuBookId,
    selectedFormatById,
    selectedLibrary,
    syncActions,
    setSelectedFormatById,
  });
  stateRef.current = {
    books,
    bookDownloadStatusById,
    bookFormatMetaById,
    fileStateBundle,
    openMenuBookId,
    selectedFormatById,
    selectedLibrary,
    syncActions,
    setSelectedFormatById,
  };

  const downloadBook = useCallback(async (book: BookItem, targetFormat?: string) => {
    const { selectedLibrary: lib, selectedFormatById: formatById } = stateRef.current;
    const calibreId = Number(book.id);
    if (!Number.isFinite(calibreId) || calibreId <= 0 || !lib || lib.sourceType !== "webdav") return;

    try {
      const paths = await getBookFormatPaths(lib, calibreId);
      const readableFormats = getReadableFormats(paths.map((path) => path.format));
      const normalizedTarget = targetFormat?.toUpperCase();
      const format = normalizedTarget
        ? readableFormats.find((item) => item === normalizedTarget)
        : resolveEffectiveFormat(readableFormats, formatById[book.id]);
      if (!format) {
        showAlertWithStatusBarRestore("无法下载", "该书没有可下载的可读格式");
        return;
      }
      const match = paths.find((p) => p.format.toUpperCase() === format);
      if (!match) return;

      await enqueueDownload({
        libraryId: lib.id,
        bookId: book.id,
        format,
        relativePath: match.relativePath,
        label: `${book.title} · ${format}`,
      });
    } catch (e) {
      const { title, message } = describeDownloadError(e);
      showAlertWithStatusBarRestore(title, message);
    }
  }, []);

  const promptSetDefaultFormat = useCallback(async (book: BookItem) => {
    const { selectedLibrary: lib, selectedFormatById: formatById } = stateRef.current;
    const calibreId = Number(book.id);
    if (!Number.isFinite(calibreId) || calibreId <= 0 || !lib) return;

    try {
      const paths = await getBookFormatPaths(lib, calibreId);
      const readableFormats = getReadableFormats(paths.map((path) => path.format));

      if (readableFormats.length === 0) {
        showAlertWithStatusBarRestore("无可读格式", "该书没有可阅读的格式");
        return;
      }
      const setFormat = stateRef.current.setSelectedFormatById;
      if (readableFormats.length === 1) {
        if (setFormat) {
          setFormat((prev) => ({ ...prev, [book.id]: readableFormats[0]! }));
        }
        showAlertWithStatusBarRestore("已设置默认格式", readableFormats[0]);
        return;
      }

      const current = formatById[book.id];
      const effectiveFormat = resolveEffectiveFormat(readableFormats, current);
      showAlertWithStatusBarRestore(
        "设置默认阅读格式",
        `当前默认：${effectiveFormat ?? "-"}`,
        [
          ...readableFormats.map((fmt) => ({
            text: `${effectiveFormat === fmt ? "✓ " : ""}${fmt}`,
            onPress: () => {
              if (setFormat) {
                setFormat((prev) => ({ ...prev, [book.id]: fmt }));
              }
            },
          })),
          { text: "取消", style: "cancel" },
        ],
      );
    } catch (e) {
      showAlertWithStatusBarRestore("读取格式失败", e instanceof Error ? e.message : String(e));
    }
  }, []);

  const handleBookPress = useCallback((bookId: string) => {
    if (isNavigatingRef.current) return;
    const latest = stateRef.current;
    if (latest.openMenuBookId) return;
    const book = latest.books.find((b) => b.id === bookId);
    if (!book) return;
    const status = latest.bookDownloadStatusById[bookId] ?? "notDownloaded";

    if (latest.selectedLibrary?.sourceType !== "webdav" || status === "downloaded") {
      isNavigatingRef.current = true;
      const effectiveFormat = latest.bookFormatMetaById.get(bookId)?.effectiveFormat;
      if (effectiveFormat) {
        router.push({ pathname: "/reader/[id]", params: { id: bookId, format: effectiveFormat } });
      } else {
        router.push({ pathname: "/reader/[id]", params: { id: bookId } });
      }
      setTimeout(() => {
        isNavigatingRef.current = false;
      }, 1200);
      return;
    }

    void downloadBook(book);
  }, [downloadBook]);

  const handleBookMenuAction = useCallback(
    (bookId: string, actionId: string) => {
      const latest = stateRef.current;
      const book = latest.books.find((b) => b.id === bookId);
      if (!book) return;

      if (actionId === "download" || actionId.startsWith("download:")) {
        const targetFormat = actionId === "download" ? undefined : actionId.slice("download:".length);
        void downloadBook(book, targetFormat);
        return;
      }
      if (actionId === "detail") {
        router.push({ pathname: "/library-book/[id]", params: { id: bookId } });
        return;
      }
      if (actionId.startsWith("setDefaultFormat:")) {
        const format = actionId.slice("setDefaultFormat:".length);
        const setFormat = latest.setSelectedFormatById;
        if (!setFormat) return;
        if (format === "auto") {
          setFormat((prev) => {
            const next = { ...prev };
            delete next[bookId];
            return next;
          });
        } else {
          setFormat((prev) => ({ ...prev, [bookId]: format }));
        }
        return;
      }
      if (actionId === "setDefaultFormat") {
        void promptSetDefaultFormat(book);
        return;
      }
      if (actionId === "deleteDownload") {
        const rows = latest.fileStateBundle.rows[bookId] ?? [];
        const downloadedRows = rows.filter((row) => downloadedStates.has(row.localState));
        if (downloadedRows.length === 0) return;
        const lib = latest.selectedLibrary;
        const sync = latest.syncActions;
        if (!lib || !sync) return;
        showAlertWithStatusBarRestore(
          "删除下载文件",
          `确定要删除《${book.title}》的本地下载文件吗？`,
          [
            { text: "取消", style: "cancel" },
            {
              text: "删除",
              style: "destructive",
              onPress: () => {
                void (async () => {
                  try {
                    for (const row of downloadedRows) {
                      await sync.evictLocal(lib.id, row.path);
                      dismissTasksForPath(lib.id, row.path);
                    }
                  } catch (err) {
                    showAlertWithStatusBarRestore("删除失败", err instanceof Error ? err.message : String(err));
                  }
                })();
              },
            },
          ],
        );
      }
    },
    [downloadBook, promptSetDefaultFormat],
  );

  return {
    handleBookPress,
    handleBookMenuAction,
  };
}
