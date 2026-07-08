import { BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { forwardRef, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { View as RNView, StyleSheet } from "react-native"

import {
  underlayFromSurface,
  type ReaderChromePalette,
} from "@/src/design/reader-chrome-palette"
import type { ReaderTocItem } from "@/src/features/reader/components/reader/types"
import { Text, TouchableHighlight } from "@/tw"
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

function stripFragment(href: string): string {
  const i = href.indexOf("#")
  return i >= 0 ? href.slice(0, i) : href
}

function hrefRoughlyMatches(a: string, b: string): boolean {
  if (!a || !b) return false
  const na = stripFragment(a)
  const nb = stripFragment(b)
  return na === nb || na.endsWith(nb) || nb.endsWith(na)
}

export type ReaderTocSheetProps = {
  toc: ReaderTocItem[]
  currentHref: string | null
  palette: ReaderChromePalette
  onSelectPage: (pageIndex: number) => void
  onDismiss: () => void
}

const ReaderTocSheet = forwardRef<BottomSheetModal, ReaderTocSheetProps>(
  function ReaderTocSheet(
    { toc, currentHref, palette, onSelectPage, onDismiss },
    ref,
  ) {
    const { t } = useTranslation()

    const renderHandle = useCallback(
      () => (
        <RNView style={styles.handleContainer}>
          <RNView
            style={[styles.handle, { backgroundColor: palette.handle }]}
          />
        </RNView>
      ),
      [palette.handle],
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
        onDismiss={onDismiss}
        accessibilityLabel={t("reader.tocSheet")}
      >
        <RNView style={styles.header}>
          <Text
            className="text-lg font-bold px-5 pt-3.5 pb-2.5"
            style={{ color: palette.text }}
          >
            {t("reader.toc")}
          </Text>
        </RNView>
        <BottomSheetScrollView showsVerticalScrollIndicator={false}>
          {toc.map((item) => {
            const isActive =
              currentHref !== null &&
              item.href !== undefined &&
              hrefRoughlyMatches(currentHref, item.href)
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
                className="mx-3 mb-0.5 rounded-xl px-5 py-[14px]"
                style={{
                  backgroundColor: isActive
                    ? palette.tocRowActive
                    : palette.tocRowIdle,
                  paddingLeft: 20 + depth * 18,
                }}
                onPress={() => onSelectPage(item.pageIndex)}
              >
                <Text
                  className="text-base flex-1"
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
          })}
        </BottomSheetScrollView>
      </BottomSheetModal>
    )
  },
)

export default ReaderTocSheet

const styles = StyleSheet.create({
  background: {
    borderTopLeftRadius: READER_SHEET_RADIUS,
    borderTopRightRadius: READER_SHEET_RADIUS,
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
  header: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 4,
  },
})
