import { readerChromePalette, type ReaderChromePalette } from "@/src/design/reader-chrome-palette";
import { READER_CHROME, READER_FIXED, READER_THEMES } from "@/src/design/reader-tokens";
import type { ReaderState, ReaderTocItem } from "@/src/features/reader/components/reader/types";
import { BottomSheetModal, BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { router, useLocalSearchParams } from "expo-router";
import { lazy, memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StatusBar, StyleSheet } from "react-native";
import { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { useTheme } from "@/src/design/tokens";
import {
  ReaderActionsExpanded,
  ReaderChapterLabel,
  ReaderCloseButton,
  ReaderMoreButton,
} from "@/src/features/reader/components/reader/chrome";
import { chromeReducer, ChromeState } from "@/src/features/reader/components/reader/chrome/chrome-state";
import { READER_THEME_OPTIONS } from "@/src/features/reader/components/reader/chrome/readerChromeConstants";
import ReaderSettingsSheet from "@/src/features/reader/components/reader/chrome/ReaderSettingsSheet";
import ReaderTocSheet from "@/src/features/reader/components/reader/chrome/ReaderTocSheet";
import { useBookLoader } from "@/src/hooks/use-book-loader";
import { useReaderProgressSaver } from "@/src/hooks/use-reader-progress-saver";
import { useAppStore } from "@/src/store/app-store";
import type { ReaderTheme } from "@/src/store/app-store.types";
import { toNativeFilesystemPath } from "@/src/services/fs/path";
import { Animated, Pressable, Text, View } from "@/tw";

const FixedReaderSurface = lazy(async () => import("@/src/features/reader/components/reader/fixed/FixedReaderSurface"));
const ReadiumReflowReader = lazy(async () => import("@/src/features/reader/components/reader/reflow/ReadiumReflowReader"));


const TOC_GOTO_RESET_DELAY_MS = 100;
const READER_SCREEN_BACKGROUND_COLOR = READER_FIXED.canvasBg;
const LOADING_INDICATOR_COLOR = READER_CHROME.loadingIndicator;
const ERROR_BACK_BUTTON_BORDER_COLOR = READER_CHROME.border;

export default function ReaderScreen() {
  const { t } = useTranslation();
  const { id, format: formatParam } = useLocalSearchParams<{
    id?: string;
    format?: string;
  }>();
  const { palette, colorScheme } = useTheme();
  const insets = useSafeAreaInsets();
  const [readerState, setReaderState] = useState<ReaderState | null>(null);
  const [toc, setToc] = useState<ReaderTocItem[]>([]);
  const [chromeState, dispatch] = useReducer(chromeReducer, ChromeState.Reading);
  const [gotoPageCmd, setGotoPageCmd] = useState<number | undefined>(undefined);
  const settings = useAppStore((s) => s.settings);
  const patchReflowableReaderSettings = useAppStore((s) => s.patchReflowableReaderSettings);
  const patchFixedReaderSettings = useAppStore((s) => s.patchFixedReaderSettings);

  const tocSheetRef = useRef<BottomSheetModal>(null);
  const settingsSheetRef = useRef<BottomSheetModal>(null);

  const activeLibraryId = useAppStore((s) => s.activeLibraryId);
  const { loadState, bookTitle } = useBookLoader(
    id,
    formatParam,
    activeLibraryId,
    settings.cache.maxCacheSizeMB,
  );
  useReaderProgressSaver(activeLibraryId, loadState, readerState);

  const handleStateChange = useCallback(async (state: ReaderState) => {
    setReaderState(state);
  }, []);

  const handleTocReady = useCallback(async (items: ReaderTocItem[]) => {
    setToc(items);
  }, []);

  const handleRequestClose = useCallback(async () => {
    if (router.canGoBack()) {
      router.back();
    }
  }, []);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    }
  }, []);

  const toggleChrome = useCallback(() => {
    dispatch({ type: "contentTap" });
  }, []);

  const handleContentTap = useCallback(() => {
    if (chromeState === ChromeState.TocSheet || chromeState === ChromeState.SettingsSheet) {
      if (chromeState === ChromeState.TocSheet) tocSheetRef.current?.dismiss();
      if (chromeState === ChromeState.SettingsSheet) settingsSheetRef.current?.dismiss();
      return;
    }
    dispatch({ type: "contentTap" });
  }, [chromeState]);

  const handleTocSelect = useCallback((pageIndex: number) => {
    setGotoPageCmd(pageIndex);
    tocSheetRef.current?.dismiss();
    dispatch({ type: "tocSelect" });
    setTimeout(() => setGotoPageCmd(undefined), TOC_GOTO_RESET_DELAY_MS);
  }, []);

  const handleTocDismiss = useCallback(() => {
    dispatch({ type: "tocDismiss" });
  }, []);

  const handleSettingsDismiss = useCallback(() => {
    dispatch({ type: "settingsDismiss" });
  }, []);

  useEffect(() => {
    if (chromeState === ChromeState.TocSheet) {
      // Use setTimeout to avoid calling present during state transition
      requestAnimationFrame(() => tocSheetRef.current?.present());
    }
  }, [chromeState]);

  useEffect(() => {
    if (chromeState === ChromeState.SettingsSheet) {
      requestAnimationFrame(() => settingsSheetRef.current?.present());
    }
  }, [chromeState]);

  const domFallback = useMemo(
    () => (
      <DomReaderFallback
        format={loadState.status === "ready" ? loadState.format : null}
        title={loadState.status === "ready" ? loadState.title : null}
      />
    ),
    [loadState]
  );

  const readerLoadingOverlay = useMemo(
    () => (
      <Animated.View
        exiting={FadeOut.duration(300)}
        className="absolute inset-0 z-20 items-center justify-center"
        style={{ backgroundColor: READER_FIXED.canvasBg }}
      >
        <ActivityIndicator size="large" color={LOADING_INDICATOR_COLOR} />
        {loadState.status === "ready" ? (
          <Text className="mt-4 px-8 text-center text-sm" style={{ color: READER_CHROME.textSecondary }} numberOfLines={2}>
            {loadState.title}
          </Text>
        ) : null}
      </Animated.View>
    ),
    [loadState]
  );

  const progressPercent = readerState?.progress ?? 0;
  const reflowSettings = settings.reflowable;
  const fixedSettings = settings.fixed;
  void patchFixedReaderSettings;

  const activeTheme = (loadState.status === "ready" && loadState.layoutMode === "reflowable") ? reflowSettings.theme : fixedSettings.theme;
  const themeBgColor = (READER_THEMES[activeTheme] ?? READER_THEMES.neutral).bg;
  const themeBg = useSharedValue(themeBgColor);
  const themeOverlayOpacity = useSharedValue(0);
  const prevThemeBgRef = useRef(themeBgColor);
  useEffect(() => {
    if (prevThemeBgRef.current !== themeBgColor) {
      themeBg.value = prevThemeBgRef.current;
      themeOverlayOpacity.value = 1;
      themeOverlayOpacity.value = withTiming(0, { duration: 350 });
      themeBg.value = withTiming(themeBgColor, { duration: 350 });
      prevThemeBgRef.current = themeBgColor;
    }
  }, [themeBgColor]);
  const themeBgStyle = useAnimatedStyle(() => ({ backgroundColor: themeBg.value }));
  const themeOverlayStyle = useAnimatedStyle(() => ({
    backgroundColor: themeBg.value,
    opacity: themeOverlayOpacity.value,
  }));

  const chromePalette = useMemo<ReaderChromePalette>(() => {
    const option = READER_THEME_OPTIONS.find((o) => o.key === activeTheme) ?? READER_THEME_OPTIONS[0]!;
    return readerChromePalette(option.fg, option.swatch);
  }, [activeTheme]);

  if (loadState.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: READER_SCREEN_BACKGROUND_COLOR }}>
        <StatusBar hidden={false} barStyle="light-content" />
        <ActivityIndicator size="large" color={LOADING_INDICATOR_COLOR} />
        {bookTitle ? (
          <Text className="mt-4 px-8 text-center text-sm" style={{ color: READER_CHROME.textSecondary }} numberOfLines={2}>
            {bookTitle}
          </Text>
        ) : (
          <Text className="mt-4 text-sm" style={{ color: READER_CHROME.textMuted }}>{loadState.message}</Text>
        )}
      </View>
    );
  }

  if (loadState.status === "error") {
    return (
      <View className="flex-1 w-full items-center justify-center px-7" style={{ backgroundColor: palette.background }}>
        <StatusBar hidden={false} barStyle={colorScheme === "dark" ? "light-content" : "dark-content"} />
        <View
          className="w-full max-w-[400px] items-center py-7 px-[22px] rounded-[20px] border"
          style={{ backgroundColor: READER_CHROME.errorCardBg, borderColor: READER_CHROME.errorCardBorder }}
        >
          <Text className="text-center text-lg font-bold mb-3" style={{ color: READER_CHROME.textStrong }}>
            {t("reader.cannotOpen")}
          </Text>
          <Text className="text-center text-[15px] leading-[22px]" style={{ color: READER_CHROME.textSecondary }}>
            {loadState.message}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("reader.back")}
            className="mt-[22px] py-3 px-7 rounded-full border"
            style={{ backgroundColor: READER_CHROME.surfaceIdle, borderColor: ERROR_BACK_BUTTON_BORDER_COLOR }}
            onPress={handleBack}
          >
            <Text className="text-[15px] font-semibold" style={{ color: READER_CHROME.textStrong }}>
              {t("reader.back")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const isReflowSurface = loadState.layoutMode === "reflowable";
  const isFixedSurface = loadState.layoutMode === "fixedLayout";

  const isDarkTheme = activeTheme === "night" || activeTheme === "contrast2";
  const statusBarStyle = isDarkTheme ? "light-content" : "dark-content";

  return (
    <BottomSheetModalProvider>
      <Animated.View
        entering={FadeIn.duration(300)}
        className="flex-1"
        style={{ backgroundColor: READER_FIXED.canvasBg }}
      >
        <StatusBar
          hidden={chromeState === ChromeState.Reading}
          barStyle={statusBarStyle}
          translucent={false}
        />

        <ErrorBoundary title={t("reader.loadFailed")} message={t("reader.loadFailedMessage")} onRetry={handleBack}>
          <View className="absolute inset-0">
            {isReflowSurface ? (
              loadState.epubFileUri ? (
                <Animated.View style={[{ paddingTop: insets.top - 8, paddingBottom: insets.bottom, flex: 1 }, themeBgStyle]}>
                  <ReadiumReflowReader
                    epubPath={toNativeFilesystemPath(loadState.epubFileUri)}
                    initialLocator={loadState.initialLocator ?? undefined}
                    onStateChange={handleStateChange}
                    onTocReady={handleTocReady}
                    onRequestClose={handleRequestClose}
                    onToggleChrome={toggleChrome}
                    gotoTocIndex={gotoPageCmd}
                    theme={reflowSettings.theme}
                    fontSize={reflowSettings.fontSize}
                    lineHeight={reflowSettings.lineHeight}
                    paddingX={reflowSettings.paddingX}
                    brightness={reflowSettings.brightness}
                    textAlign={reflowSettings.textAlign}
                    columnCount={reflowSettings.columnCount}
                  />
                </Animated.View>
              ) : null
            ) : isFixedSurface ? (
              <FixedReaderSurface
                archiveUri={loadState.bookArchiveUri}
                pdfLocalUri={loadState.pdfLocalUri}
                format={loadState.format}
                initialPage={loadState.initialPage}
                initialLocator={loadState.initialLocator ?? undefined}
                onStateChange={handleStateChange}
                onTocReady={handleTocReady}
                onRequestClose={handleRequestClose}
                onToggleChrome={toggleChrome}
                gotoPageCommand={gotoPageCmd}
                fallback={domFallback}
                theme={fixedSettings.theme}
                brightness={fixedSettings.brightness}
              />
            ) : null}

            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, themeOverlayStyle]} />

            {loadState.status === "ready" && !readerState?.ready && readerLoadingOverlay}
          </View>
        </ErrorBoundary>

        {/* Touch blocker: prevent page turns while sheets are open (states 4/5) */}
        {(chromeState === ChromeState.TocSheet || chromeState === ChromeState.SettingsSheet) && (
          <Pressable
            className="absolute inset-0 z-10"
            onPress={handleContentTap}
          />
        )}

        {/* Visible in all states: chapter title (top-center) */}
        <ReaderChapterLabel
          insetsTop={insets.top}
          title={readerState?.chapterTitle}
          palette={chromePalette} />

        {/* State 2+: Close button (top-right circle) */}
        <ReaderCloseButton
          insetsTop={insets.top}
          visible={chromeState >= ChromeState.Chrome}
          palette={chromePalette}
          onPress={handleRequestClose} />

        {/* State 2/4/5: More button (bottom-right circle); hidden when expanded (3) */}
        <ReaderMoreButton
          visible={chromeState === ChromeState.Chrome || chromeState === ChromeState.TocSheet || chromeState === ChromeState.SettingsSheet}
          palette={chromePalette}
          onPress={() => dispatch({ type: "moreButtonTap" })} />

        {/* State 3: Expanded action pills (TOC + Settings) */}
        <ReaderActionsExpanded
          insetsBottom={insets.bottom}
          visible={chromeState === ChromeState.Expanded}
          progressPercent={progressPercent}
          palette={chromePalette}
          onOpenToc={() => dispatch({ type: "tocPillTap" })}
          onOpenSettings={() => dispatch({ type: "settingsPillTap" })}
        />

        {/* State 4: TOC bottom sheet */}
        <ReaderTocSheet
          ref={tocSheetRef}
          toc={toc}
          currentHref={readerState?.locator?.href ?? null}
          palette={chromePalette}
          onSelectPage={handleTocSelect}
          onDismiss={handleTocDismiss}
        />

        {/* State 5: Settings bottom sheet */}
        <ReaderSettingsSheet
          ref={settingsSheetRef}
          palette={chromePalette}
          onDismiss={handleSettingsDismiss}
          theme={isReflowSurface ? reflowSettings.theme : fixedSettings.theme}
          onThemeChange={(key) => {
            if (isReflowSurface) patchReflowableReaderSettings({ theme: key as ReaderTheme });
            else patchFixedReaderSettings({ theme: key as ReaderTheme });
          }}
          font="serif"
          onFontChange={() => { }}
          fontSize={reflowSettings.fontSize}
          onFontSizeChange={(v) => patchReflowableReaderSettings({ fontSize: v })}
          fontSizeMin={14}
          fontSizeMax={28}
          lineHeight={reflowSettings.lineHeight}
          onLineHeightChange={(v) => patchReflowableReaderSettings({ lineHeight: v })}
          lineHeightMin={1.4}
          lineHeightMax={2.4}
          margin={reflowSettings.paddingX}
          onMarginChange={(v) => patchReflowableReaderSettings({ paddingX: v })}
          marginMin={12}
          marginMax={36}
          textAlign={reflowSettings.textAlign}
          onTextAlignChange={(v) => patchReflowableReaderSettings({ textAlign: v })}
          columnCount={reflowSettings.columnCount}
          onColumnCountChange={(v) => patchReflowableReaderSettings({ columnCount: v })}
        />
      </Animated.View>
    </BottomSheetModalProvider>
  );
}

const DomReaderFallback = memo(function DomReaderFallback({
  format,
  title,
}: {
  format: string | null;
  title: string | null;
}) {
  const { t } = useTranslation();

  return (
    <View
      className="flex-1 items-center justify-center px-6"
      style={{ backgroundColor: READER_SCREEN_BACKGROUND_COLOR }}
    >
      <ActivityIndicator size="large" color={LOADING_INDICATOR_COLOR} />
      <Text className="mt-4 text-sm" style={{ color: READER_CHROME.textSecondary }}>
        {t("reader.mountingReader")}
      </Text>
      <Text className="mt-2 text-center text-xs" style={{ color: READER_CHROME.textMuted }}>
        {format ? `format=${format}` : "format=unknown"}
        {title ? ` · ${title}` : ""}
      </Text>
    </View>
  );
});