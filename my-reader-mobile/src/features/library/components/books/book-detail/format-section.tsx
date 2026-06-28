import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import type { BookDetail } from "@my-reader/tools/types/book"
import type { MenuAction } from "@react-native-menu/menu"
import { MenuView } from "@react-native-menu/menu"
import { SymbolView } from "expo-symbols"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Platform, StyleSheet } from "react-native"

import {
  CircularProgress,
  MoreActionsIcon,
  SectionCard,
  SectionLabel,
} from "@/src/components"
import {
  cancel,
  useDownloadTaskForBookFormat,
  useDownloadTaskForPath,
} from "@/src/domain/download/download-store"
import type { LocalState } from "@/src/domain/types"
import { formatFileSize } from "@/src/utils/book-detail"
import { Text, View } from "@/tw"
import { getProgressDisplay } from "../progress-label"
import type { DetailColors } from "./types"

type FormatSectionProps = {
  book: BookDetail
  colors: DetailColors
  defaultFormat: string | null
  formatInfoMap: Record<
    string,
    { relativePath: string; localState: LocalState | null }
  >
  formatSizeMap: Map<string, number>
  isNetworkSource: boolean
  libraryId: string
  onDeleteFormat: (format: string) => void
  onDownloadFormat: (format: string) => void
  onSetDefaultFormat: (format: string) => void
  onShareFormat: (format: string) => void
  progressByFormat?: Record<string, number>
  readableFormats: string[]
}

export function FormatSection({
  book,
  colors,
  defaultFormat,
  formatInfoMap,
  formatSizeMap,
  isNetworkSource,
  libraryId,
  onDeleteFormat,
  onDownloadFormat,
  onSetDefaultFormat,
  onShareFormat,
  progressByFormat,
  readableFormats,
}: FormatSectionProps) {
  const { t } = useTranslation()
  const readableFormatSet = new Set(
    readableFormats.map((format) => format.toUpperCase()),
  )
  const defaultFormatKey = defaultFormat?.toUpperCase() ?? null

  return (
    <View className="gap-3 px-4">
      <SectionLabel>{t("bookDetail.formatSection.title")}</SectionLabel>
      <SectionCard>
        {book.formats.map((format, index) => {
          const upper = format.toUpperCase()
          const formatInfo = formatInfoMap[upper]
          return (
            <FormatRow
              key={upper}
              bookId={String(book.id)}
              colors={colors}
              defaultFormatKey={defaultFormatKey}
              fileLocalState={formatInfo?.localState ?? null}
              format={upper}
              isLast={index === book.formats.length - 1}
              isNetworkSource={isNetworkSource}
              isReadable={readableFormatSet.has(upper)}
              libraryId={libraryId}
              onDelete={() => onDeleteFormat(upper)}
              onDownload={() => onDownloadFormat(upper)}
              onSetDefault={() => onSetDefaultFormat(upper)}
              onShare={() => onShareFormat(upper)}
              progressPercent={progressByFormat?.[upper]}
              relativePath={formatInfo?.relativePath}
              size={formatSizeMap.get(upper) ?? 0}
            />
          )
        })}
      </SectionCard>
    </View>
  )
}

function FormatRow({
  bookId,
  colors,
  defaultFormatKey,
  fileLocalState,
  format,
  isLast,
  isNetworkSource,
  isReadable,
  libraryId,
  onDelete,
  onDownload,
  onSetDefault,
  onShare,
  progressPercent,
  relativePath,
  size,
}: {
  bookId: string
  colors: DetailColors
  defaultFormatKey: string | null
  fileLocalState: LocalState | null
  format: string
  isLast: boolean
  isNetworkSource: boolean
  isReadable: boolean
  libraryId: string
  onDelete: () => void
  onDownload: () => void
  onSetDefault: () => void
  onShare: () => void
  progressPercent?: number
  relativePath: string | undefined
  size: number
}) {
  const { t } = useTranslation()
  const taskByPath = useDownloadTaskForPath(libraryId, relativePath ?? "")
  const taskByFormat = useDownloadTaskForBookFormat(libraryId, bookId, format)
  const candidateTask = taskByPath ?? taskByFormat
  const activeTask =
    candidateTask?.status === "queued" ||
    candidateTask?.status === "starting" ||
    candidateTask?.status === "downloading"
      ? candidateTask
      : undefined
  const isDownloading =
    activeTask?.status === "starting" ||
    activeTask?.status === "downloading" ||
    activeTask?.status === "queued"
  const downloadProgress = activeTask?.progress ?? 0
  const isPresent = fileLocalState === "present"
  const isDefault = defaultFormatKey === format
  const isRemote =
    isNetworkSource &&
    isReadable &&
    Boolean(relativePath) &&
    !isPresent &&
    !isDownloading
  const { text: statusText } = getProgressDisplay(
    progressPercent !== undefined ? { percent: progressPercent } : undefined,
    t,
  )

  const menuActions = useMemo<MenuAction[]>(
    () => [
      ...(isReadable
        ? [
            {
              id: "setDefault",
              title: t("bookDetail.formatSection.setDefault"),
              state: isDefault ? ("on" as const) : undefined,
            },
          ]
        : []),
      ...(isRemote
        ? [
            {
              id: "download",
              title: t("bookDetail.formatSection.downloadFormat", { format }),
            },
          ]
        : []),
      ...(isDownloading
        ? [
            {
              id: "cancel",
              title: t("bookDetail.formatSection.cancelDownload", { format }),
              attributes: { destructive: true },
            },
          ]
        : []),
      {
        id: "share",
        title: t("bookDetail.formatSection.shareFormat"),
      },
      ...(isPresent && isNetworkSource
        ? [
            {
              id: "delete",
              title: t("bookMenu.deleteDownload"),
              attributes: { destructive: true },
            },
          ]
        : []),
    ],
    [
      format,
      isDefault,
      isDownloading,
      isNetworkSource,
      isPresent,
      isReadable,
      isRemote,
      t,
    ],
  )

  const handleMenuAction = ({
    nativeEvent,
  }: {
    nativeEvent: { event: string }
  }) => {
    if (nativeEvent.event === "setDefault") onSetDefault()
    if (nativeEvent.event === "download") onDownload()
    if (nativeEvent.event === "cancel" && activeTask) cancel(activeTask.id)
    if (nativeEvent.event === "share") onShare()
    if (nativeEvent.event === "delete") onDelete()
  }

  const rowStyle = {
    borderBottomColor: colors.border,
    borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
    backgroundColor: colors.palette.surface,
  }

  const iconTint = colors.muted

  const statusIcon = isDownloading ? (
    <CircularProgress
      color={colors.accent}
      indeterminate={downloadProgress === 0}
      progress={downloadProgress}
      size={14}
      trackColor={colors.progressTrack}
    />
  ) : isRemote ? (
    Platform.OS === "ios" ? (
      <SymbolView name="cloud.fill" size={14} tintColor={iconTint} />
    ) : (
      <MaterialIcons name="cloud" size={14} color={iconTint} />
    )
  ) : null

  const menuTriggerWidth = Platform.OS === "ios" ? 44 : "100%"
  const menuHitSlop =
    Platform.OS === "ios"
      ? { top: 0, bottom: 0, left: 9999, right: 0 }
      : undefined

  return (
    <View className="px-4 py-3.5" style={rowStyle}>
      <View
        className="flex-row items-center justify-between gap-3"
        pointerEvents="none"
      >
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-base" style={{ color: colors.text }}>
              {format}
            </Text>
            {statusIcon}
          </View>
          <Text
            className="mt-0.5 text-base"
            style={{ color: colors.tertiary }}
            numberOfLines={1}
          >
            {formatFileSize(size)}
            {` · ${statusText}`}
            {isDefault ? ` · ${t("bookDetail.formatSection.default")}` : ""}
          </Text>
        </View>

        <MoreActionsIcon size={18} color={iconTint} />
      </View>

      <MenuView
        actions={menuActions}
        hitSlop={menuHitSlop}
        isAnchoredToRight={Platform.OS === "android"}
        onPressAction={handleMenuAction}
        shouldOpenOnLongPress={false}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: menuTriggerWidth,
        }}
      >
        <View style={{ width: "100%", height: "100%" }} />
      </MenuView>
    </View>
  )
}
