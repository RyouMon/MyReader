import { memo } from "react";

import { useThemePalette } from "@/src/design/tokens";
import { ICON_SIZE } from "@/src/design/icon-sizes";
import { CloudIcon } from "@/src/components/ui/cloud-icon";
import { CircularProgress } from "@/src/components/ui/circular-progress";
import { useDownloadTaskForBookFormat } from "@/src/domain/download/download-store";

type BookDownloadStatus = "downloaded" | "notDownloaded" | "downloading";

type BookDownloadStatusIndicatorProps = {
  status?: BookDownloadStatus;
  libraryId?: string;
  bookId?: string;
  format?: string;
  fallbackProgress?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
};

type DownloadingProgressProps = {
  libraryId: string;
  bookId: string;
  format: string;
  size: number;
  strokeWidth: number;
  color: string;
  fallbackProgress?: number;
};

function DownloadingProgressImpl({
  libraryId,
  bookId,
  format,
  size,
  strokeWidth,
  color,
  fallbackProgress,
}: DownloadingProgressProps) {
  const task = useDownloadTaskForBookFormat(libraryId, bookId, format);
  const progress = task?.progress ?? fallbackProgress ?? 0;
  return <CircularProgress progress={progress} indeterminate={progress === 0} size={size} strokeWidth={strokeWidth} color={color} />;
}

const DownloadingProgress = memo(DownloadingProgressImpl);

export function BookDownloadStatusIndicator({
  status,
  libraryId,
  bookId,
  format,
  fallbackProgress,
  size = ICON_SIZE.base,
  strokeWidth = 1.5,
  color: overrideColor,
}: BookDownloadStatusIndicatorProps) {
  const palette = useThemePalette();
  const cloudColor = overrideColor ?? palette.textMuted;
  const progressColor = overrideColor ?? palette.primary;

  if (!status) return null;

  if (status === "notDownloaded") {
    return <CloudIcon size={size} color={cloudColor} />;
  }

  if (status === "downloading") {
    if (libraryId && bookId && format) {
      return (
        <DownloadingProgress
          libraryId={libraryId}
          bookId={bookId}
          format={format}
          size={size}
          strokeWidth={strokeWidth}
          color={progressColor}
          fallbackProgress={fallbackProgress}
        />
      );
    }
    return (
      <CircularProgress
        progress={fallbackProgress ?? 0}
        indeterminate={!fallbackProgress}
        size={size}
        strokeWidth={strokeWidth}
        color={progressColor}
      />
    );
  }

  return null;
}
