import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import { SymbolView } from "expo-symbols"
import { memo } from "react"
import { Platform, StyleSheet, View } from "react-native"

import { ICON_SIZE } from "@/src/design/icon-sizes"
import { useThemePalette } from "@/src/design/tokens"
import { useDownloadTaskForBookFormat } from "@/src/domain/download/download-store"
import { useBookUploadProgress } from "@/src/domain/sync/book-upload-store"
import { CircularProgress } from "@/src/components/ui/circular-progress"
import { CloudIcon } from "@/src/components/ui/cloud-icon"

export type BookDownloadStatus = "downloaded" | "notDownloaded" | "downloading"

export type BookTransferStatus =
  | BookDownloadStatus
  | "uploadPending"
  | "uploading"

type BookTransferStatusIndicatorProps = {
  status?: BookTransferStatus
  libraryId?: string
  bookId?: string
  bookUuid?: string
  format?: string
  fallbackProgress?: number | null
  size?: number
  strokeWidth?: number
  color?: string
}

type BookTransferStatusIndicatorBaseProps = Omit<
  BookTransferStatusIndicatorProps,
  "color"
> & {
  cloudColor: string
  progressColor: string
}

type DownloadingProgressProps = {
  libraryId: string
  bookId: string
  format: string
  size: number
  strokeWidth: number
  color: string
  fallbackProgress?: number
}

type TransferProgressProps = {
  direction: "down" | "up"
  progress: number
  indeterminate?: boolean
  size: number
  strokeWidth: number
  color: string
}

function TransferArrow({
  direction,
  size,
  color,
}: {
  direction: "down" | "up"
  size: number
  color: string
}) {
  if (Platform.OS === "ios") {
    return (
      <SymbolView
        name={direction === "up" ? "arrow.up" : "arrow.down"}
        size={size}
        tintColor={color}
        weight="semibold"
      />
    )
  }
  return (
    <MaterialIcons
      name={direction === "up" ? "arrow-upward" : "arrow-downward"}
      size={size}
      color={color}
    />
  )
}

function TransferProgress({
  direction,
  progress,
  indeterminate = false,
  size,
  strokeWidth,
  color,
}: TransferProgressProps) {
  return (
    <View style={{ width: size, height: size }}>
      <CircularProgress
        progress={progress}
        indeterminate={indeterminate}
        size={size}
        strokeWidth={strokeWidth}
        color={color}
      />
      <View
        pointerEvents="none"
        testID={`transfer-arrow-${direction}`}
        style={styles.arrow}
      >
        <TransferArrow
          direction={direction}
          size={Math.max(8, Math.round(size * 0.55))}
          color={color}
        />
      </View>
    </View>
  )
}

function DownloadingProgressImpl({
  libraryId,
  bookId,
  format,
  size,
  strokeWidth,
  color,
  fallbackProgress,
}: DownloadingProgressProps) {
  const task = useDownloadTaskForBookFormat(libraryId, bookId, format)
  const progress = task?.progress ?? fallbackProgress ?? 0
  if (!task) {
    return (
      <CircularProgress
        progress={progress}
        indeterminate={progress === 0}
        size={size}
        strokeWidth={strokeWidth}
        color={color}
      />
    )
  }
  return (
    <TransferProgress
      direction="down"
      progress={progress}
      indeterminate={task.status === "queued" || task.status === "starting"}
      size={size}
      strokeWidth={strokeWidth}
      color={color}
    />
  )
}

const DownloadingProgress = memo(DownloadingProgressImpl)

export function BookTransferStatusIndicatorBase({
  status,
  libraryId,
  bookId,
  bookUuid,
  format,
  fallbackProgress,
  size = ICON_SIZE.base,
  strokeWidth = 1.5,
  cloudColor,
  progressColor,
}: BookTransferStatusIndicatorBaseProps) {
  const uploadProgress = useBookUploadProgress(libraryId, bookUuid)
  const resolvedUploadProgress =
    uploadProgress !== undefined ? uploadProgress : fallbackProgress

  // BookCard passes colors directly into this Base variant to keep theme
  // context reads out of recycled FlashList cells.
  if (!status) return null

  if (status === "notDownloaded") {
    return <CloudIcon size={size} color={cloudColor} />
  }

  if (status === "uploadPending") {
    return <CloudIcon size={size} color={cloudColor} variant="dashed" />
  }

  if (status === "uploading") {
    return (
      <TransferProgress
        direction="up"
        progress={resolvedUploadProgress ?? 0}
        indeterminate={resolvedUploadProgress == null}
        size={size}
        strokeWidth={strokeWidth}
        color={progressColor}
      />
    )
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
          fallbackProgress={fallbackProgress ?? undefined}
        />
      )
    }
    if (fallbackProgress) {
      return (
        <TransferProgress
          direction="down"
          progress={fallbackProgress}
          size={size}
          strokeWidth={strokeWidth}
          color={progressColor}
        />
      )
    }
    return (
      <CircularProgress
        progress={0}
        indeterminate
        size={size}
        strokeWidth={strokeWidth}
        color={progressColor}
      />
    )
  }

  return null
}

export function BookTransferStatusIndicator({
  status,
  libraryId,
  bookId,
  bookUuid,
  format,
  fallbackProgress,
  size = ICON_SIZE.base,
  strokeWidth = 1.5,
  color: overrideColor,
}: BookTransferStatusIndicatorProps) {
  const palette = useThemePalette()
  const cloudColor = overrideColor ?? palette.textMuted
  const progressColor = overrideColor ?? palette.primary

  return (
    <BookTransferStatusIndicatorBase
      status={status}
      libraryId={libraryId}
      bookId={bookId}
      bookUuid={bookUuid}
      format={format}
      fallbackProgress={fallbackProgress}
      size={size}
      strokeWidth={strokeWidth}
      cloudColor={cloudColor}
      progressColor={progressColor}
    />
  )
}

const styles = StyleSheet.create({
  arrow: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
})
