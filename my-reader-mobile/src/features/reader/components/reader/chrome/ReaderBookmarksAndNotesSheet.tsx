import { BottomSheetModal } from "@expo/ui/community/bottom-sheet"
import { forwardRef, useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { View as RNView, StyleSheet } from "react-native"

import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import { Pressable, Text, View } from "@/tw"
import {
  type ReaderAnnotationItem,
  ReaderAnnotationList,
} from "./ReaderAnnotationList"
import {
  type ReaderBookmarkItem,
  ReaderBookmarkList,
} from "./ReaderBookmarkList"
import {
  READER_TOC_SHEET_INITIAL_INDEX,
  READER_TOC_SHEET_SNAP_POINTS,
} from "./readerChromeConstants"

export type ReaderBookmarksAndNotesSheetProps = {
  annotations: ReaderAnnotationItem[]
  annotationsAvailable: boolean
  annotationsLoading: boolean
  annotationsPending: boolean
  annotationsError: boolean
  bookmarks: ReaderBookmarkItem[]
  bookmarksError: boolean
  bookmarksLoading: boolean
  bookmarksPending: boolean
  palette: ReaderChromePalette
  onRetryAnnotations: () => void
  onSelectAnnotation: (item: ReaderAnnotationItem) => void
  onEditAnnotation: (item: ReaderAnnotationItem) => void
  onDeleteAnnotation: (
    item: ReaderAnnotationItem,
  ) => boolean | void | Promise<boolean | void>
  onRetryBookmarks: () => void
  onSelectBookmark: (item: ReaderBookmarkItem) => void
  onDeleteBookmark: (
    item: ReaderBookmarkItem,
  ) => boolean | void | Promise<boolean | void>
  onDismiss: () => void
}

type PanelTab = "bookmarks" | "notes"

const ReaderBookmarksAndNotesSheet = forwardRef<
  BottomSheetModal,
  ReaderBookmarksAndNotesSheetProps
>(function ReaderBookmarksAndNotesSheet(
  {
    annotations,
    annotationsAvailable,
    annotationsLoading,
    annotationsPending,
    annotationsError,
    bookmarks,
    bookmarksError,
    bookmarksLoading,
    bookmarksPending,
    palette,
    onRetryAnnotations,
    onSelectAnnotation,
    onEditAnnotation,
    onDeleteAnnotation,
    onRetryBookmarks,
    onSelectBookmark,
    onDeleteBookmark,
    onDismiss,
  },
  ref,
) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<PanelTab>("bookmarks")
  const [bookmarkResetKey, setBookmarkResetKey] = useState(0)
  const handleDismiss = useCallback(() => {
    setActiveTab("bookmarks")
    setBookmarkResetKey((current) => current + 1)
    onDismiss()
  }, [onDismiss])
  const changeTab = useCallback((tab: PanelTab) => {
    setActiveTab(tab)
    setBookmarkResetKey((current) => current + 1)
  }, [])

  return (
    <BottomSheetModal
      ref={ref}
      index={READER_TOC_SHEET_INITIAL_INDEX}
      snapPoints={READER_TOC_SHEET_SNAP_POINTS}
      enableDynamicSizing={false}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: palette.sheetSurface }}
      onDismiss={handleDismiss}
    >
      <View className="min-h-12 justify-center px-5 pb-2">
        <Text
          accessibilityRole="header"
          className="text-lg font-semibold"
          style={{ color: palette.text }}
        >
          {t("reader.annotations.title")}
        </Text>
      </View>

      {annotationsAvailable ? (
        <RNView
          style={styles.tabs}
          accessibilityRole="tablist"
          accessibilityLabel={t("reader.annotations.title")}
        >
          {(["bookmarks", "notes"] as const).map((tab) => {
            const selected = activeTab === tab
            const label = t(
              tab === "bookmarks"
                ? "reader.bookmarks.title"
                : "reader.annotations.notesTab",
            )
            return (
              <Pressable
                key={tab}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={label}
                className="min-h-11 flex-1 items-center justify-center rounded-md"
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
                  {label}
                </Text>
              </Pressable>
            )
          })}
        </RNView>
      ) : null}

      {activeTab === "bookmarks" || !annotationsAvailable ? (
        <ReaderBookmarkList
          key={bookmarkResetKey}
          bookmarks={bookmarks}
          error={bookmarksError}
          loading={bookmarksLoading}
          pending={bookmarksPending}
          palette={palette}
          onRetry={onRetryBookmarks}
          onSelect={onSelectBookmark}
          onDelete={onDeleteBookmark}
        />
      ) : (
        <ReaderAnnotationList
          annotations={annotations}
          loading={annotationsLoading}
          pending={annotationsPending}
          error={annotationsError}
          palette={palette}
          onRetry={onRetryAnnotations}
          onSelect={onSelectAnnotation}
          onEdit={onEditAnnotation}
          onDelete={onDeleteAnnotation}
        />
      )}
    </BottomSheetModal>
  )
})

export default ReaderBookmarksAndNotesSheet

const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
})
