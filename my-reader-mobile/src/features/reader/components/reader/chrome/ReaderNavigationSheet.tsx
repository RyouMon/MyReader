import {
  BottomSheetFlatList,
  BottomSheetModal,
} from "@expo/ui/community/bottom-sheet"
import { forwardRef, memo, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { type ListRenderItem, Platform, StyleSheet } from "react-native"

import {
  underlayFromSurface,
  type ReaderChromePalette,
} from "@/src/design/reader-chrome-palette"
import type { ReaderTocItem } from "@/src/features/reader/components/reader/types"
import { Text, TouchableHighlight, View } from "@/tw"
import {
  READER_TOC_SHEET_INITIAL_INDEX,
  READER_TOC_SHEET_SNAP_POINTS,
} from "./readerChromeConstants"

const READER_NAVIGATION_ROW_HEIGHT = 52
const READER_NAVIGATION_ROW_GAP = 2
const READER_NAVIGATION_ROW_EXTENT =
  READER_NAVIGATION_ROW_HEIGHT + READER_NAVIGATION_ROW_GAP

function readerTocKeyExtractor(item: ReaderTocItem) {
  return item.id
}

function getReaderNavigationRowLayout(
  _data: ArrayLike<ReaderTocItem> | null | undefined,
  index: number,
) {
  return {
    length: READER_NAVIGATION_ROW_EXTENT,
    offset: READER_NAVIGATION_ROW_EXTENT * index,
    index,
  }
}

export type ReaderNavigationSheetProps = {
  toc: ReaderTocItem[]
  activeTocIndex: number
  palette: ReaderChromePalette
  onSelectTocItem: (item: ReaderTocItem) => void
  onDismiss: () => void
}

type TocRowProps = {
  item: ReaderTocItem
  active: boolean
  palette: ReaderChromePalette
  onSelect: (item: ReaderTocItem) => void
}

const TocRow = memo(function TocRow({
  item,
  active,
  palette,
  onSelect,
}: TocRowProps) {
  const depth = Math.min(item.depth ?? 0, 4)

  return (
    <TouchableHighlight
      accessibilityRole="button"
      accessibilityLabel={item.label}
      underlayColor={underlayFromSurface(
        active ? palette.tocRowActive : palette.tocRowIdle,
        palette.bg,
      )}
      className="mx-3 rounded-xl px-5"
      style={{
        backgroundColor: active ? palette.tocRowActive : palette.tocRowIdle,
        height: READER_NAVIGATION_ROW_HEIGHT,
        justifyContent: "center",
        marginBottom: READER_NAVIGATION_ROW_GAP,
        paddingLeft: 20 + depth * 18,
      }}
      onPress={() => onSelect(item)}
    >
      <Text
        className="text-base"
        style={{ color: active ? palette.accentText : palette.text }}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {item.label}
      </Text>
    </TouchableHighlight>
  )
})

const ReaderNavigationSheet = forwardRef<
  BottomSheetModal,
  ReaderNavigationSheetProps
>(function ReaderNavigationSheet(
  { toc, activeTocIndex, palette, onSelectTocItem, onDismiss },
  ref,
) {
  const { t } = useTranslation()
  const initialTocIndex =
    toc.length === 0
      ? undefined
      : Math.min(Math.max(activeTocIndex, 0), toc.length - 1)
  const renderTocItem = useCallback<ListRenderItem<ReaderTocItem>>(
    ({ item, index }) => (
      <TocRow
        item={item}
        active={index === activeTocIndex}
        palette={palette}
        onSelect={onSelectTocItem}
      />
    ),
    [activeTocIndex, onSelectTocItem, palette],
  )

  return (
    <BottomSheetModal
      ref={ref}
      index={READER_TOC_SHEET_INITIAL_INDEX}
      snapPoints={READER_TOC_SHEET_SNAP_POINTS}
      enableDynamicSizing={false}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: palette.sheetSurface }}
      onDismiss={onDismiss}
    >
      <View className="min-h-12 justify-center px-5 pb-2">
        <Text
          accessibilityRole="header"
          className="text-lg font-semibold"
          style={{ color: palette.text }}
        >
          {t("reader.toc")}
        </Text>
      </View>
      <BottomSheetFlatList<ReaderTocItem>
        key={`toc-${initialTocIndex ?? "empty"}`}
        data={toc}
        keyExtractor={readerTocKeyExtractor}
        renderItem={renderTocItem}
        getItemLayout={getReaderNavigationRowLayout}
        initialScrollIndex={initialTocIndex}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={5}
        removeClippedSubviews={Platform.OS === "android"}
        style={styles.list}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={
          toc.length === 0 ? styles.emptyListContent : undefined
        }
        ListEmptyComponent={
          <View className="items-center px-5 py-12">
            <Text className="text-base" style={{ color: palette.textMuted }}>
              {t("reader.noToc")}
            </Text>
          </View>
        }
      />
    </BottomSheetModal>
  )
})

export default ReaderNavigationSheet

const styles = StyleSheet.create({
  emptyListContent: { flexGrow: 1 },
  list: { flex: 1 },
})
