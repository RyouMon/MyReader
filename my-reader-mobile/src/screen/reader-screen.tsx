import { READER_CHROME, READER_FIXED } from "@/src/design/reader-tokens";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { ReaderState, ReaderTocItem } from "@/src/components/reader/types";
import { lazy, useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StatusBar, StyleSheet } from "react-native";
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
/** 错误卡片水平内边距。 */
const ERROR_SCREEN_HORIZONTAL_PADDING = 28;
/** 错误卡片最大宽度。 */
const ERROR_CARD_MAX_WIDTH = 400;
/** 错误卡片垂直内边距。 */
const ERROR_CARD_VERTICAL_PADDING = 28;
/** 错误卡片水平内边距。 */
const ERROR_CARD_HORIZONTAL_PADDING = 22;
/** 错误卡片圆角。 */
const ERROR_CARD_BORDER_RADIUS = 20;
/** 错误标题字号。 */
const ERROR_TITLE_FONT_SIZE = 18;
/** 错误标题底部间距。 */
const ERROR_TITLE_MARGIN_BOTTOM = 12;
/** 错误正文字号。 */
const ERROR_BODY_FONT_SIZE = 15;
/** 错误正文行高。 */
const ERROR_BODY_LINE_HEIGHT = 22;
/** 错误返回按钮顶部间距。 */
const ERROR_BACK_BUTTON_MARGIN_TOP = 22;
/** 错误返回按钮垂直内边距。 */
const ERROR_BACK_BUTTON_VERTICAL_PADDING = 12;
/** 错误返回按钮水平内边距。 */
const ERROR_BACK_BUTTON_HORIZONTAL_PADDING = 28;
/** 错误返回按钮圆角（胶囊形）。 */
const ERROR_BACK_BUTTON_BORDER_RADIUS = 999;
/** 错误返回按钮边框宽度。 */
const ERROR_BACK_BUTTON_BORDER_WIDTH = 1;
/** 错误返回按钮文字字号。 */
const ERROR_BACK_BUTTON_TEXT_SIZE = 15;
/** 阅读器页面背景色。 */
const READER_SCREEN_BACKGROUND_COLOR = READER_FIXED.canvasBg;
/** 加载指示器颜色。 */
const LOADING_INDICATOR_COLOR = READER_CHROME.loadingIndicator;
/** 弹层遮罩背景色。 */
const OVERLAY_MASK_BACKGROUND_COLOR = READER_CHROME.scrim;
/** 错误返回按钮边框颜色。 */
const ERROR_BACK_BUTTON_BORDER_COLOR = READER_CHROME.border;
/** 错误卡片背景色。 */
const ERROR_CARD_BACKGROUND_COLOR = READER_CHROME.errorCardBg;
/** 错误卡片边框颜色。 */
const ERROR_CARD_BORDER_COLOR = READER_CHROME.errorCardBorder;
/** 错误标题文字颜色。 */
const ERROR_TITLE_TEXT_COLOR = READER_CHROME.textStrong;
/** 错误正文文字颜色。 */
const ERROR_BODY_TEXT_COLOR = READER_CHROME.textSecondary;
/** 错误返回按钮背景色。 */
const ERROR_BACK_BUTTON_BACKGROUND_COLOR = READER_CHROME.surfaceIdle;
/** 错误返回按钮文字颜色。 */
const ERROR_BACK_BUTTON_TEXT_COLOR = READER_CHROME.textStrong;
/** DOM 回退态主文案颜色。 */
const DOM_FALLBACK_PRIMARY_TEXT_COLOR = READER_CHROME.loadingIndicator;
/** DOM 回退态次文案颜色。 */
const DOM_FALLBACK_SECONDARY_TEXT_COLOR = READER_CHROME.textMuted;

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
        className="absolute inset-0 z-20 items-center justify-center"
        style={{ backgroundColor: READER_SCREEN_BACKGROUND_COLOR }}
      >
        {coverUri ? (
          <>
            <Image
              source={coverUri}
              className="absolute inset-0 h-full w-full"
              contentFit="cover"
            />
            <View
              className="absolute inset-0"
              style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
            />
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
            <View className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.55)" }} />
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
      <View style={[styles.errorScreen, { backgroundColor: palette.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar hidden={false} barStyle="light-content" />
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>无法打开书籍</Text>
          <Text style={styles.errorBody}>{loadState.message}</Text>
          <Pressable
            style={[styles.errorBackBtn, { borderColor: ERROR_BACK_BUTTON_BORDER_COLOR }]}
            onPress={handleBack}
          >
            <Text style={styles.errorBackBtnText}>返回</Text>
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
      className="flex-1"
      style={{ backgroundColor: READER_SCREEN_BACKGROUND_COLOR }}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar
        hidden={!chromeVisible && !tocOpen && !settingsOpen}
        barStyle="dark-content"
        translucent={false}
      />

      <View style={styles.readerSurface}>
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
          className="absolute inset-0 z-30"
          style={{ backgroundColor: OVERLAY_MASK_BACKGROUND_COLOR }}
        >
          <Pressable
            className="absolute inset-0"
            onPress={() => {
              setTocOpen(false);
              setSettingsOpen(false);
            }}
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

function DomReaderFallback({
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
          <View className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.55)" }} />
        </>
      ) : null}
      <ActivityIndicator size="large" color={LOADING_INDICATOR_COLOR} />
      <Text className="mt-4 text-sm" style={{ color: DOM_FALLBACK_PRIMARY_TEXT_COLOR }}>
        正在挂载阅读器…
      </Text>
      <Text className="mt-2 text-center text-xs" style={{ color: DOM_FALLBACK_SECONDARY_TEXT_COLOR }}>
        {format ? `format=${format}` : "format=unknown"}
        {title ? ` · ${title}` : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  readerSurface: {
    ...StyleSheet.absoluteFillObject,
  },
  errorScreen: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: ERROR_SCREEN_HORIZONTAL_PADDING,
  },
  errorCard: {
    maxWidth: ERROR_CARD_MAX_WIDTH,
    width: "100%",
    alignItems: "center",
    paddingVertical: ERROR_CARD_VERTICAL_PADDING,
    paddingHorizontal: ERROR_CARD_HORIZONTAL_PADDING,
    borderRadius: ERROR_CARD_BORDER_RADIUS,
    backgroundColor: ERROR_CARD_BACKGROUND_COLOR,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ERROR_CARD_BORDER_COLOR,
  },
  errorTitle: {
    color: ERROR_TITLE_TEXT_COLOR,
    fontSize: ERROR_TITLE_FONT_SIZE,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: ERROR_TITLE_MARGIN_BOTTOM,
  },
  errorBody: {
    color: ERROR_BODY_TEXT_COLOR,
    fontSize: ERROR_BODY_FONT_SIZE,
    lineHeight: ERROR_BODY_LINE_HEIGHT,
    textAlign: "center",
  },
  errorBackBtn: {
    marginTop: ERROR_BACK_BUTTON_MARGIN_TOP,
    paddingVertical: ERROR_BACK_BUTTON_VERTICAL_PADDING,
    paddingHorizontal: ERROR_BACK_BUTTON_HORIZONTAL_PADDING,
    borderRadius: ERROR_BACK_BUTTON_BORDER_RADIUS,
    borderWidth: ERROR_BACK_BUTTON_BORDER_WIDTH,
    backgroundColor: ERROR_BACK_BUTTON_BACKGROUND_COLOR,
  },
  errorBackBtnText: {
    color: ERROR_BACK_BUTTON_TEXT_COLOR,
    fontSize: ERROR_BACK_BUTTON_TEXT_SIZE,
    fontWeight: "600",
  },
});
