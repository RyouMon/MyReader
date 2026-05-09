import { READER_CHROME, READER_FIXED } from "@/src/design/reader-tokens";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { File } from "expo-file-system";
import type { Locator } from "@ryoumon/react-native-readium";
import { pageIndexFromFixedLocator } from "@/src/components/reader/locator";
import type { ReaderState, ReaderTocItem } from "@/src/components/reader/types";
import { resolveReadFormat } from "my-reader-tools/utils";
import { lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StatusBar, StyleSheet } from "react-native";
import { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ReaderBottomBar,
  ReaderSettingsSheet,
  ReaderTocSheet,
  ReaderTopBar,
} from "@/src/components/reader/chrome";
import {
  buildCoverUri,
  getBookFormatPaths,
  materializeBookFileToCache,
  readBookDetailFromMetadata,
} from "@/src/data/calibre";
import { enforceReaderCacheLimit } from "@/src/data/cache";
import { getReadingProgress, setReadingProgress } from "@/src/data/reading-progress";
import type { Library, WebDavDataSource } from "@/src/data/types";
import { localFileUriFor, resolveLibraryBooksDir } from "@/src/sync/backend";
import { getFileState, type LocalState } from "@/src/sync/file_state";
import { useThemePalette } from "@/src/design/tokens";
import { getFallbackCoverColor } from "@/src/components/books/book-cover";
import { useAppStore } from "@/src/store/app-store";
import type { ReadingLayout } from "@/src/store/app-store.types";
import { toNativeFilesystemPath } from "@/src/utils/io";
import { Animated, Image, Pressable, Text, View } from "@/tw";

/** 按格式懒加载固定版式阅读器，避免为 EPUB 等非固定格式加载 CBZ/PDF 相关依赖。 */
const FixedReaderSurface = lazy(async () => import("@/src/components/reader/fixed/FixedReaderSurface"));
const ReadiumReflowReader = lazy(async () => import("@/src/components/reader/reflow/ReadiumReflowReader"));

/** 初始阅读位置（从第 0 章/页开始）。 */
const INITIAL_READER_PAGE = 0;
/** 阅读进度保存防抖时长（毫秒），与桌面端保持一致。 */
const SAVE_DEBOUNCE_MS = 1600;
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

/**
 * 判断 `file_state` 是否表示可直接使用本地下载文件。
 */
function isDownloadedLocalState(state: LocalState | null | undefined): boolean {
  return state === "present" || state === "local_only" || state === "dirty_push";
}

/**
 * 在交给原生阅读器前校验容器文件签名。
 */
async function hasExpectedReaderSignature(file: File, format: string): Promise<boolean> {
  if (!file.exists || (file.size ?? 0) <= 0) return false;
  const upper = format.toUpperCase();
  if (upper !== "EPUB" && upper !== "CBZ" && upper !== "PDF") return true;
  const bytes = await readFileHeaderBytes(file, upper === "PDF" ? 4 : 2);

  if (upper === "PDF") {
    return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  }
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * 仅读取文件头字节用于签名判断，避免大文件整包读入导致内存峰值过高。
 */
async function readFileHeaderBytes(file: File, byteCount: number): Promise<Uint8Array> {
  const safeByteCount = Math.max(0, byteCount | 0);
  if (safeByteCount === 0) return new Uint8Array();
  const handle = file.open();
  try {
    return handle.readBytes(safeByteCount);
  } finally {
    handle.close();
  }
}

/**
 * 解析 WebDAV 已下载格式对应的本地缓存文件。
 */
async function resolveDownloadedWebDavBookFile(input: {
  libraryId: string;
  dataSourceId: string;
  cacheDirUri: string;
  library: Library;
  calibreBookId: number;
  format: string;
}): Promise<File | null> {
  const paths = await getBookFormatPaths(input.library, input.calibreBookId);
  const match = paths.find((path) => path.format.toUpperCase() === input.format.toUpperCase());
  if (!match) return null;

  const state = await getFileState(
    { dataSourceId: input.dataSourceId, libraryId: input.libraryId },
    match.relativePath,
  );
  if (!isDownloadedLocalState(state?.localState)) return null;

  const file = new File(localFileUriFor(input.cacheDirUri, match.relativePath));
  if (await hasExpectedReaderSignature(file, input.format)) return file;
  if (file.exists) file.delete();
  return null;
}

type LoadState =
  | { status: "loading"; message: string }
  | { status: "error"; message: string }
  | {
      status: "ready";
      /** EPUB 容器 `file://` URI，供 Readium 转原生路径打开。 */
      epubFileUri: string | null;
      /** PDF：原生阅读器使用的稳定本地 `file://`（不经由 base64） */
      pdfLocalUri: string | null;
      bookArchiveUri: string | null;
      bookArchiveFingerprint: string | null;
      bookArchiveOwned: boolean;
      bookId: number;
      format: string;
      title: string;
      initialPage: number;
      initialLocator: Locator | null;
      layoutMode: "fixedLayout" | "reflowable" | "unknown";
    };


export default function ReaderScreen() {
  const { id, format: formatParam } = useLocalSearchParams<{
    id?: string;
    format?: string;
  }>();
  const palette = useThemePalette();
  const insets = useSafeAreaInsets();
  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    message: "正在加载书籍…",
  });
  const [coverUri, setCoverUri] = useState<string | undefined>(undefined);
  const [bookTitle, setBookTitle] = useState<string | undefined>(undefined);
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
  const loadStateRef = useRef<LoadState>({ status: "loading", message: "正在加载书籍…" });

  useEffect(() => {
    loadStateRef.current = loadState;
  }, [loadState]);

  useEffect(() => {
    console.info("[mobile-reader] effect:start", {
      id,
      formatParam,
      activeLibraryId,
      hasActiveLibrary: Boolean(activeLibraryId),
    });

    if (!id || !activeLibraryId) {
      console.error("[mobile-reader] effect:missing-input", {
        id,
        hasActiveLibrary: Boolean(activeLibraryId),
      });
      setLoadState({
        status: "error",
        message: !id ? "缺少书籍参数" : "未选择书库",
      });
      return;
    }

    // Guard: 如果已经加载好了同一本书的同一格式，跳过重复加载
    if (
      loadStateRef.current.status === "ready" &&
      loadStateRef.current.bookId === Number(id) &&
      loadStateRef.current.format.toUpperCase() === (formatParam ?? "").toUpperCase()
    ) {
      console.info("[mobile-reader] effect:skip-duplicate-load", {
        id,
        formatParam,
        bookId: loadStateRef.current.bookId,
        format: loadStateRef.current.format,
      });
      return;
    }

    const state = useAppStore.getState();
    const currentLibrary = state.libraries.find((l) => l.id === activeLibraryId) ?? null;
    if (!currentLibrary) {
      console.error("[mobile-reader] effect:library-not-found", { activeLibraryId });
      setLoadState({ status: "error", message: "未选择书库" });
      return;
    }
    const lib = currentLibrary;

    const currentWebDavSource =
      lib.sourceType === "webdav"
        ? (state.dataSources.find(
            (d) => d.id === lib.dataSourceId && d.type === "webdav"
          ) as WebDavDataSource | undefined) ?? null
        : null;

    let cancelled = false;

    async function load() {
      try {
        enforceReaderCacheLimit(settings.cache.maxCacheSizeMB);
        console.info("[mobile-reader] load:start", {
          id,
          formatParam,
          libraryId: lib.id,
          sourceType: lib.sourceType,
        });
        setLoadState({ status: "loading", message: "正在读取书籍信息…" });

        // 优先从已有的 books 列表中获取封面和标题，减少等待感
        const bookItem = useAppStore.getState().books.find((b) => b.id === id);
        if (bookItem?.coverUri) {
          setCoverUri(typeof bookItem.coverUri === "string" ? bookItem.coverUri : bookItem.coverUri.uri);
        }
        if (bookItem?.title) {
          setBookTitle(bookItem.title);
        }

        const calibreId = Number(id);
        if (!Number.isFinite(calibreId) || calibreId <= 0) {
          console.error("[mobile-reader] load:invalid-book-id", { id, calibreId });
          setLoadState({ status: "error", message: "无效的书籍 ID" });
          return;
        }

        const detail = await readBookDetailFromMetadata(lib, calibreId);
        if (cancelled) return;
        if (!detail) {
          console.error("[mobile-reader] load:book-detail-not-found", {
            calibreId,
            libraryId: lib.id,
          });
          setLoadState({ status: "error", message: "在书库中未找到该书" });
          return;
        }

        // 如果 books 列表中没有封面，用 detail 构建本地封面 URI
        if (!bookItem?.coverUri && detail.hasCover && detail.path) {
          const builtCover = buildCoverUri(lib, detail.path, detail.hasCover);
          if (builtCover) setCoverUri(builtCover);
        }
        setBookTitle(detail.title);

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
          message: currentWebDavSource ? "正在从 WebDAV 下载书籍…" : "正在加载书籍文件…",
        });

        const detailLayoutMode =
          fmtUpper === "EPUB" ? "reflowable" : fmtUpper === "PDF" || fmtUpper === "CBZ" ? "fixedLayout" : "unknown";

        const needsNativeComicPath = fmtUpper === "CBZ";
        const needsPdfNativePath = fmtUpper === "PDF";
        const needsEpubExtract = fmtUpper === "EPUB";

        const syncCacheDirUri = currentWebDavSource ? resolveLibraryBooksDir(lib.id) : undefined;
        const downloadedWebDavBookFile =
          currentWebDavSource && syncCacheDirUri && lib.dataSourceId
            ? await resolveDownloadedWebDavBookFile({
                libraryId: lib.id,
                dataSourceId: lib.dataSourceId,
                cacheDirUri: syncCacheDirUri,
                library: lib,
                calibreBookId: calibreId,
                format: fmt,
              })
            : null;

        const localBookFile = !currentWebDavSource && needsNativeComicPath
          ? await materializeBookFileToCache(lib, calibreId, fmt, "local-comic")
          : null;
        const localEpubFile =
          needsEpubExtract && !currentWebDavSource
            ? await materializeBookFileToCache(lib, calibreId, fmt, "local-epub")
            : null;
        const webDavEpubFile =
          needsEpubExtract && currentWebDavSource
            ? downloadedWebDavBookFile
            : null;
        const webDavBookFile = currentWebDavSource && needsNativeComicPath
          ? downloadedWebDavBookFile
          : null;

        const pdfLocalFile = needsPdfNativePath
          ? currentWebDavSource
            ? downloadedWebDavBookFile
            : await materializeBookFileToCache(lib, calibreId, fmt, "local-pdf")
          : null;

        const epubArchiveFile = localEpubFile ?? webDavEpubFile;
        const requiredWebDavFile = currentWebDavSource && (needsEpubExtract || needsNativeComicPath || needsPdfNativePath);
        if (requiredWebDavFile && !downloadedWebDavBookFile) {
          setLoadState({
            status: "error",
            message: "请先在书籍详情中下载该格式，再打开阅读。",
          });
          return;
        }

        if (cancelled) return;

        console.info("[mobile-reader] load:file-ready", {
          calibreId,
          format: fmtUpper,
          archiveUri: localBookFile?.uri ?? webDavBookFile?.uri ?? epubArchiveFile?.uri ?? null,
          epubFileUri: needsEpubExtract && epubArchiveFile ? epubArchiveFile.uri : null,
          sourceType: currentWebDavSource ? "webdav" : "local",
        });

        console.info("[mobile-reader] load:reader-input-ready", {
          calibreId,
          format: fmtUpper,
          archiveUri: localBookFile?.uri ?? webDavBookFile?.uri ?? epubArchiveFile?.uri ?? null,
          layoutMode: detailLayoutMode,
          renderer:
            detailLayoutMode === "reflowable"
              ? "readium-reflow"
              : fmtUpper === "PDF"
                ? "native-pdf"
                : fmtUpper === "PDF"
                  ? "native-pdf"
                  : "readium-fixed",
        });

        const archiveFile = needsPdfNativePath
          ? pdfLocalFile
          : (localBookFile ?? webDavBookFile);
        const bookArchiveFingerprint = archiveFile
          ? `${calibreId}-${fmtUpper}-${archiveFile.md5 ?? `sz${archiveFile.size ?? 0}`}`
          : epubArchiveFile
            ? `${calibreId}-${fmtUpper}-${epubArchiveFile.md5 ?? `sz${epubArchiveFile.size ?? 0}`}`
            : `${calibreId}-${fmtUpper}-nohash`;
        const bookArchiveOwned =
          Boolean(localBookFile) || Boolean(needsPdfNativePath && !currentWebDavSource && pdfLocalFile);

        const initialLocator = await getReadingProgress(lib, calibreId, fmt);
        if (cancelled) return;

        const initialPage =
          detailLayoutMode === "fixedLayout"
            ? pageIndexFromFixedLocator(initialLocator, INITIAL_READER_PAGE)
            : INITIAL_READER_PAGE;

        setLoadState({
          status: "ready",
          epubFileUri: needsEpubExtract && epubArchiveFile ? epubArchiveFile.uri : null,
          pdfLocalUri: needsPdfNativePath && pdfLocalFile ? pdfLocalFile.uri : null,
          bookArchiveUri: archiveFile?.uri ?? null,
          bookArchiveFingerprint,
          bookArchiveOwned,
          bookId: calibreId,
          format: fmt,
          title: detail.title,
          initialPage,
          initialLocator,
          layoutMode: detailLayoutMode,
        });

        console.info("[mobile-reader] load:ready", {
          calibreId,
          format: fmtUpper,
          title: detail.title,
          initialPage,
          initialLocator: initialLocator
            ? { href: initialLocator.href, type: initialLocator.type }
            : null,
          layoutMode: detailLayoutMode,
        });
      } catch (e) {
        if (cancelled) return;
        console.error("[mobile-reader] load:failed", {
          id,
          formatParam,
            libraryId: lib.id,

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
  }, [id, activeLibraryId, formatParam, settings.cache.maxCacheSizeMB]);

  const bookContextRef = useRef<{ library: Library; bookId: number; format: string } | null>(null);

  useEffect(() => {
    if (loadState.status === "ready") {
      const state = useAppStore.getState();
      const lib = state.libraries.find((l) => l.id === activeLibraryId);
      if (lib) {
        bookContextRef.current = {
          library: lib,
          bookId: loadState.bookId,
          format: loadState.format,
        };
      }
    }
  }, [activeLibraryId, loadState]);

  const saveSeqRef = useRef(0);

  useEffect(() => {
    const ctx = bookContextRef.current;
    if (!ctx) return;
    if (!readerState?.ready || !readerState.locator) return;

    const seq = ++saveSeqRef.current;
    const t = setTimeout(() => {
      if (saveSeqRef.current !== seq) return;
      void (async () => {
        try {
          await setReadingProgress(
            ctx.library,
            ctx.bookId,
            ctx.format,
            readerState.locator!,
          );
        } catch (e) {
          console.error("[mobile-reader] save-progress-error", e);
        }
      })();
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(t);
  }, [readerState?.ready, readerState?.locator]);

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
