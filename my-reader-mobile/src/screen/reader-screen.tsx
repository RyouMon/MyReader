import { router, Stack, useLocalSearchParams } from "expo-router";
import { EncodingType, readAsStringAsync } from "expo-file-system/legacy";
import { resolveReadFormat } from "my-reader-tools/rendition/utils";
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
import type { ReaderState, ReaderTocItem } from "@/src/components/reader/types";
import { readBookDetailFromMetadata, materializeBookFileToCache } from "@/src/data/calibre";
import { extractEpubToCache } from "@/src/data/native-epub-cache";
import { enforceReaderCacheLimit } from "@/src/data/cache";
import type { WebDavDataSource } from "@/src/data/types";
import { downloadWebDavBookFile } from "@/src/data/webdav";
import { useThemePalette } from "@/src/design/tokens";
import { useAppStore } from "@/src/store/app-store";
import type { ReadingLayout } from "@/src/store/app-store.types";
import { useLibraryStore } from "@/src/store/library-store";
import { Animated, Pressable, Text, View } from "@/tw";

/** 按格式懒加载固定版式阅读器，避免为 EPUB 等非固定格式加载 CBZ/PDF 相关依赖。 */
const FixedReaderSurface = lazy(async () => import("@/src/components/reader/fixed/FixedReaderSurface"));
const ReflowableDOMReader = lazy(async () => import("@/src/components/reader/reflow/ReflowableDOMReader"));

/** 初始阅读位置（从第 0 章/页开始）。 */
const INITIAL_READER_PAGE = 0;
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
const READER_SCREEN_BACKGROUND_COLOR = "#111";
/** 加载指示器颜色。 */
const LOADING_INDICATOR_COLOR = "#fff";
/** 弹层遮罩背景色。 */
const OVERLAY_MASK_BACKGROUND_COLOR = "rgba(0,0,0,0.45)";
/** 错误返回按钮边框颜色。 */
const ERROR_BACK_BUTTON_BORDER_COLOR = "rgba(255,255,255,0.2)";
/** 错误卡片背景色。 */
const ERROR_CARD_BACKGROUND_COLOR = "rgba(255,255,255,0.08)";
/** 错误卡片边框颜色。 */
const ERROR_CARD_BORDER_COLOR = "rgba(255,255,255,0.12)";
/** 错误标题文字颜色。 */
const ERROR_TITLE_TEXT_COLOR = "rgba(255,255,255,0.96)";
/** 错误正文文字颜色。 */
const ERROR_BODY_TEXT_COLOR = "rgba(255,255,255,0.78)";
/** 错误返回按钮背景色。 */
const ERROR_BACK_BUTTON_BACKGROUND_COLOR = "rgba(255,255,255,0.06)";
/** 错误返回按钮文字颜色。 */
const ERROR_BACK_BUTTON_TEXT_COLOR = "rgba(255,255,255,0.92)";
/** DOM 回退态主文案颜色。 */
const DOM_FALLBACK_PRIMARY_TEXT_COLOR = "rgba(255,255,255,0.7)";
/** DOM 回退态次文案颜色。 */
const DOM_FALLBACK_SECONDARY_TEXT_COLOR = "rgba(255,255,255,0.4)";

type LoadState =
  | { status: "loading"; message: string }
  | { status: "error"; message: string }
  | {
      status: "ready";
      extractedEpubDirUri: string | null;
      /** PDF：原生阅读器使用的稳定本地 `file://`（不经由 base64） */
      pdfLocalUri: string | null;
      bookArchiveUri: string | null;
      bookArchiveFingerprint: string | null;
      bookArchiveOwned: boolean;
      bookId: number;
      format: string;
      title: string;
      initialPage: number;
      layoutMode: "fixedLayout" | "reflowable" | "unknown";
    };


export default function ReaderScreen() {
  const { id, format: formatParam } = useLocalSearchParams<{
    id?: string;
    format?: string;
  }>();
  const palette = useThemePalette();
  const insets = useSafeAreaInsets();
  const { activeLibrary } = useLibraryStore();
  const dataSources = useAppStore((s) => s.dataSources);

  const webDavSource = activeLibrary?.sourceType === "webdav"
    ? (dataSources.find(
        (d) => d.id === activeLibrary.dataSourceId && d.type === "webdav"
      ) as WebDavDataSource | undefined) ?? null
    : null;

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    message: "正在加载书籍…",
  });
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

  useEffect(() => {
    console.info("[mobile-reader] effect:start", {
      id,
      formatParam,
      activeLibraryId: activeLibrary?.id ?? null,
      activeLibrarySourceType: activeLibrary?.sourceType ?? null,
      hasWebDavSource: Boolean(webDavSource),
    });

    if (!id || !activeLibrary) {
      console.error("[mobile-reader] effect:missing-input", {
        id,
        hasActiveLibrary: Boolean(activeLibrary),
      });
      setLoadState({
        status: "error",
        message: !id ? "缺少书籍参数" : "未选择书库",
      });
      return;
    }

    const currentLibrary = activeLibrary;
    let cancelled = false;

    async function load() {
      try {
        enforceReaderCacheLimit(settings.cache.maxCacheSizeMB);
        console.info("[mobile-reader] load:start", {
          id,
          formatParam,
          libraryId: currentLibrary.id,
          sourceType: currentLibrary.sourceType,
        });
        setLoadState({ status: "loading", message: "正在读取书籍信息…" });

        const calibreId = Number(id);
        if (!Number.isFinite(calibreId) || calibreId <= 0) {
          console.error("[mobile-reader] load:invalid-book-id", { id, calibreId });
          setLoadState({ status: "error", message: "无效的书籍 ID" });
          return;
        }

        const detail = await readBookDetailFromMetadata(currentLibrary, calibreId);
        if (cancelled) return;
        if (!detail) {
          console.error("[mobile-reader] load:book-detail-not-found", {
            calibreId,
            libraryId: currentLibrary.id,
          });
          setLoadState({ status: "error", message: "在书库中未找到该书" });
          return;
        }

        console.info("[mobile-reader] load:book-detail-ready", {
          calibreId,
          title: detail.title,
          formats: detail.formats,
        });

        const fmt = resolveReadFormat(detail.formats, formatParam);
        if (!fmt) {
          console.error("[mobile-reader] load:no-supported-format", {
            calibreId,
            formats: detail.formats,
            formatParam,
          });
          setLoadState({
            status: "error",
            message: `该书没有可阅读的格式（需要 EPUB、CBZ 或 PDF）`,
          });
          return;
        }

        const fmtUpper = fmt.toUpperCase();
        console.info("[mobile-reader] load:resolved-format", {
          calibreId,
          resolvedFormat: fmtUpper,
        });

        setLoadState({
          status: "loading",
          message: webDavSource ? "正在从 WebDAV 下载书籍…" : "正在加载书籍文件…",
        });

        const detailLayoutMode =
          fmtUpper === "EPUB" ? "reflowable" : fmtUpper === "PDF" || fmtUpper === "CBZ" ? "fixedLayout" : "unknown";

        const needsNativeComicPath = fmtUpper === "CBZ";
        const needsPdfNativePath = fmtUpper === "PDF";
        const needsEpubExtract = fmtUpper === "EPUB";

        const localBookFile = !webDavSource && needsNativeComicPath
          ? await materializeBookFileToCache(currentLibrary, calibreId, fmt, "local-comic")
          : null;
        const localEpubFile =
          needsEpubExtract && !webDavSource
            ? await materializeBookFileToCache(currentLibrary, calibreId, fmt, "local-epub")
            : null;
        const webDavEpubFile =
          needsEpubExtract && webDavSource
            ? await downloadWebDavBookFile(currentLibrary, webDavSource, calibreId, fmt)
            : null;
        const webDavBookFile = webDavSource && needsNativeComicPath
          ? await downloadWebDavBookFile(currentLibrary, webDavSource, calibreId, fmt)
          : null;

        const pdfLocalFile = needsPdfNativePath
          ? webDavSource
            ? await downloadWebDavBookFile(currentLibrary, webDavSource, calibreId, fmt)
            : await materializeBookFileToCache(currentLibrary, calibreId, fmt, "local-pdf")
          : null;

        const epubArchiveFile = localEpubFile ?? webDavEpubFile;

        const extractedEpub =
          epubArchiveFile && needsEpubExtract
            ? await extractEpubToCache({
                bookId: calibreId,
                format: fmtUpper,
                archiveUri: epubArchiveFile.uri,
                fingerprint: epubArchiveFile.md5 ?? `sz${epubArchiveFile.size ?? 0}`,
              })
            : null;
        if (cancelled) return;

        console.info("[mobile-reader] load:file-ready", {
          calibreId,
          format: fmtUpper,
          archiveUri: localBookFile?.uri ?? webDavBookFile?.uri ?? null,
          extractedEpubDirUri: extractedEpub?.extractionUri ?? null,
          sourceType: webDavSource ? "webdav" : "local",
        });

        console.info("[mobile-reader] load:reader-input-ready", {
          calibreId,
          format: fmtUpper,
          archiveUri: localBookFile?.uri ?? webDavBookFile?.uri ?? null,
          layoutMode: detailLayoutMode,
          renderer:
            detailLayoutMode === "reflowable"
              ? "native-reflow-webview"
              : fmtUpper === "PDF"
                ? "native-pdf"
                : "native-fixed",
        });

        const archiveFile = needsPdfNativePath
          ? pdfLocalFile
          : (localBookFile ?? webDavBookFile);
        const bookArchiveFingerprint = archiveFile
          ? `${calibreId}-${fmtUpper}-${archiveFile.md5 ?? `sz${archiveFile.size ?? 0}`}`
          : epubArchiveFile
            ? `${calibreId}-${fmtUpper}-${epubArchiveFile.md5 ?? `sz${epubArchiveFile.size ?? 0}`}`
            : `${calibreId}-${fmtUpper}-nohash`;

        setLoadState({
          status: "ready",
          extractedEpubDirUri: extractedEpub?.extractionUri ?? null,
          pdfLocalUri: needsPdfNativePath && pdfLocalFile ? pdfLocalFile.uri : null,
          bookArchiveUri: archiveFile?.uri ?? null,
          bookArchiveFingerprint,
          bookArchiveOwned: Boolean(localBookFile) || Boolean(webDavBookFile) || Boolean(needsPdfNativePath && pdfLocalFile),
          bookId: calibreId,
          format: fmt,
          title: detail.title,
          initialPage: INITIAL_READER_PAGE,
          layoutMode: detailLayoutMode,
        });

        console.info("[mobile-reader] load:ready", {
          calibreId,
          format: fmtUpper,
          title: detail.title,
          initialPage: INITIAL_READER_PAGE,
          layoutMode: detailLayoutMode,
        });
      } catch (e) {
        if (cancelled) return;
        console.error("[mobile-reader] load:failed", {
          id,
          formatParam,
            libraryId: currentLibrary.id,

          error: e,
        });
        setLoadState({
          status: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, activeLibrary, formatParam, webDavSource, settings.cache.maxCacheSizeMB]);

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

  /** DOM 阅读器内 `fetch(file:)` 不可用，经 Expo DOM 桥接用原生读文件（返回 Base64）。 */
  const readBinaryFromFileUrl = useCallback(async (url: string): Promise<string> => {
    const raw = url.trim();
    const uri = raw.startsWith("file:")
      ? raw
      : raw.startsWith("/")
        ? `file://${raw}`
        : `file:///${raw.replace(/\\/g, "/")}`;
    return readAsStringAsync(uri, { encoding: EncodingType.Base64 });
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
      />
    ),
    [loadState]
  );

  const progressPercent = readerState?.progress ?? 0;
  const pageLabel = readerState
    ? `${readerState.currentPage + 1} / ${readerState.totalPages}`
    : "";
  const reflowSettings = settings.reflowable;
  const fixedSettings = settings.fixed;

  if (loadState.status === "loading") {
    return (
      <View className="flex-1" style={{ backgroundColor: READER_SCREEN_BACKGROUND_COLOR }}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar hidden={false} barStyle="light-content" />
        <ActivityIndicator size="large" color={LOADING_INDICATOR_COLOR} />
        <Text className="mt-4 text-sm text-white/60">
          {loadState.message}
        </Text>
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
    <View className="flex-1" style={{ backgroundColor: READER_SCREEN_BACKGROUND_COLOR }}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar
        hidden={!chromeVisible && !tocOpen && !settingsOpen}
        barStyle="dark-content"
        translucent={false}
      />

      <View style={styles.readerSurface}>
        {isReflowSurface ? (
          <ReflowableDOMReader
            extractedDirPath={loadState.extractedEpubDirUri}
            format={loadState.format}
            initialPage={loadState.initialPage}
            onStateChange={handleStateChange}
            onTocReady={handleTocReady}
            onDomProbe={async (event) => {
              console.info("[mobile-reader] dom-probe", event);
            }}
            onRequestClose={handleRequestClose}
            onToggleChrome={toggleChrome}
            gotoPageCommand={gotoPageCmd}
            readingLayout={reflowSettings.readingLayout}
            theme={reflowSettings.theme}
            fontSize={reflowSettings.fontSize}
            lineHeight={reflowSettings.lineHeight}
            paddingX={reflowSettings.paddingX}
            brightness={reflowSettings.brightness}
            contentInsetTop={paginateContentInsetTop}
            contentInsetBottom={paginateContentInsetBottom}
            readBinaryFromFileUrl={
              loadState.extractedEpubDirUri ? readBinaryFromFileUrl : undefined
            }
            dom={{
              style: { flex: 1 },
              scrollEnabled: reflowSettings.readingLayout === "scroll",
            }}
          />
        ) : isFixedSurface ? (
          <FixedReaderSurface
            archiveUri={loadState.bookArchiveUri}
            archiveFingerprint={loadState.bookArchiveFingerprint}
            archiveOwned={loadState.bookArchiveOwned}
            pdfLocalUri={loadState.pdfLocalUri}
            bookId={loadState.bookId}
            format={loadState.format}
            initialPage={loadState.initialPage}
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
    </View>
  );
}

function DomReaderFallback({
  format,
  title,
}: {
  format: string | null;
  title: string | null;
}) {
  useEffect(() => {
    console.info("[mobile-reader] dom-fallback:mounted", {
      format,
      title,
    });
  }, [format, title]);

  return (
    <View
      className="flex-1 items-center justify-center px-6"
      style={{ backgroundColor: READER_SCREEN_BACKGROUND_COLOR }}
    >
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
