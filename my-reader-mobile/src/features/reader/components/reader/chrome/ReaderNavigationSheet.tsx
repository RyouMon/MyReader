import {
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet"
import type { Locator } from "@my-reader/readium"
import { formatHumanReadableTime } from "@my-reader/tools/human-readable-time"
import { MenuView, type MenuAction } from "@react-native-menu/menu"
import { forwardRef, memo, useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  ActivityIndicator,
  Platform,
  View as RNView,
  StyleSheet,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { EmptyState } from "@/src/components/ui"
import {
  underlayFromSurface,
  type ReaderChromePalette,
} from "@/src/design/reader-chrome-palette"
import type { ReaderTocItem } from "@/src/features/reader/components/reader/types"
import { Pressable, Text, TouchableHighlight, View } from "@/tw"
import { ReaderChromeIcon } from "./ReaderChromeIcon"
import {
  READER_SHEET_ELEVATION,
  READER_SHEET_RADIUS,
  READER_SHEET_SHADOW_COLOR,
  READER_SHEET_SHADOW_OFFSET_X,
  READER_SHEET_SHADOW_OFFSET_Y,
  READER_SHEET_SHADOW_OPACITY,
  READER_SHEET_SHADOW_RADIUS,
  READER_TOC_SHEET_INITIAL_INDEX,
  READER_TOC_SHEET_SNAP_POINTS,
} from "./readerChromeConstants"

const READER_NAVIGATION_ROW_HEIGHT = 52
const READER_NAVIGATION_ROW_GAP = 2
const READER_NAVIGATION_ROW_EXTENT =
  READER_NAVIGATION_ROW_HEIGHT + READER_NAVIGATION_ROW_GAP
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

export type ReaderNavigationSheetProps = {
  toc: ReaderTocItem[]
  activeTocIndex: number
  bookmarks: ReaderBookmarkItem[]
  bookmarksError: boolean
  bookmarksLoading: boolean
  bookmarksPending: boolean
  palette: ReaderChromePalette
  onRetryBookmarks: () => void
  onSelectTocItem: (item: ReaderTocItem) => void
  onSelectBookmark: (item: ReaderBookmarkItem) => void
  onDeleteBookmark: (
    item: ReaderBookmarkItem,
  ) => boolean | void | Promise<boolean | void>
  onDismiss: () => void
}

type NavigationTab = "toc" | "bookmarks"

type BookmarkRowProps = {
  item: ReaderBookmarkItem
  deletionDisabled: boolean
  selectionMode: boolean
  selected: boolean
  palette: ReaderChromePalette
  onDeleteBookmark: ReaderNavigationSheetProps["onDeleteBookmark"]
  onSelectBookmark: ReaderNavigationSheetProps["onSelectBookmark"]
  onToggleSelection: (id: string) => void
}

const BookmarkRow = memo(function BookmarkRow({
  item,
  deletionDisabled,
  selectionMode,
  selected,
  palette,
  onDeleteBookmark,
  onSelectBookmark,
  onToggleSelection,
}: BookmarkRowProps) {
  const { i18n, t } = useTranslation()
  const dateLabel = formatHumanReadableTime(
    item.createdAt,
    i18n.resolvedLanguage ?? i18n.language,
  )
  const highlighted = selected || (!selectionMode && item.active)
  const selectionActionTitle = t(
    selected ? "reader.bookmarks.deselect" : "reader.bookmarks.select",
  )
  const menuActions = useMemo<MenuAction[]>(
    () => [
      {
        id: "select",
        title: selectionActionTitle,
      },
      {
        id: "delete",
        title: t("common.delete"),
        attributes: {
          destructive: true,
          disabled: deletionDisabled,
        },
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
      if (action === "delete" && !deletionDisabled) {
        void onDeleteBookmark(item)
      }
    },
    [deletionDisabled, item, onDeleteBookmark, onToggleSelection],
  )
  const handlePress = useCallback(() => {
    if (selectionMode) {
      onToggleSelection(item.id)
      return
    }
    onSelectBookmark(item)
  }, [item, onSelectBookmark, onToggleSelection, selectionMode])
  const accessibilityLabel = [item.title, dateLabel, item.positionLabel]
    .filter(Boolean)
    .join(", ")

  const row = (
    <TouchableHighlight
      accessibilityRole={selectionMode ? "checkbox" : "button"}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={
        selectionMode ? undefined : t("reader.bookmarks.longPressHint")
      }
      accessibilityState={{ selected }}
      accessibilityActions={[
        {
          name: "select",
          label: selectionActionTitle,
        },
        ...(deletionDisabled
          ? []
          : [{ name: "delete", label: t("common.delete") }]),
      ]}
      className="mx-3 mb-0.5 rounded-xl"
      style={{
        minHeight: 72,
        backgroundColor: highlighted
          ? palette.tocRowActive
          : palette.tocRowIdle,
      }}
      underlayColor={underlayFromSurface(
        highlighted ? palette.tocRowActive : palette.tocRowIdle,
        palette.bg,
      )}
      onAccessibilityAction={({ nativeEvent }) =>
        handleAction(nativeEvent.actionName)
      }
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
                  item.active && !selectionMode
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
    </TouchableHighlight>
  )

  if (selectionMode) return row

  return (
    <MenuView
      actions={menuActions}
      shouldOpenOnLongPress
      isAnchoredToRight={Platform.OS === "android"}
      onPressAction={({ nativeEvent }) => handleAction(nativeEvent.event)}
    >
      {row}
    </MenuView>
  )
})

const ReaderNavigationSheet = forwardRef<
  BottomSheetModal,
  ReaderNavigationSheetProps
>(function ReaderNavigationSheet(
  {
    toc,
    activeTocIndex,
    bookmarks,
    bookmarksError,
    bookmarksLoading,
    bookmarksPending,
    palette,
    onRetryBookmarks,
    onSelectTocItem,
    onSelectBookmark,
    onDeleteBookmark,
    onDismiss,
  },
  ref,
) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [activeTab, setActiveTab] = useState<NavigationTab>("toc")
  const [managingBookmarks, setManagingBookmarks] = useState(false)
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [deletingSelection, setDeletingSelection] = useState(false)
  const selectedBookmarks = useMemo(
    () => bookmarks.filter((item) => selectedBookmarkIds.has(item.id)),
    [bookmarks, selectedBookmarkIds],
  )
  const selectionMode = managingBookmarks
  const mutationDisabled = bookmarksPending || deletingSelection
  const selectionDeletionDisabled =
    mutationDisabled || selectedBookmarks.length === 0
  const initialScrollOffset = useMemo(
    () =>
      activeTocIndex <= 0 ? 0 : activeTocIndex * READER_NAVIGATION_ROW_EXTENT,
    [activeTocIndex],
  )

  const renderHandle = useCallback(
    () => (
      <RNView style={styles.handleContainer}>
        <RNView style={[styles.handle, { backgroundColor: palette.handle }]} />
      </RNView>
    ),
    [palette.handle],
  )
  const toggleBookmarkSelection = useCallback((id: string) => {
    setManagingBookmarks(true)
    setSelectedBookmarkIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const changeTab = useCallback((tab: NavigationTab) => {
    setManagingBookmarks(false)
    setSelectedBookmarkIds(new Set())
    setActiveTab(tab)
  }, [])
  const handleDismiss = useCallback(() => {
    setManagingBookmarks(false)
    setSelectedBookmarkIds(new Set())
    onDismiss()
  }, [onDismiss])
  const toggleBookmarkManagement = useCallback(() => {
    setManagingBookmarks((current) => !current)
    setSelectedBookmarkIds(new Set())
  }, [])
  const deleteSelectedBookmarks = useCallback(async () => {
    if (selectionDeletionDisabled) return

    setDeletingSelection(true)
    try {
      for (const item of selectedBookmarks) {
        const removed = await onDeleteBookmark(item)
        if (removed === false) return
      }
      setManagingBookmarks(false)
      setSelectedBookmarkIds(new Set())
    } catch {
      // The bookmark query exposes the mutation error and retry action.
    } finally {
      setDeletingSelection(false)
    }
  }, [onDeleteBookmark, selectedBookmarks, selectionDeletionDisabled])
  const renderBookmarkItem = useCallback(
    ({ item }: { item: ReaderBookmarkItem }) => (
      <BookmarkRow
        item={item}
        deletionDisabled={mutationDisabled}
        selectionMode={selectionMode}
        selected={selectedBookmarkIds.has(item.id)}
        palette={palette}
        onDeleteBookmark={onDeleteBookmark}
        onSelectBookmark={onSelectBookmark}
        onToggleSelection={toggleBookmarkSelection}
      />
    ),
    [
      mutationDisabled,
      onDeleteBookmark,
      onSelectBookmark,
      palette,
      selectedBookmarkIds,
      selectionMode,
      toggleBookmarkSelection,
    ],
  )

  return (
    <BottomSheetModal
      ref={ref}
      index={READER_TOC_SHEET_INITIAL_INDEX}
      snapPoints={READER_TOC_SHEET_SNAP_POINTS}
      enableDynamicSizing={false}
      enablePanDownToClose
      style={styles.sheetShadow}
      backgroundStyle={[
        styles.background,
        { backgroundColor: palette.sheetSurface },
      ]}
      handleComponent={renderHandle}
      onDismiss={handleDismiss}
      accessibilityLabel={t("reader.navigationSheet")}
    >
      <RNView style={styles.tabs} accessibilityRole="tablist">
        {(["toc", "bookmarks"] as const).map((tab) => {
          const selected = activeTab === tab
          return (
            <Pressable
              key={tab}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={t(
                tab === "toc" ? "reader.toc" : "reader.bookmarks.title",
              )}
              className="flex-1 min-h-11 items-center justify-center rounded-md"
              style={{
                backgroundColor: selected
                  ? palette.segmentActive
                  : palette.segmentIdle,
              }}
              onPress={() => changeTab(tab)}
            >
              <Text
                className="text-base font-semibold"
                style={{
                  color: selected ? palette.accentText : palette.textMuted,
                }}
              >
                {t(tab === "toc" ? "reader.toc" : "reader.bookmarks.title")}
              </Text>
            </Pressable>
          )
        })}
      </RNView>

      {activeTab === "toc" ? (
        <BottomSheetScrollView
          key={`toc-${activeTocIndex}`}
          contentOffset={{ x: 0, y: initialScrollOffset }}
          showsVerticalScrollIndicator={false}
        >
          {toc.length === 0 ? (
            <NavigationEmptyLabel label={t("reader.noToc")} palette={palette} />
          ) : (
            toc.map((item, index) => {
              const isActive = index === activeTocIndex
              const depth = Math.min(item.depth ?? 0, 4)
              return (
                <TouchableHighlight
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  underlayColor={underlayFromSurface(
                    isActive ? palette.tocRowActive : palette.tocRowIdle,
                    palette.bg,
                  )}
                  className="mx-3 rounded-xl px-5"
                  style={{
                    backgroundColor: isActive
                      ? palette.tocRowActive
                      : palette.tocRowIdle,
                    height: READER_NAVIGATION_ROW_HEIGHT,
                    justifyContent: "center",
                    marginBottom: READER_NAVIGATION_ROW_GAP,
                    paddingLeft: 20 + depth * 18,
                  }}
                  onPress={() => onSelectTocItem(item)}
                >
                  <Text
                    className="text-base"
                    style={{
                      color: isActive ? palette.accentText : palette.text,
                    }}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {item.label}
                  </Text>
                </TouchableHighlight>
              )
            })
          )}
        </BottomSheetScrollView>
      ) : bookmarksLoading ? (
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
      ) : bookmarksError ? (
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
            onPress={onRetryBookmarks}
          >
            <Text
              className="text-base font-semibold"
              style={{ color: palette.accentText }}
            >
              {t("reader.bookmarks.retry")}
            </Text>
          </Pressable>
        </View>
      ) : (
        <RNView
          testID="reader-bookmarks-content"
          style={[styles.bookmarksContent, { paddingBottom: insets.bottom }]}
        >
          <BottomSheetFlatList
            data={bookmarks}
            keyExtractor={(item: ReaderBookmarkItem) => item.id}
            renderItem={renderBookmarkItem}
            style={styles.bookmarkList}
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
                  selectionMode
                    ? "reader.bookmarks.done"
                    : "reader.bookmarks.manage",
                )}
                accessibilityState={{ disabled: mutationDisabled }}
                className="h-11 w-11 items-center justify-center rounded-md"
                hitSlop={2}
                disabled={mutationDisabled}
                onPress={toggleBookmarkManagement}
              >
                <ReaderChromeIcon
                  name={selectionMode ? "check" : "manage"}
                  size={24}
                  color={
                    mutationDisabled ? palette.textFaint : palette.accentText
                  }
                />
              </Pressable>
              {selectionMode ? (
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
              {selectionMode ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("reader.bookmarks.deleteSelected")}
                  accessibilityState={{
                    disabled: selectionDeletionDisabled,
                  }}
                  className="h-11 w-11 items-center justify-center rounded-md"
                  hitSlop={2}
                  disabled={selectionDeletionDisabled}
                  onPress={() => void deleteSelectedBookmarks()}
                >
                  <ReaderChromeIcon
                    name="delete"
                    size={24}
                    color={
                      selectionDeletionDisabled
                        ? palette.textFaint
                        : palette.accentText
                    }
                  />
                </Pressable>
              ) : (
                <View className="h-11 w-11" />
              )}
            </View>
          ) : null}
        </RNView>
      )}
    </BottomSheetModal>
  )
})

function NavigationEmptyLabel({
  label,
  palette,
}: {
  label: string
  palette: ReaderChromePalette
}) {
  return (
    <View className="items-center px-5 py-12">
      <Text className="text-base" style={{ color: palette.textMuted }}>
        {label}
      </Text>
    </View>
  )
}

export default ReaderNavigationSheet

const styles = StyleSheet.create({
  background: {
    borderTopLeftRadius: READER_SHEET_RADIUS,
    borderTopRightRadius: READER_SHEET_RADIUS,
  },
  bookmarksContent: {
    flex: 1,
  },
  bookmarkList: {
    flex: 1,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  sheetShadow: {
    borderTopLeftRadius: READER_SHEET_RADIUS,
    borderTopRightRadius: READER_SHEET_RADIUS,
    shadowColor: READER_SHEET_SHADOW_COLOR,
    shadowOpacity: READER_SHEET_SHADOW_OPACITY,
    shadowRadius: READER_SHEET_SHADOW_RADIUS,
    shadowOffset: {
      width: READER_SHEET_SHADOW_OFFSET_X,
      height: READER_SHEET_SHADOW_OFFSET_Y,
    },
    elevation: READER_SHEET_ELEVATION,
  },
  handleContainer: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
  },
  tabs: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },
})
