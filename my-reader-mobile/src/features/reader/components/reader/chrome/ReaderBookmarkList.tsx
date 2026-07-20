import { BottomSheetFlatList } from "@expo/ui/community/bottom-sheet"
import type { Locator } from "@my-reader/readium"
import { formatHumanReadableTime } from "@my-reader/tools/human-readable-time"
import { MenuView, type MenuAction } from "@react-native-menu/menu"
import { memo, useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  ActivityIndicator,
  Platform,
  View as RNView,
  StyleSheet,
} from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"

import { EmptyState } from "@/src/components/ui"
import {
  underlayFromSurface,
  type ReaderChromePalette,
} from "@/src/design/reader-chrome-palette"
import { Pressable, Text, View } from "@/tw"
import { ReaderChromeIcon } from "./ReaderChromeIcon"

const BOOKMARK_EMPTY_ICON = {
  ios: "bookmark",
  android: "bookmark-border",
}

export type ReaderBookmarkItem = {
  id: string
  locator: Locator
  title: string
  positionLabel: string
  createdAt: number
  active: boolean
}

export type ReaderBookmarkListProps = {
  bookmarks: ReaderBookmarkItem[]
  error: boolean
  loading: boolean
  pending: boolean
  palette: ReaderChromePalette
  onRetry: () => void
  onSelect: (item: ReaderBookmarkItem) => void
  onDelete: (
    item: ReaderBookmarkItem,
  ) => boolean | void | Promise<boolean | void>
}

type BookmarkRowProps = Pick<
  ReaderBookmarkListProps,
  "palette" | "onDelete" | "onSelect"
> & {
  item: ReaderBookmarkItem
  deletionDisabled: boolean
  selectionMode: boolean
  selected: boolean
  onToggleSelection: (id: string) => void
}

const BookmarkRow = memo(function BookmarkRow({
  item,
  deletionDisabled,
  selectionMode,
  selected,
  palette,
  onDelete,
  onSelect,
  onToggleSelection,
}: BookmarkRowProps) {
  const { i18n, t } = useTranslation()
  const dateLabel = formatHumanReadableTime(
    item.createdAt,
    i18n.resolvedLanguage ?? i18n.language,
  )
  const [rowPressed, setRowPressed] = useState(false)
  const rowActive = selectionMode ? selected : item.active
  const selectionActionTitle = t(
    selected ? "reader.bookmarks.deselect" : "reader.bookmarks.select",
  )
  const menuActions = useMemo<MenuAction[]>(
    () => [
      { id: "select", title: selectionActionTitle },
      {
        id: "delete",
        title: t("common.delete"),
        attributes: { destructive: true, disabled: deletionDisabled },
      },
    ],
    [deletionDisabled, selectionActionTitle, t],
  )
  const handleAction = useCallback(
    (action: string) => {
      if (action === "select") {
        onToggleSelection(item.id)
        return
      }
      if (action === "delete" && !deletionDisabled) void onDelete(item)
    },
    [deletionDisabled, item, onDelete, onToggleSelection],
  )
  const handlePress = useCallback(() => {
    if (selectionMode) {
      onToggleSelection(item.id)
      return
    }
    onSelect(item)
  }, [item, onSelect, onToggleSelection, selectionMode])
  const handlePressIn = useCallback(() => setRowPressed(true), [])
  const handlePressOut = useCallback(() => setRowPressed(false), [])
  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(350)
        .runOnJS(true)
        .onBegin(handlePressIn)
        .onEnd((_event, success) => {
          if (success) handlePress()
        })
        .onFinalize(handlePressOut),
    [handlePress, handlePressIn, handlePressOut],
  )
  const accessibilityLabel = [item.title, dateLabel, item.positionLabel]
    .filter(Boolean)
    .join(", ")
  const backgroundColor = rowActive ? palette.tocRowActive : palette.tocRowIdle
  const pressedBackgroundColor = underlayFromSurface(
    backgroundColor,
    palette.bg,
  )
  const row = (
    <Pressable
      accessibilityRole={selectionMode ? "checkbox" : "button"}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={
        selectionMode ? undefined : t("reader.bookmarks.longPressHint")
      }
      accessibilityState={{ selected }}
      accessibilityActions={[
        { name: "select", label: selectionActionTitle },
        ...(deletionDisabled
          ? []
          : [{ name: "delete", label: t("common.delete") }]),
      ]}
      className="mx-3 mb-0.5 rounded-xl"
      style={{
        minHeight: 72,
        backgroundColor: rowPressed ? pressedBackgroundColor : backgroundColor,
      }}
      onAccessibilityAction={({ nativeEvent }) =>
        handleAction(nativeEvent.actionName)
      }
      onPressIn={selectionMode ? handlePressIn : undefined}
      onPressOut={selectionMode ? handlePressOut : undefined}
      onPress={handlePress}
    >
      <View className="flex-1 flex-row items-center px-5 py-2">
        {selectionMode ? (
          <View
            className="mr-3 h-6 w-6 items-center justify-center rounded-full border"
            style={{
              borderColor: selected ? palette.accentText : palette.textMuted,
              backgroundColor: selected ? palette.accentText : "transparent",
            }}
          >
            {selected ? (
              <ReaderChromeIcon
                name="check"
                size={16}
                color={palette.sheetSurface}
              />
            ) : null}
          </View>
        ) : null}

        <View className="min-w-0 flex-1">
          <View className="flex-row items-start">
            <Text
              className="min-w-0 flex-1 text-base font-semibold"
              style={{
                color:
                  rowActive && !selectionMode
                    ? palette.accentText
                    : palette.text,
              }}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {item.title}
            </Text>
            {item.positionLabel ? (
              <Text
                className="ml-3 text-base"
                style={{ color: palette.textMuted }}
              >
                {item.positionLabel}
              </Text>
            ) : null}
          </View>
          {dateLabel ? (
            <Text
              className="mt-0.5 text-sm"
              style={{ color: palette.textMuted }}
              numberOfLines={1}
            >
              {dateLabel}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  )

  if (selectionMode) return row

  return (
    <GestureDetector gesture={tapGesture}>
      <MenuView
        actions={menuActions}
        shouldOpenOnLongPress
        isAnchoredToRight={Platform.OS === "android"}
        onPressAction={({ nativeEvent }) => handleAction(nativeEvent.event)}
      >
        {row}
      </MenuView>
    </GestureDetector>
  )
})

export function ReaderBookmarkList({
  bookmarks,
  error,
  loading,
  pending,
  palette,
  onRetry,
  onSelect,
  onDelete,
}: ReaderBookmarkListProps) {
  const { t } = useTranslation()
  const [managing, setManaging] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [deletingSelection, setDeletingSelection] = useState(false)
  const selectedBookmarks = useMemo(
    () => bookmarks.filter((item) => selectedIds.has(item.id)),
    [bookmarks, selectedIds],
  )
  const mutationDisabled = pending || deletingSelection
  const deletionDisabled = mutationDisabled || selectedBookmarks.length === 0

  const toggleSelection = useCallback((id: string) => {
    setManaging(true)
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const toggleManagement = useCallback(() => {
    setManaging((current) => !current)
    setSelectedIds(new Set())
  }, [])
  const deleteSelected = useCallback(async () => {
    if (deletionDisabled) return
    setDeletingSelection(true)
    try {
      for (const item of selectedBookmarks) {
        const removed = await onDelete(item)
        if (removed === false) return
      }
      setManaging(false)
      setSelectedIds(new Set())
    } catch {
      // The bookmark query exposes the mutation error and retry action.
    } finally {
      setDeletingSelection(false)
    }
  }, [deletionDisabled, onDelete, selectedBookmarks])
  const renderItem = useCallback(
    ({ item }: { item: ReaderBookmarkItem }) => (
      <BookmarkRow
        item={item}
        deletionDisabled={mutationDisabled}
        selectionMode={managing}
        selected={selectedIds.has(item.id)}
        palette={palette}
        onDelete={onDelete}
        onSelect={onSelect}
        onToggleSelection={toggleSelection}
      />
    ),
    [
      managing,
      mutationDisabled,
      onDelete,
      onSelect,
      palette,
      selectedIds,
      toggleSelection,
    ],
  )

  if (loading) {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={t("reader.bookmarks.loading")}
        className="items-center gap-3 px-5 py-12"
      >
        <ActivityIndicator color={palette.accentText} />
        <Text className="text-base" style={{ color: palette.textMuted }}>
          {t("reader.bookmarks.loading")}
        </Text>
      </View>
    )
  }

  if (error) {
    return (
      <View className="items-center gap-4 px-5 py-12">
        <Text
          className="text-center text-base"
          style={{ color: palette.textMuted }}
        >
          {t("reader.bookmarks.error")}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("reader.bookmarks.retry")}
          className="min-h-11 items-center justify-center rounded-md px-4"
          style={{ backgroundColor: palette.segmentActive }}
          onPress={onRetry}
        >
          <Text
            className="text-base font-semibold"
            style={{ color: palette.accentText }}
          >
            {t("reader.bookmarks.retry")}
          </Text>
        </Pressable>
      </View>
    )
  }

  return (
    <RNView testID="reader-bookmarks-content" style={styles.content}>
      <BottomSheetFlatList
        data={bookmarks}
        keyExtractor={(item: ReaderBookmarkItem) => item.id}
        renderItem={renderItem}
        style={styles.list}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={
          bookmarks.length === 0 ? styles.emptyListContent : undefined
        }
        ListEmptyComponent={
          <EmptyState
            title={t("reader.bookmarks.empty")}
            detail={t("reader.bookmarks.emptyDetail")}
            icon={BOOKMARK_EMPTY_ICON}
            layout="container"
            colors={{
              icon: palette.textFaint,
              title: palette.text,
              detail: palette.textMuted,
            }}
          />
        }
      />

      {bookmarks.length > 0 ? (
        <View
          className="flex-row items-center px-5 py-2"
          style={{
            borderTopWidth: StyleSheet.hairlineWidth,
            borderColor: palette.border,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(
              managing ? "reader.bookmarks.done" : "reader.bookmarks.manage",
            )}
            accessibilityState={{ disabled: mutationDisabled }}
            className="h-11 w-11 items-center justify-center rounded-md"
            hitSlop={2}
            disabled={mutationDisabled}
            onPress={toggleManagement}
          >
            <ReaderChromeIcon
              name={managing ? "check" : "manage"}
              size={24}
              color={mutationDisabled ? palette.textFaint : palette.accentText}
            />
          </Pressable>
          {managing ? (
            <Text
              className="flex-1 text-center text-base font-semibold"
              style={{ color: palette.textMuted }}
            >
              {t("reader.bookmarks.selectedCount", {
                count: selectedBookmarks.length,
              })}
            </Text>
          ) : (
            <View className="flex-1" />
          )}
          {managing ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("reader.bookmarks.deleteSelected")}
              accessibilityState={{ disabled: deletionDisabled }}
              className="h-11 w-11 items-center justify-center rounded-md"
              hitSlop={2}
              disabled={deletionDisabled}
              onPress={() => void deleteSelected()}
            >
              <ReaderChromeIcon
                name="delete"
                size={24}
                color={
                  deletionDisabled ? palette.textFaint : palette.accentText
                }
              />
            </Pressable>
          ) : (
            <View className="h-11 w-11" />
          )}
        </View>
      ) : null}
    </RNView>
  )
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  list: { flex: 1 },
  emptyListContent: { flexGrow: 1 },
})
