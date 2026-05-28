import { memo } from "react";

import { useDownloadTaskForBookFormat } from "@/src/domain/download/download-store";

import { CircularProgress } from "@/src/components/ui/circular-progress";

export type DownloadProgressIndicatorProps = {
  libraryId: string;
  bookId: string;
  format: string;
  size: number;
  strokeWidth: number;
  color: string;
  fallbackProgress?: number;
};

/**
 * Subscribes to the download store for a single book+format and renders a
 * progress ring. Hosting this in a leaf component keeps `useSyncExternalStore`
 * subscriptions limited to the cells that are actually downloading instead of
 * paying O(N) cost for every list row on every progress tick.
 */
function DownloadProgressIndicatorImpl({
  libraryId,
  bookId,
  format,
  size,
  strokeWidth,
  color,
  fallbackProgress,
}: DownloadProgressIndicatorProps) {
  const task = useDownloadTaskForBookFormat(libraryId, bookId, format);
  const progress = task?.progress ?? fallbackProgress ?? 0;
  return <CircularProgress progress={progress} size={size} strokeWidth={strokeWidth} color={color} />;
}

export const DownloadProgressIndicator = memo(DownloadProgressIndicatorImpl);
