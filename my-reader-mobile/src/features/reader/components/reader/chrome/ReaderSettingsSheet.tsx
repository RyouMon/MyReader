import { BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { forwardRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Dimensions, View as RNView, StyleSheet } from "react-native";

import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette";
import type { ReaderTheme } from "@/src/store/app-store.types";
import { Text, View } from "@/tw";
import {
  BrightnessControl,
  FontPicker,
  SliderControl,
  ThemeSwatches,
} from "./SettingControls";

export type ReaderSettingsSheetProps = {
  palette: ReaderChromePalette;
  onDismiss: () => void;
  theme: ReaderTheme;
  onThemeChange: (key: string) => void;
  font: string;
  onFontChange: (key: string) => void;
  fontSize: number;
  onFontSizeChange: (v: number) => void;
  fontSizeMin: number;
  fontSizeMax: number;
  lineHeight: number;
  onLineHeightChange: (v: number) => void;
  lineHeightMin: number;
  lineHeightMax: number;
  margin: number;
  onMarginChange: (v: number) => void;
  marginMin: number;
  marginMax: number;
  brightness: number;
  onBrightnessChange: (v: number) => void;
};

const ReaderSettingsSheet = forwardRef<BottomSheetModal, ReaderSettingsSheetProps>(
  function ReaderSettingsSheet(
    {
      palette,
      onDismiss,
      theme,
      onThemeChange,
      font,
      onFontChange,
      fontSize,
      onFontSizeChange,
      fontSizeMin,
      fontSizeMax,
      lineHeight,
      onLineHeightChange,
      lineHeightMin,
      lineHeightMax,
      margin,
      onMarginChange,
      marginMin,
      marginMax,
      brightness,
      onBrightnessChange,
    },
    ref,
  ) {
    const { t } = useTranslation();

    const renderHandle = useCallback(
      () => (
        <RNView style={styles.handleContainer}>
          <RNView style={[styles.handle, { backgroundColor: palette.handle }]} />
        </RNView>
      ),
      [palette.handle],
    );

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={["50%"]}
        maxDynamicContentSize={Dimensions.get("window").height * 0.5}
        enablePanDownToClose
        backgroundStyle={[styles.background, { backgroundColor: palette.sheetSurface }]}
        handleComponent={renderHandle}
        onDismiss={onDismiss}
      >
        <RNView style={styles.header}>
          <Text className="text-lg font-bold px-5 pt-3.5 pb-2.5" style={{ color: palette.text }}>
            {t("reader.settings")}
          </Text>
        </RNView>
        <BottomSheetScrollView showsVerticalScrollIndicator={false}>
          <View className="px-5 pb-8">
          <ThemeSwatches value={theme} onChange={onThemeChange} palette={palette} />
          <FontPicker value={font} onChange={onFontChange} palette={palette} />
          <SliderControl
            label={t("reader.fontSize")}
            value={fontSize}
            onChange={onFontSizeChange}
            min={fontSizeMin}
            max={fontSizeMax}
            step={1}
            formatValue={(v) => `${v}px`}
            palette={palette}
          />
          <SliderControl
            label={t("reader.lineHeight")}
            value={lineHeight}
            onChange={onLineHeightChange}
            min={lineHeightMin}
            max={lineHeightMax}
            step={0.1}
            formatValue={(v) => v.toFixed(2)}
            palette={palette}
          />
          <SliderControl
            label={t("reader.margin")}
            value={margin}
            onChange={onMarginChange}
            min={marginMin}
            max={marginMax}
            step={4}
            formatValue={(v) => `${v}px`}
            palette={palette}
          />
          <BrightnessControl
            value={brightness}
            onChange={onBrightnessChange}
            palette={palette}
          />
        </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

export default ReaderSettingsSheet;

const styles = StyleSheet.create({
  background: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
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
});