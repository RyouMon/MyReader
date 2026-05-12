import { READER_CHROME, READER_FIXED } from "@/src/design/reader-tokens";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { ReaderState, ReaderTocItem } from "@/src/components/reader/types";
import { lazy, memo, useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StatusBar } from "react-native";
import { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ReaderBottomBar,
  ReaderSettingsSheet,
  ReaderTocSheet,
  ReaderTopBar,
} from "@/src/components/reader/chrome";
import { useThemePalette } from "@/src/design/tokens";
import { getFallbackCoverColor } from "@/src/components/books/book-cover";
import { useAppStore } from "@/src/store/app-store";
import type { ReadingLayout } from "@/src/store/app-store.types";
import { toNativeFilesystemPath } from "@/src/utils/io";
import { Animated, Image, Pressable, Text, View } from "@/tw";
import { useBookLoader } from "@/src/hooks/use-book-loader";
import { useReaderProgressSaver } from "@/src/hooks/use-reader-progress-saver";
import { ErrorBoundary } from "@/src/components/error-boundary";

/** 按格式懒加载固定版式阅读器，避免为 EPUB 等非固定格式加载 CBZ/PDF 相关依赖。 */
const FixedReaderSurface = lazy(async () => import("@/src/components/reader/fixed/FixedReaderSurface"));
const ReadiumReflowReader = lazy(async () => import("@/src/components/reader/reflow/ReadiumReflowReader"));

/** 目录日志预览条目数，避免一次性输出过多日志。 */
const TOC_LOG_PREVIEW_COUNT = 5;
/** TOC 跳转命令复位延迟，确保命令被消费后再清空。 */
const TOC_GOTO_RESET_DELAY_MS = 100;
/** 遮罩层入场动画时长（毫秒）。 */
const OVERLAY_FADE_IN_DURATION_MS = 200;
/** 遮罩层退场动画时长（毫秒）。 */
const OVERLAY_FADE_OUT_DURATION_MS = 200;
/** 分页模式顶部额外留白（在安全区基础上叠加）。 */
const PAGINATE_CONTENT_INSET_TOP = 32;
/** 分页模式底部额外留白（在安全区基础上叠加）。 */
const PAGINATE_CONTENT_INSET_BOTTOM = 32;
/** 阅读器页面背景色。 */
const READER_SCREEN_BACKGROUND_COLOR = READER_FIXED.canvasBg;
/** 加载指示器颜色。 */
const LOADING_INDICATOR_COLOR = READER_CHROME.loadingIndicator;
/** 错误返回按钮边框颜色。 */
const ERROR_BACK_BUTTON_BORDER_COLOR = READER_CHROME.border;

export default function ReaderScreen() {
  const { id, format: formatParam } = useLocalSearchParams<{
    id?: string;
    format?: string;
  }>();
  const palette = useThemePalette();
  const insets = useSafeAreaInsets();
  const [readerState, setReaderState] = useState<ReaderState | null>(null);
  const [toc, setToc] = useState<ReaderTocItem[]>([]);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bookmarkActive, setBookmarkActive] = useState(false);
  const [gotoPageCmd, setGotoPageCmd] = useState<number | undefined>(undefined);
  const settings = useAppStore((s) => s.settings);
  const patchReflowableReaderSettings = useAppStore((s) => s.patchReflowableReaderSettings);
  const patchFixedReaderSettings = useAppStore((s) => s.patchFixedReaderSettings);

  const activeLibraryId = useAppStore((s) => s.activeLibraryId);
  const { loadState, coverUri, bookTitle } = useBookLoader(
    id,
    formatParam,
    activeLibraryId,
    settings.cache.maxCacheSizeMB,
  );
  useReaderProgressSaver(activeLibraryId, loadState, readerState);

  const handleStateChange = useCallback(async (state: ReaderState) => {
    console.info("[mobile-reader] state-change", state);
    setReaderState(state);
  }, []);

  const handleTocReady = useCallback(async (items: ReaderTocItem[]) => {
    console.info("[mobile-reader] toc-ready", {
      count: items.length,
      firstItems: items.slice(0, TOC_LOG_PREVIEW_COUNT),
    });
    setToc(items);
  }, []);

  const handleRequestClose = useCallback(async () => {
    if (router.canGoBack()) {
      router.back();
    }
  }, []);

  const handleBack = useCallback(() => {
    if (tocOpen) {
      setTocOpen(false);
      return;
    }
    if (router.canGoBack()) {
      router.back();
    }
  }, [tocOpen]);

  const toggleChrome = useCallback(() => {
    if (tocOpen) {
      setTocOpen(false);
      return;
    }
    setChromeVisible((v) => !v);
  }, [tocOpen]);

  const handleTocSelect = useCallback((pageIndex: number) => {
    console.info("[mobile-reader] toc-select", { pageIndex });
    setGotoPageCmd(pageIndex);
    setTocOpen(false);
    setTimeout(() => setGotoPageCmd(undefined), TOC_GOTO_RESET_DELAY_MS);
  }, []);

  const handleDismissOverlay = useCallback(() => {
    setTocOpen(false);
    setSettingsOpen(false);
  }, []);

  const domFallback = useMemo(
    () => (
      <DomReaderFallback
        format={loadState.status === "ready" ? loadState.format : null}
        title={loadState.status === "ready" ? loadState.title : null}
        coverUri={coverUri}
      />
    ),
    [loadState, coverUri]
  );

  const readerLoadingOverlay = useMemo(
    () => (
      <Animated.View
        exiting={FadeOut.duration(300)}
        className="absolute inset-0 z-20 items-center justify-center bg-[#111111]"
      >
        {coverUri ? (
          <>
            <Image
              source={coverUri}
              className="absolute inset-0 h-full w-full"
              contentFit="cover"
            />
            <View className="absolute inset-0 bg-black/55" />
          </>
        ) : null}
        <ActivityIndicator size="large" color={LOADING_INDICATOR_COLOR} />
        {loadState.status === "ready" ? (
          <Text className="mt-4 px-8 text-center text-sm text-white/70" numberOfLines={2}>
            {loadState.title}
          </Text>
        ) : null}
      </Animated.View>
    ),
    [coverUri, loadState]
  );

  const progressPercent = readerState?.progress ?? 0;
  const pageLabel = readerState
    ? `${readerState.currentPage + 1} / ${readerState.totalPages}`
    : "";
  const reflowSettings = settings.reflowable;
  const fixedSettings = settings.fixed;

  if (loadState.status === "loading") {
    const bgColor = coverUri
      ? READER_SCREEN_BACKGROUND_COLOR
      : bookTitle
        ? getFallbackCoverColor(bookTitle)
        : READER_SCREEN_BACKGROUND_COLOR;
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: bgColor }}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar hidden={false} barStyle="light-content" />

        {coverUri ? (
          <>
            <Image
              source={coverUri}
              className="absolute inset-0 h-full w-full"
              contentFit="cover"
            />
            <View className="absolute inset-0 bg-black/55" />
          </>
        ) : null}

        <ActivityIndicator size="large" color={LOADING_INDICATOR_COLOR} />
        {bookTitle ? (
          <Text className="mt-4 px-8 text-center text-sm text-white/70" numberOfLines={2}>
            {bookTitle}
          </Text>
        ) : (
          <Text className="mt-4 text-sm text-white/60">{loadState.message}</Text>
        )}
      </View>
    );
  }

  if (loadState.status === "error") {
    return (
      <View className="flex-1 w-full items-center justify-center px-7" style={{ backgroundColor: palette.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar hidden={false} barStyle="light-content" />
        <View className="w-full max-w-[400px] items-center py-7 px-[22px] rounded-[20px] bg-white/8 border border-white/8">
          <Text className="text-center text-lg font-bold text-[rgba(244,238,230,0.96)] mb-3">无法打开书籍</Text>
          <Text className="text-center text-[15px] text-[rgba(244,238,230,0.78)] leading-[22px]">{loadState.message}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回"
            className="mt-[22px] py-3 px-7 rounded-full bg-white/6 border"
            style={{ borderColor: ERROR_BACK_BUTTON_BORDER_COLOR }}
            onPress={handleBack}
          >
            <Text className="text-[15px] font-semibold text-[rgba(244,238,230,0.96)]">返回</Text>
          </Pressable>
        </View>
      </View>
    );
  }


  const title = loadState.title;
  const fmtUpper = loadState.format.toUpperCase();
  const isReflowSurface = loadState.layoutMode === "reflowable";
  const isFixedSurface = loadState.layoutMode === "fixedLayout";
  const activeReadingLayout: ReadingLayout = isReflowSurface
    ? reflowSettings.readingLayout
    : fixedSettings.readingLayout;
  const paginateContentInsetBottom = insets.bottom + PAGINATE_CONTENT_INSET_BOTTOM;
  const paginateContentInsetTop = insets.top + PAGINATE_CONTENT_INSET_TOP;

  if (__DEV__) {
    console.info("[mobile-reader] render:ready-screen", {
      title,
      format: fmtUpper,
      layoutMode: loadState.layoutMode,
      isFixedSurface,
      isReflowSurface,
      readerReady: readerState?.ready ?? false,
      currentPage: readerState?.currentPage ?? null,
      totalPages: readerState?.totalPages ?? null,
      tocCount: toc.length,
      chromeVisible,
      tocOpen,
    });
  }

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="flex-1 bg-[#111111]"
    >
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar
        hidden={!chromeVisible && !tocOpen && !settingsOpen}
        barStyle="dark-content"
        translucent={false}
      />

      <ErrorBoundary title="阅读器加载失败" message="阅读器遇到了意外错误，请返回重试。" onRetry={handleBack}>
        <View className="absolute inset-0">
          {isReflowSurface ? (
            loadState.epubFileUri ? (
              <ReadiumReflowReader
                epubPath={toNativeFilesystemPath(loadState.epubFileUri)}
                initialLocator={loadState.initialLocator ?? undefined}
                onStateChange={handleStateChange}
                onTocReady={handleTocReady}
                onRequestClose={handleRequestClose}
                onToggleChrome={toggleChrome}
                gotoTocIndex={gotoPageCmd}
                readingLayout={reflowSettings.readingLayout}
                theme={reflowSettings.theme}
                fontSize={reflowSettings.fontSize}
                lineHeight={reflowSettings.lineHeight}
                paddingX={reflowSettings.paddingX}
                brightness={reflowSettings.brightness}
              />
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
              readingLayout={fixedSettings.readingLayout}
              navigationMode={fixedSettings.navigationMode}
              theme={fixedSettings.theme}
              brightness={fixedSettings.brightness}
              zoomScale={fixedSettings.zoomScale}
              onZoomScaleChange={(scale) => patchFixedReaderSettings({ zoomScale: scale })}
              contentInsetTop={fixedSettings.readingLayout === "paginate" ? paginateContentInsetTop : 0}
              contentInsetBottom={fixedSettings.readingLayout === "paginate" ? paginateContentInsetBottom : 0}
            />
          ) : null}

          {loadState.status === "ready" && !readerState?.ready && readerLoadingOverlay}
        </View>
      </ErrorBoundary>

      {chromeVisible && (
        <>
          <ReaderTopBar
            insetsTop={insets.top}
            title={title}
            chapterTitle={readerState?.chapterTitle}
            bookmarkActive={bookmarkActive}
            onBack={handleBack}
            onToggleBookmark={() => setBookmarkActive((value) => !value)}
          />

          <ReaderBottomBar
            insetsBottom={insets.bottom}
            pageLabel={pageLabel}
            progressPercent={progressPercent}
            progressColor={palette.primary}
            onOpenToc={() => setTocOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </>
      )}

      {(tocOpen || settingsOpen) && (
        <Animated.View
          entering={FadeIn.duration(OVERLAY_FADE_IN_DURATION_MS)}
          exiting={FadeOut.duration(OVERLAY_FADE_OUT_DURATION_MS)}
          className="absolute inset-0 z-30 bg-black/45"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭弹层"
            className="absolute inset-0"
            onPress={handleDismissOverlay}
          />
        </Animated.View>
      )}

      {tocOpen && (
        <ReaderTocSheet
          insetsBottom={insets.bottom}
          toc={toc}
          currentPage={readerState?.currentPage ?? null}
          activeColor={palette.primary}
          onSelectPage={handleTocSelect}
        />
      )}

      {settingsOpen && (
        <ReaderSettingsSheet
          insetsBottom={insets.bottom}
          isReflowSurface={isReflowSurface}
          isFixedSurface={isFixedSurface}
          activeReadingLayout={activeReadingLayout}
          reflowSettings={reflowSettings}
          fixedSettings={fixedSettings}
          onPatchReflowableReaderSettings={patchReflowableReaderSettings}
          onPatchFixedReaderSettings={patchFixedReaderSettings}
        />
      )}
    </Animated.View>
  );
}

const DomReaderFallback = memo(function DomReaderFallback({
  format,
  title,
  coverUri,
}: {
  format: string | null;
  title: string | null;
  coverUri?: string;
}) {
  useEffect(() => {
    console.info("[mobile-reader] dom-fallback:mounted", {
      format,
      title,
    });
  }, [format, title]);

  const bgColor = coverUri
    ? READER_SCREEN_BACKGROUND_COLOR
    : title
      ? getFallbackCoverColor(title)
      : READER_SCREEN_BACKGROUND_COLOR;

  return (
    <View
      className="flex-1 items-center justify-center px-6"
      style={{ backgroundColor: bgColor }}
    >
      {coverUri ? (
        <>
          <Image
            source={coverUri}
            className="absolute inset-0 h-full w-full"
            contentFit="cover"
          />
          <View className="absolute inset-0 bg-black/55" />
        </>
      ) : null}
      <ActivityIndicator size="large" color={LOADING_INDICATOR_COLOR} />
      <Text className="mt-4 text-sm text-white/70">
        正在挂载阅读器…
      </Text>
      <Text className="mt-2 text-center text-xs text-[rgba(244,238,230,0.56)]">
        {format ? `format=${format}` : "format=unknown"}
        {title ? ` · ${title}` : ""}
      </Text>
    </View>
  );
});

