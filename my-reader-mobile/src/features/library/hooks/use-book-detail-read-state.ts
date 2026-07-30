import { useCallback, useMemo } from "react"

import { resolveReadFormat } from "@my-reader/tools/utils"
import { useTranslation } from "react-i18next"
import { Alert } from "react-native"

import type { Library } from "@/src/domain/types"
import { isRemoteSourceType } from "@/src/domain/types"
import type { BookDetail } from "@my-reader/tools/types/book"

import type { FormatInfo } from "./use-book-detail-formats"

export function useBookDetailReadState(
  activeLibrary: Library,
  bookId: string,
  detail: BookDetail | null,
  selectedFormat: string | null,
  progressByFormat: Record<string, number> | undefined,
  formatInfoMap: Record<string, FormatInfo>,
  onOpenReader: (bookId: string, format: string | null) => void,
  handleDownloadFormat: (format: string) => void,
) {
  const { t } = useTranslation()

  const readableFormats = useMemo(() => detail?.readableFormats ?? [], [detail])

  const readableSelectedFormat = detail
    ? resolveReadFormat(
        detail.readableFormats,
        detail.preferredFormat,
        selectedFormat,
      )
    : null
  const selectedFormatUpper = readableSelectedFormat?.toUpperCase() ?? null
  const isSelectedFormatPresent = selectedFormatUpper
    ? formatInfoMap[selectedFormatUpper]?.localState === "present"
    : false

  const progress = useMemo(() => {
    if (!readableSelectedFormat) return 0
    return progressByFormat?.[readableSelectedFormat.toUpperCase()] ?? 0
  }, [progressByFormat, readableSelectedFormat])

  const canReadInApp = readableFormats.length > 0

  const handleReadAction = useCallback(() => {
    if (!canReadInApp || !readableSelectedFormat) return
    if (
      isRemoteSourceType(activeLibrary.sourceType) &&
      !isSelectedFormatPresent
    ) {
      handleDownloadFormat(readableSelectedFormat)
      Alert.alert(
        t("bookDetail.downloadStarted"),
        t("bookDetail.downloadStartedDetail", {
          format: readableSelectedFormat,
        }),
      )
      return
    }
    onOpenReader(bookId, readableSelectedFormat)
  }, [
    canReadInApp,
    readableSelectedFormat,
    activeLibrary.sourceType,
    isSelectedFormatPresent,
    handleDownloadFormat,
    t,
    bookId,
    onOpenReader,
  ])

  const readButtonTitle = useMemo(() => {
    if (!canReadInApp || !readableSelectedFormat) {
      return t("bookDetail.noReadableFormat")
    }
    if (
      isRemoteSourceType(activeLibrary.sourceType) &&
      !isSelectedFormatPresent
    ) {
      return t("bookDetail.downloadAndRead")
    }
    return progress > 0
      ? t("bookDetail.continueReading")
      : t("bookDetail.startReading")
  }, [
    canReadInApp,
    readableSelectedFormat,
    activeLibrary.sourceType,
    isSelectedFormatPresent,
    progress,
    t,
  ])

  return {
    readableFormats,
    readableSelectedFormat,
    canReadInApp,
    handleReadAction,
    readButtonTitle,
  }
}
