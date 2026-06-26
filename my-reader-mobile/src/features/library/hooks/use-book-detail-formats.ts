import { File } from "expo-file-system";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  enqueue,
  isTaskErrorAlerted,
  markTaskErrorAlerted,
  useDownloadStatusTasks,
} from "@/src/domain/download/download-store";
import { getBookFormatPaths } from "@/src/domain/library/calibre";
import {
  resolveShareableFormat,
  shareBookFile,
} from "@/src/domain/library/share-book-file";
import { useFileStates } from "@/src/domain/sync/hooks/use-file-states";
import type { BookDetail } from "@my-reader/tools/types/book";
import type { Library, LocalState } from "@/src/domain/types";
import { isRemoteSourceType } from "@/src/domain/types";
import { describeDownloadError } from "@/src/errors";
import { libraryBookFileUri } from "@/src/services/fs/library-paths";
import { confirmDeleteLocalDownload } from "../utils/delete-download";

import type { FileStateRow } from "@/src/repos/file-state";

const EMPTY_FILE_STATE_ROWS: FileStateRow[] = [];

export type FormatInfo = { relativePath: string; localState: LocalState | null };

export function useBookDetailFormats(
  activeLibrary: Library,
  bookId: string,
  detail: BookDetail | null,
) {
  const { t } = useTranslation();

  const [formatInfoMap, setFormatInfoMap] = useState<Record<string, FormatInfo>>({});
  const formatInfoMapRef = useRef(formatInfoMap);

  useEffect(() => {
    formatInfoMapRef.current = formatInfoMap;
  });

  const { data: fileStateRows = EMPTY_FILE_STATE_ROWS } = useFileStates(activeLibrary);
  const downloadStatusTasks = useDownloadStatusTasks();
  const consumedDownloadTaskIdsRef = useRef<Set<string>>(new Set());
  const deletedLocalPathKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!detail) {
      queueMicrotask(() => setFormatInfoMap({}));
      return;
    }

    if (!isRemoteSourceType(activeLibrary.sourceType)) {
      let cancelled = false;
      void getBookFormatPaths(activeLibrary, detail.id)
        .then((paths) => {
          const map: Record<string, FormatInfo> = {};
          for (const { format, relativePath } of paths) {
            const file = new File(libraryBookFileUri(activeLibrary, relativePath));
            const isPresent = file.exists && (file.size ?? 0) > 0;
            map[format] = { relativePath, localState: isPresent ? "present" : null };
          }
          if (cancelled) return;
          setFormatInfoMap(map);
        })
        .catch((err) => {
          if (!cancelled) {
            Alert.alert(t("bookDetail.readFileStateFailed"), err instanceof Error ? err.message : String(err));
          }
        });
      return () => {
        cancelled = true;
      };
    }

    if (!activeLibrary.dataSourceId) {
      queueMicrotask(() => setFormatInfoMap({}));
      return;
    }

    let cancelled = false;
    void getBookFormatPaths(activeLibrary, detail.id)
      .then((paths) => {
        const map: Record<string, FormatInfo> = {};
        for (const { format, relativePath } of paths) {
          const row = fileStateRows.find((r) => r.path === relativePath);
          map[format] = { relativePath, localState: row?.localState ?? null };
        }
        if (cancelled) return;
        setFormatInfoMap(map);
      })
      .catch((err) => {
        if (!cancelled) {
          Alert.alert(t("bookDetail.readFileStateFailed"), err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeLibrary, bookId, detail, fileStateRows, t]);

  useEffect(() => {
    if (!detail) return;
    const latestMap = formatInfoMapRef.current;
    const relevantTasks = downloadStatusTasks.filter(
      (task) =>
        task.libraryId === activeLibrary.id &&
        (task.bookId === bookId ||
          Object.values(latestMap).some((info) => info.relativePath === task.relativePath)),
    );

    for (const task of relevantTasks) {
      if (task.status === "error" && !isTaskErrorAlerted(task.id)) {
        markTaskErrorAlerted(task.id);
        const { title, message } = describeDownloadError(
          task.error ?? t("bookDetail.downloadFailed", { path: task.relativePath }),
        );
        Alert.alert(title, message);
      }
    }

    for (const id of Array.from(consumedDownloadTaskIdsRef.current)) {
      const task = relevantTasks.find((taskItem) => taskItem.id === id);
      if (!task || task.status !== "done") {
        consumedDownloadTaskIdsRef.current.delete(id);
      }
    }

    const doneTasks = relevantTasks.filter(
      (task) =>
        task.status === "done" &&
        !consumedDownloadTaskIdsRef.current.has(task.id) &&
        !deletedLocalPathKeysRef.current.has(`${task.libraryId}${task.relativePath}`),
    );
    if (doneTasks.length === 0) return;

    setFormatInfoMap((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const task of doneTasks) {
        const format =
          task.format ??
          Object.entries(prev).find(([, info]) => info.relativePath === task.relativePath)?.[0];
        if (!format) continue;
        consumedDownloadTaskIdsRef.current.add(task.id);
        const current = next[format];
        if (current?.localState === "present" && current.relativePath === task.relativePath) continue;
        next[format] = {
          relativePath: current?.relativePath ?? task.relativePath,
          localState: "present",
        };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [activeLibrary.id, bookId, detail, downloadStatusTasks, formatInfoMap, t]);

  const handleDownloadFormat = useCallback(
    async (format: string) => {
      const info = formatInfoMap[format];
      if (!info || !detail) {
        Alert.alert(t("bookDetail.cannotStartDownload"), t("bookDetail.noFormatPath", { format }));
        return;
      }
      try {
        await enqueue({
          libraryId: activeLibrary.id,
          bookId,
          format,
          relativePath: info.relativePath,
          label: `${detail.title} · ${format}`,
        });
        deletedLocalPathKeysRef.current.delete(`${activeLibrary.id}${info.relativePath}`);
      } catch (err) {
        const { title, message } = describeDownloadError(err);
        Alert.alert(title, message);
      }
    },
    [formatInfoMap, activeLibrary.id, bookId, detail, t],
  );

  const handleDeleteFormat = useCallback(
    (format: string) => {
      const info = formatInfoMap[format];
      if (!info || !detail) return;
      if (info.localState !== "present") {
        Alert.alert(
          t("share.fileNotDownloadedTitle"),
          t("share.fileNotDownloadedMessage", { title: detail.title, format }),
        );
        return;
      }
      const pathKey = `${activeLibrary.id}${info.relativePath}`;
      confirmDeleteLocalDownload(detail.title, activeLibrary.id, info.relativePath, {
        onConfirm: () => {
          deletedLocalPathKeysRef.current.add(pathKey);
          for (const task of downloadStatusTasks) {
            if (
              task.libraryId === activeLibrary.id &&
              task.relativePath === info.relativePath &&
              task.status === "done"
            ) {
              consumedDownloadTaskIdsRef.current.add(task.id);
            }
          }
          setFormatInfoMap((prev) => ({
            ...prev,
            [format]: { ...prev[format]!, localState: "remote_only" },
          }));
        },
        onError: (err) => {
          setFormatInfoMap((prev) => ({
            ...prev,
            [format]: { ...prev[format]!, localState: "present" },
          }));
          deletedLocalPathKeysRef.current.delete(pathKey);
          Alert.alert(
            t("bookDetail.deleteLocalFailed"),
            err instanceof Error ? err.message : String(err),
          );
        },
      });
    },
    [formatInfoMap, downloadStatusTasks, activeLibrary.id, detail, t],
  );

  const handleShareFormat = useCallback(
    async (format: string) => {
      if (!detail) return;
      const shareable = await resolveShareableFormat(activeLibrary, detail.id, format);
      if (!shareable) {
        Alert.alert(
          t("share.shareFailed"),
          t("bookLoader.formatNotFoundInLibrary", { format, id: detail.id }),
        );
        return;
      }
      if (!shareable.isLocal) {
        Alert.alert(
          t("share.fileNotDownloadedTitle"),
          t("share.fileNotDownloadedMessage", { title: detail.title, format }),
        );
        return;
      }
      try {
        await shareBookFile(shareable.fileUri, format);
      } catch (err) {
        if (err instanceof Error && err.message.toLowerCase().includes("cancel")) {
          return;
        }
        Alert.alert(t("share.shareFailed"), err instanceof Error ? err.message : String(err));
      }
    },
    [activeLibrary, detail, t],
  );

  return {
    formatInfoMap,
    handleDownloadFormat,
    handleDeleteFormat,
    handleShareFormat,
  };
}
