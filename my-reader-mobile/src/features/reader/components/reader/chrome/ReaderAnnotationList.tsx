import EditSquareIcon from "@expo/material-symbols/edit_square.xml"
import { BottomSheetFlatList } from "@expo/ui/community/bottom-sheet"
import type { Locator } from "@my-reader/readium"
import { formatHumanReadableTime } from "@my-reader/tools/human-readable-time"
import {
  type ReaderAnnotationColor,
  readerAnnotationTint,
} from "@my-reader/tools/reader-annotations"
import { type MenuAction, MenuView } from "@react-native-menu/menu"
import { memo, useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { ActivityIndicator, StyleSheet } from "react-native"

import { EmptyState } from "@/src/components/ui"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import { Pressable, Text, View } from "@/tw"
import { ReaderChromeIcon } from "./ReaderChromeIcon"

export type ReaderAnnotationItem = {
  id: string
  locator: Locator
  excerpt: string
  note: string | null
  color: ReaderAnnotationColor
  createdAt: number
}

type ReaderAnnotationListProps = {
  annotations: ReaderAnnotationItem[]
  loading: boolean
  pending: boolean
  error: boolean
  palette: ReaderChromePalette
  onRetry: () => void
  onSelect: (item: ReaderAnnotationItem) => void
  onEdit: (item: ReaderAnnotationItem) => void
  onDelete: (item: ReaderAnnotationItem) => void
}

type AnnotationRowProps = Pick<
  ReaderAnnotationListProps,
  "palette" | "pending" | "onSelect" | "onEdit" | "onDelete"
> & { item: ReaderAnnotationItem }

const AnnotationRow = memo(function AnnotationRow({
  item,
  palette,
  pending,
  onSelect,
  onEdit,
  onDelete,
}: AnnotationRowProps) {
  const { i18n, t } = useTranslation()
  const dateLabel = formatHumanReadableTime(
    item.createdAt,
    i18n.resolvedLanguage ?? i18n.language,
  )
  const actions = useMemo<MenuAction[]>(
    () => [
      { id: "edit", title: t("reader.annotations.edit") },
      {
        id: "delete",
        title: t("common.delete"),
        attributes: { destructive: true, disabled: pending },
      },
    ],
    [pending, t],
  )
  const handleAction = useCallback(
    (action: string) => {
      if (action === "edit") onEdit(item)
      if (action === "delete" && !pending) onDelete(item)
    },
    [item, onDelete, onEdit, pending],
  )

  return (
    <View
      className="mx-3 mb-0.5 flex-row items-stretch rounded-xl"
      style={{ backgroundColor: palette.tocRowIdle }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[item.excerpt, item.note, dateLabel]
          .filter(Boolean)
          .join(", ")}
        accessibilityHint={t("reader.annotations.openHint")}
        className="min-h-[76px] min-w-0 flex-1 flex-row items-start px-5 py-3"
        onPress={() => onSelect(item)}
      >
        <View
          accessibilityElementsHidden
          className="mr-3 mt-1 h-4 w-4 rounded-full"
          style={{ backgroundColor: readerAnnotationTint(item.color) }}
        />
        <View className="min-w-0 flex-1">
          <Text
            className="text-base font-semibold"
            style={{ color: palette.text }}
            numberOfLines={2}
          >
            {item.excerpt}
          </Text>
          {item.note ? (
            <Text
              className="mt-1 text-sm"
              style={{ color: palette.textMuted }}
              numberOfLines={2}
            >
              {item.note}
            </Text>
          ) : null}
          {dateLabel ? (
            <Text
              className="mt-1 text-xs"
              style={{ color: palette.textFaint }}
              numberOfLines={1}
            >
              {dateLabel}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <MenuView
        actions={actions}
        isAnchoredToRight
        onPressAction={({ nativeEvent }) => handleAction(nativeEvent.event)}
      >
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={t("reader.annotations.edit")}
          accessibilityState={{ disabled: pending }}
          className="h-12 w-12 items-center justify-center rounded-md"
        >
          <ReaderChromeIcon name="more" size={22} color={palette.textMuted} />
        </View>
      </MenuView>
    </View>
  )
})

export function ReaderAnnotationList({
  annotations,
  loading,
  pending,
  error,
  palette,
  onRetry,
  onSelect,
  onEdit,
  onDelete,
}: ReaderAnnotationListProps) {
  const { t } = useTranslation()
  const renderItem = useCallback(
    ({ item }: { item: ReaderAnnotationItem }) => (
      <AnnotationRow
        item={item}
        palette={palette}
        pending={pending}
        onSelect={onSelect}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    ),
    [onDelete, onEdit, onSelect, palette, pending],
  )

  if (loading) {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={t("reader.annotations.loading")}
        className="items-center gap-3 px-5 py-12"
      >
        <ActivityIndicator color={palette.accentText} />
        <Text className="text-base" style={{ color: palette.textMuted }}>
          {t("reader.annotations.loading")}
        </Text>
      </View>
    )
  }

  if (error) {
    return (
      <View className="items-center gap-4 px-5 py-12">
        <Text
          accessibilityRole="alert"
          className="text-center text-base"
          style={{ color: palette.textMuted }}
        >
          {t("reader.annotations.error")}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("reader.annotations.retry")}
          className="min-h-11 items-center justify-center rounded-md px-4"
          style={{ backgroundColor: palette.segmentActive }}
          onPress={onRetry}
        >
          <Text
            className="text-base font-semibold"
            style={{ color: palette.accentText }}
          >
            {t("reader.annotations.retry")}
          </Text>
        </Pressable>
      </View>
    )
  }

  return (
    <BottomSheetFlatList<ReaderAnnotationItem>
      data={annotations}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={
        annotations.length === 0 ? styles.emptyListContent : undefined
      }
      ListEmptyComponent={
        <EmptyState
          title={t("reader.annotations.empty")}
          detail={t("reader.annotations.emptyDetail")}
          icon={{ ios: "square.and.pencil", android: EditSquareIcon }}
          layout="container"
          colors={{
            icon: palette.textFaint,
            title: palette.text,
            detail: palette.textMuted,
          }}
        />
      }
    />
  )
}

const styles = StyleSheet.create({
  emptyListContent: { flexGrow: 1 },
})
