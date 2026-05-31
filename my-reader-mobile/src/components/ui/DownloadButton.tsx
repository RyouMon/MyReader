import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useThemePalette } from "@/src/design/tokens";
import { Text, View } from "@/tw";

import { Button } from "./button";

import {
  enqueue,
  useDownloadStatusTasks,
  useDownloadTaskForPath,
} from "@/src/domain/download/download-store";
import type { LocalState } from "@/src/domain/types";
import {
  deleteFileEverywhereForLibrary,
  evictLocalFileForLibrary,
} from "@/src/domain/sync/file-actions";
import { describeError } from "@/src/utils/common";

export type DownloadButtonState = LocalState;

type BusyKind = "download" | "evict" | "delete" | null;

export type DownloadButtonProps = {
  libraryId: string;
  relativePath: string;
  initialState?: DownloadButtonState;
  /**
   * LocalDirect sources share a single copy between app and store; hide the
   * download / evict controls and keep only the destructive delete action.
   */
  isLocalDirect?: boolean;
  onStateChange?: (next: DownloadButtonState) => void;
};

/**
 * Three-state download pill mirroring the desktop UI:
 * `remote_only` → 下载 → `present` (释放 / 删除) → 二次点击确认后彻底删除。
 */
export function DownloadButton({
  libraryId,
  relativePath,
  initialState = "remote_only",
  isLocalDirect = false,
  onStateChange,
}: DownloadButtonProps) {
  const { t } = useTranslation();
  const palette = useThemePalette();
  const actions = {
    evictLocal: evictLocalFileForLibrary,
    deleteEverywhere: deleteFileEverywhereForLibrary,
  };
  const downloadTask = useDownloadTaskForPath(libraryId, relativePath);
  const downloadStatusTask = useDownloadStatusTasks().find(
    (task) => task.libraryId === libraryId && task.relativePath === relativePath,
  );
  const [state, setState] = useState<DownloadButtonState>(initialState);
  const [busy, setBusy] = useState<BusyKind>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observedDownloadTaskIdRef = useRef<string | null>(null);

  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const commit = useCallback(
    (next: DownloadButtonState) => {
      setState(next);
      onStateChange?.(next);
    },
    [onStateChange],
  );

  const handleEvict = useCallback(async () => {
    if (busy) return;
    setErrorMessage(null);
    setBusy("evict");
    try {
      await actions.evictLocal(libraryId, relativePath);
      commit("remote_only");
    } catch (err) {
      setErrorMessage(describeError(err));
    } finally {
      setBusy(null);
    }
  }, [actions, busy, commit, libraryId, relativePath]);

  const handleDelete = useCallback(async () => {
    if (busy) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirmDelete(false);
    setErrorMessage(null);
    setBusy("delete");
    try {
      await actions.deleteEverywhere(libraryId, relativePath);
      commit("remote_only");
    } catch (err) {
      setErrorMessage(describeError(err));
    } finally {
      setBusy(null);
    }
  }, [actions, busy, commit, confirmDelete, libraryId, relativePath]);

  const isPresent = state === "present" || state === "dirty_push";
  const isDownloadActive =
    downloadTask?.status === "queued" ||
    downloadTask?.status === "starting" ||
    downloadTask?.status === "downloading";
  const downloadLabel =
    downloadTask?.status === "queued"
      ? t("downloadButton.queued")
      : downloadTask?.status === "starting"
        ? t("downloadButton.preparing")
        : downloadTask?.status === "downloading"
          ? t("downloadButton.downloading")
          : busy === "download"
            ? t("downloadButton.downloading")
            : t("downloadButton.download");

  useEffect(() => {
    if (isDownloadActive && downloadTask) {
      observedDownloadTaskIdRef.current = downloadTask.id;
    }
  }, [downloadTask, isDownloadActive]);

  useEffect(() => {
    if (!downloadStatusTask || downloadStatusTask.id !== observedDownloadTaskIdRef.current) return;
    if (downloadStatusTask.status === "done" && state !== "present") {
      observedDownloadTaskIdRef.current = null;
      commit("present");
      setBusy(null);
      return;
    }
    if (downloadStatusTask.status === "error") {
      observedDownloadTaskIdRef.current = null;
      setErrorMessage(downloadStatusTask.error ?? t("downloadButton.downloadFailed", { path: relativePath }));
      setBusy(null);
      return;
    }
    if (downloadStatusTask.status === "cancelled") {
      observedDownloadTaskIdRef.current = null;
      setBusy(null);
    }
  }, [commit, downloadStatusTask, relativePath, state, t]);

  const handleDownload = useCallback(async () => {
    if (busy || isDownloadActive) return;
    setErrorMessage(null);
    setBusy("download");
    try {
      observedDownloadTaskIdRef.current = await enqueue({
        libraryId,
        relativePath,
        label: relativePath,
      });
    } catch (err) {
      setErrorMessage(describeError(err));
      setBusy(null);
    }
  }, [busy, isDownloadActive, libraryId, relativePath]);

  return (
    <View className="flex-row items-center" style={{ columnGap: 8 }}>
      {!isLocalDirect && !isPresent && (
        <Pill
          label={downloadLabel}
          onPress={handleDownload}
          disabled={busy !== null || isDownloadActive}
          busy={busy === "download" || isDownloadActive}
          textColor={palette.text}
          backgroundColor={palette.backgroundSecondary}
          borderColor={palette.border}
        />
      )}

      {!isLocalDirect && isPresent && (
        <>
          <Text className="text-[12px]" style={{ color: palette.success, fontWeight: "700" }}>
            {t("downloadButton.downloaded")}
          </Text>
          <Pill
            label={busy === "evict" ? t("downloadButton.evicting") : t("downloadButton.evict")}
            onPress={handleEvict}
            disabled={busy !== null}
            busy={busy === "evict"}
            textColor={palette.text}
            backgroundColor="transparent"
            borderColor={palette.border}
          />
        </>
      )}

      <Pill
        label={busy === "delete" ? t("downloadButton.deleting") : confirmDelete ? t("downloadButton.confirmDelete") : t("downloadButton.delete")}
        onPress={handleDelete}
        disabled={busy !== null}
        busy={busy === "delete"}
        textColor={confirmDelete ? String(palette.onDestructive) : palette.error}
        backgroundColor={confirmDelete ? String(palette.destructive) : "transparent"}
        borderColor={confirmDelete ? String(palette.destructive) : palette.border}
      />

      {errorMessage ? (
        <Text
          className="text-[11px]"
          numberOfLines={1}
          style={{ color: palette.error }}
        >
          {t("downloadButton.failed")}
        </Text>
      ) : null}
    </View>
  );
}

type PillProps = {
  label: string;
  onPress: () => void;
  disabled: boolean;
  busy: boolean;
  textColor: string;
  backgroundColor: string;
  borderColor: string;
};

function Pill({
  label,
  onPress,
  disabled,
  busy,
  textColor,
  backgroundColor,
  borderColor,
}: PillProps) {
  return (
    <Button
      className="self-start"
      colors={{
        backgroundColor,
        borderColor,
        indicatorColor: textColor,
        textColor,
        underlayColor: backgroundColor,
      }}
      disabled={disabled}
      loading={busy}
      onPress={onPress}
      size="sm"
      title={label}
      variant="outline"
    />
  );
}
