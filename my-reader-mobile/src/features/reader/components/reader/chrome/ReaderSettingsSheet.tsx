import { BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { forwardRef, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { Dimensions, Platform, View as RNView, StyleSheet } from "react-native"

import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import type {
  ColumnCount,
  FixedBackground,
  FixedNavigationMode,
  FontFamilyKey,
  ReaderTheme,
  ReadingProgression,
  Spread,
  TextAlignment,
} from "@/src/store/app-store.types"
import { Text, View } from "@/tw"
import {
  FontPicker,
  SegmentPicker,
  SliderControl,
  ThemeSwatches,
} from "./SettingControls"
import {
  READER_SHEET_ELEVATION,
  READER_SHEET_RADIUS,
  READER_SHEET_SHADOW_COLOR,
  READER_SHEET_SHADOW_OFFSET_X,
  READER_SHEET_SHADOW_OFFSET_Y,
  READER_SHEET_SHADOW_OPACITY,
  READER_SHEET_SHADOW_RADIUS,
} from "./readerChromeConstants"

const ALIGNMENT_OPTIONS = [
  { key: "auto", labelKey: "reader.alignmentAuto" },
  { key: "justify", labelKey: "reader.alignmentJustify" },
  { key: "start", labelKey: "reader.alignmentStart" },
] as const satisfies { key: TextAlignment; labelKey: string }[]

const COLUMN_OPTIONS = [
  { key: "auto", labelKey: "reader.columnAuto" },
  { key: "1", labelKey: "reader.column1" },
] as const satisfies { key: ColumnCount; labelKey: string }[]

const BACKGROUND_OPTIONS = [
  { key: "auto", labelKey: "reader.backgroundAuto" },
  { key: "black", labelKey: "reader.backgroundBlack" },
  { key: "white", labelKey: "reader.backgroundWhite" },
] as const satisfies { key: FixedBackground; labelKey: string }[]

const NAVIGATION_OPTIONS = [
  { key: "horizontal", labelKey: "reader.navHorizontal" },
  { key: "vertical", labelKey: "reader.navVertical" },
] as const satisfies { key: FixedNavigationMode; labelKey: string }[]

const PROGRESSION_OPTIONS = [
  { key: "ltr", labelKey: "reader.directionLtr" },
  { key: "rtl", labelKey: "reader.directionRtl" },
] as const satisfies { key: ReadingProgression; labelKey: string }[]

const SPREAD_OPTIONS = [
  { key: "auto", labelKey: "reader.spreadAuto" },
  { key: "never", labelKey: "reader.spreadSingle" },
] as const satisfies { key: Spread; labelKey: string }[]

export type ReflowSettingsBundle = {
  theme: ReaderTheme
  onThemeChange: (key: ReaderTheme) => void
  fontFamily: FontFamilyKey
  onFontFamilyChange: (v: FontFamilyKey) => void
  fontSize: number
  onFontSizeChange: (v: number) => void
  fontSizeMin: number
  fontSizeMax: number
  lineHeight: number
  onLineHeightChange: (v: number) => void
  lineHeightMin: number
  lineHeightMax: number
  margin: number
  onMarginChange: (v: number) => void
  marginMin: number
  marginMax: number
  textAlign: TextAlignment
  onTextAlignChange: (v: TextAlignment) => void
  columnCount: ColumnCount
  onColumnCountChange: (v: ColumnCount) => void
}

export type FixedSettingsBundle = {
  background: FixedBackground
  onBackgroundChange: (v: FixedBackground) => void
  navigationMode: FixedNavigationMode
  onNavigationModeChange: (v: FixedNavigationMode) => void
  /**
   * Readium's FXL EPUB navigator (used for CBZ) paginates horizontally and
   * ignores the `scroll` preference, so 上下翻页 has no effect on CBZ. Hide the
   * page-direction picker for formats that can't honor it. Defaults to true.
   */
  showPageDirection?: boolean
  readingProgression: ReadingProgression
  onReadingProgressionChange: (v: ReadingProgression) => void
  spread: Spread
  onSpreadChange: (v: Spread) => void
}

export type ReaderSettingsSheetProps = {
  palette: ReaderChromePalette
  onDismiss: () => void
  layout: "reflowable" | "fixed"
  reflow?: ReflowSettingsBundle
  fixed?: FixedSettingsBundle
}

function ReflowGroup({
  bundle,
  palette,
}: {
  bundle: ReflowSettingsBundle
  palette: ReaderChromePalette
}) {
  const { t } = useTranslation()
  return (
    <>
      <ThemeSwatches
        value={bundle.theme}
        onChange={(key) => bundle.onThemeChange(key as ReaderTheme)}
        palette={palette}
      />
      <FontPicker
        value={bundle.fontFamily}
        onChange={(key) => bundle.onFontFamilyChange(key as FontFamilyKey)}
        palette={palette}
      />
      <SliderControl
        label={t("reader.fontSize")}
        value={bundle.fontSize}
        onChange={bundle.onFontSizeChange}
        min={bundle.fontSizeMin}
        max={bundle.fontSizeMax}
        step={1}
        formatValue={(v) => `${v}px`}
        palette={palette}
      />
      <SliderControl
        label={t("reader.lineHeight")}
        value={bundle.lineHeight}
        onChange={bundle.onLineHeightChange}
        min={bundle.lineHeightMin}
        max={bundle.lineHeightMax}
        step={0.1}
        formatValue={(v) => v.toFixed(2)}
        palette={palette}
      />
      <SliderControl
        label={t("reader.margin")}
        value={bundle.margin}
        onChange={bundle.onMarginChange}
        min={bundle.marginMin}
        max={bundle.marginMax}
        step={4}
        formatValue={(v) => `${v}px`}
        palette={palette}
      />
      <SegmentPicker
        label={t("reader.alignment")}
        options={ALIGNMENT_OPTIONS.map((o) => ({
          key: o.key,
          label: t(o.labelKey),
        }))}
        value={bundle.textAlign}
        onChange={bundle.onTextAlignChange}
        palette={palette}
      />
      <SegmentPicker
        label={t("reader.column")}
        options={COLUMN_OPTIONS.map((o) => ({
          key: o.key,
          label: t(o.labelKey),
        }))}
        value={bundle.columnCount}
        onChange={bundle.onColumnCountChange}
        palette={palette}
      />
    </>
  )
}

function FixedGroup({
  bundle,
  palette,
}: {
  bundle: FixedSettingsBundle
  palette: ReaderChromePalette
}) {
  const { t } = useTranslation()
  return (
    <>
      <SegmentPicker
        label={t("reader.background")}
        options={BACKGROUND_OPTIONS.map((o) => ({
          key: o.key,
          label: t(o.labelKey),
        }))}
        value={bundle.background}
        onChange={bundle.onBackgroundChange}
        palette={palette}
      />
      {bundle.showPageDirection !== false ? (
        <SegmentPicker
          label={t("reader.pageDirection")}
          options={NAVIGATION_OPTIONS.map((o) => ({
            key: o.key,
            label: t(o.labelKey),
          }))}
          value={bundle.navigationMode}
          onChange={bundle.onNavigationModeChange}
          palette={palette}
        />
      ) : null}
      <SegmentPicker
        label={t("reader.readingProgression")}
        options={PROGRESSION_OPTIONS.map((o) => ({
          key: o.key,
          label: t(o.labelKey),
        }))}
        value={bundle.readingProgression}
        onChange={bundle.onReadingProgressionChange}
        palette={palette}
      />
      {Platform.OS === "ios" ? (
        <SegmentPicker
          label={t("reader.spread")}
          options={SPREAD_OPTIONS.map((o) => ({
            key: o.key,
            label: t(o.labelKey),
          }))}
          value={bundle.spread}
          onChange={bundle.onSpreadChange}
          palette={palette}
        />
      ) : null}
    </>
  )
}

const ReaderSettingsSheet = forwardRef<
  BottomSheetModal,
  ReaderSettingsSheetProps
>(function ReaderSettingsSheet(
  { palette, onDismiss, layout, reflow, fixed },
  ref,
) {
  const { t } = useTranslation()

  const renderHandle = useCallback(
    () => (
      <RNView style={styles.handleContainer}>
        <RNView style={[styles.handle, { backgroundColor: palette.handle }]} />
      </RNView>
    ),
    [palette.handle],
  )

  return (
    <BottomSheetModal
      ref={ref}
      accessible={false}
      snapPoints={["60%"]}
      maxDynamicContentSize={Dimensions.get("window").height * 0.6}
      enablePanDownToClose
      style={styles.sheetShadow}
      backgroundStyle={[
        styles.background,
        { backgroundColor: palette.sheetSurface },
      ]}
      handleComponent={renderHandle}
      onDismiss={onDismiss}
    >
      <RNView style={styles.header}>
        <Text
          className="text-lg font-bold px-5 pt-3.5 pb-2.5"
          style={{ color: palette.text }}
          accessibilityLabel={t("reader.settingsSheet")}
        >
          {t("reader.settings")}
        </Text>
      </RNView>
      <BottomSheetScrollView showsVerticalScrollIndicator={false}>
        <View className="px-5 pb-8">
          {layout === "reflowable" && reflow ? (
            <ReflowGroup bundle={reflow} palette={palette} />
          ) : null}
          {layout === "fixed" && fixed ? (
            <FixedGroup bundle={fixed} palette={palette} />
          ) : null}
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
})

export default ReaderSettingsSheet

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
    paddingBottom: 4,
  },
})
