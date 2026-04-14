"use dom";

import { renderTextChapterPage } from "my-reader-tools/layout-engines/reflow";
import type {
  LayoutConfig,
  TextChapterData,
  TextChapterPaginationResult,
} from "my-reader-tools/types";
import { useBookReader } from "my-reader-tools/hooks/useReader";
import type { BookAnchor } from "my-reader-tools/progress/BookAnchor";
import {
  type CSSProperties,
  type TouchEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { flattenReflowToc } from "@/src/components/reader/reader-toc";
import type { ReaderState, ReaderTocItem } from "@/src/components/reader/types";

import type { ReadingLayout, ReaderTheme } from "@/src/store/app-store.types";

/** 默认字体大小。 */
const DEFAULT_FONT_SIZE = 18;
/** 默认行高倍率。 */
const DEFAULT_LINE_HEIGHT = 1.85;
/** 默认左右内边距。 */
const DEFAULT_PADDING_X = 20;
/** 默认亮度百分比。 */
const DEFAULT_BRIGHTNESS = 100;
/** 默认分页模式顶部留白。 */
const DEFAULT_CONTENT_INSET_TOP = 72;
/** 默认分页模式底部留白。 */
const DEFAULT_CONTENT_INSET_BOTTOM = 132;
/** 亮度下限，避免正文过暗不可读。 */
const MIN_BRIGHTNESS_RATIO = 0.2;
/** 亮度百分比换算基数。 */
const BRIGHTNESS_PERCENT_BASE = 100;
/** 阅读正文最大列宽。 */
const READER_CONTENT_MAX_WIDTH = 820;
/** 测量宿主向左偏移距离（vw）。 */
const MEASURE_HOST_LEFT_OFFSET_VW = -200;
/** DOM 事件里初始页缺省值。 */
const DOM_PROBE_INITIAL_PAGE_FALLBACK = 0;
/** 分页手势最小横向滑动距离。 */
const PAGINATE_MIN_SWIPE_DISTANCE = 48;
/** 分页手势允许的最大纵向偏移。 */
const PAGINATE_MAX_VERTICAL_DRIFT = 72;
/** 判定点击手势允许的最大位移。 */
const TAP_MAX_DRIFT = 12;
/** 判定点击手势允许的最长按压时长（毫秒）。 */
const TAP_MAX_DURATION_MS = 260;
/** 阅读进度百分比换算基数。 */
const PROGRESS_PERCENT_MULTIPLIER = 100;
/** 加载态提示内边距。 */
const LOADING_PADDING = "24px 0";
/** 错误卡片圆角。 */
const ERROR_CARD_BORDER_RADIUS = 16;
/** 错误卡片内边距。 */
const ERROR_CARD_PADDING = 20;
/** 错误标题与正文间距。 */
const ERROR_TITLE_MARGIN_BOTTOM = 12;
/** 错误标题字号。 */
const ERROR_TITLE_FONT_SIZE = 18;
/** 错误标题字重。 */
const ERROR_TITLE_FONT_WEIGHT = 700;
/** 错误正文行高。 */
const ERROR_TEXT_LINE_HEIGHT = 1.6;

type ReflowableDOMReaderProps = {
  extractedDirPath: string | null;
  format: string;
  initialPage?: number;
  onStateChange: (state: ReaderState) => Promise<void>;
  onTocReady: (toc: ReaderTocItem[]) => Promise<void>;
  onDomProbe: (event: {
    stage: string;
    detail?: Record<string, unknown> | null;
  }) => Promise<void>;
  onRequestClose: () => Promise<void>;
  onToggleChrome?: () => void;
  gotoPageCommand?: number;
  readingLayout?: ReadingLayout;
  theme?: ReaderTheme;
  fontSize?: number;
  lineHeight?: number;
  paddingX?: number;
  brightness?: number;
  /** 分页模式正文区上边缘留白（与顶栏占位一致）。 */
  contentInsetTop?: number;
  /** 分页模式正文区下边缘留白（与底栏占位一致）。 */
  contentInsetBottom?: number;
  /**
   * 原生侧用 expo-file-system 读取本地 `file:` URL，返回 Base64（供 DOM 桥接序列化）。
   * EPUB 解压目录在 WebView 内无法用 fetch/XHR 读 `file:` 时必须提供。
   */
  readBinaryFromFileUrl?: (url: string) => Promise<string>;
  dom?: import("expo/dom").DOMProps;
};

type RenderedChapter = {
  index: number;
  title: string;
  bodyHtml: string;
  cssText: string;
  text: string;
};

type ReaderTouchSnapshot = {
  x: number;
  y: number;
  timestampMs: number;
};

function base64ToUint8Array(b64: string): Uint8Array {
  try {
    const binaryStr = atob(b64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  } catch {
    throw new Error("Invalid base64 from native file reader");
  }
}

function getThemeVars(theme: ReaderTheme) {
  const themeMap: Record<ReaderTheme, { bg: string; text: string; muted: string; link: string }> = {
    dark: {
      bg: "#111111",
      text: "rgba(255,255,255,0.92)",
      muted: "rgba(255,255,255,0.64)",
      link: "#d9a066",
    },
    paper: {
      bg: "#f5efe6",
      text: "#2f261f",
      muted: "#6c6258",
      link: "#9f5b2d",
    },
    light: {
      bg: "#ffffff",
      text: "#222222",
      muted: "#6b7280",
      link: "#9f5b2d",
    },
    green: {
      bg: "#e8f0e4",
      text: "#253325",
      muted: "#5f7161",
      link: "#577a45",
    },
  };

  return themeMap[theme];
}

function buildBaseReaderCss(
  theme: ReaderTheme,
  fontSize: number,
  lineHeight: number,
  paddingX: number,
  brightness: number,
  paginateInsetTop: number,
  paginateInsetBottom: number,
) {
  const selected = getThemeVars(theme);
  const paginateVerticalReserve = paginateInsetTop + paginateInsetBottom;

  return `
    :root {
      color-scheme: ${theme === "dark" ? "dark" : "light"};
      --reader-bg: ${selected.bg};
      --reader-text: ${selected.text};
      --reader-muted: ${selected.muted};
      --reader-link: ${selected.link};
    }

    html, body {
      margin: 0;
      padding: 0;
      background: var(--reader-bg);
      color: var(--reader-text);
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: "Noto Sans SC", system-ui, sans-serif;
      filter: brightness(${Math.max(MIN_BRIGHTNESS_RATIO, brightness / BRIGHTNESS_PERCENT_BASE)});
    }

    #reflow-scroll-root {
      height: 100vh;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      padding: 0 ${paddingX}px 0;
      box-sizing: border-box;
    }

    #reflow-paginate-root {
      width: 100vw;
      height: 100vh;
      height: 100dvh;
      overflow: hidden;
      overscroll-behavior: none;
      box-sizing: border-box;
      padding: ${paginateInsetTop}px ${paddingX}px ${paginateInsetBottom}px;
      display: flex;
      flex-direction: row;
      align-items: stretch;
      justify-content: center;
    }

    #reflow-measure-host {
      position: fixed;
      left: ${MEASURE_HOST_LEFT_OFFSET_VW}vw;
      top: 0;
      width: calc(100vw - ${paddingX * 2}px);
      height: calc(100dvh - ${paginateVerticalReserve}px);
      overflow: hidden;
      pointer-events: none;
      opacity: 0;
      box-sizing: border-box;
    }

    .reader-host {
      max-width: ${READER_CONTENT_MAX_WIDTH}px;
      margin: 0 auto;
      width: 100%;
    }

    .reader-body-content {
      color: var(--reader-text);
      font-size: ${fontSize}px;
      line-height: ${lineHeight};
      word-break: break-word;
    }

    .reader-body-content img,
    .reader-body-content svg,
    .reader-body-content video,
    .reader-body-content canvas {
      max-width: 100%;
      height: auto;
    }

    .reader-body-content a {
      color: var(--reader-link);
    }

    .paginate-frame {
      width: min(100%, ${READER_CONTENT_MAX_WIDTH}px);
      height: 100%;
      min-height: 0;
      overflow: hidden;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }

    .paginate-shell {
      flex: 1 1 0;
      min-height: 0;
      width: 100%;
      overflow: hidden;
      display: flex;
      align-items: stretch;
    }

    .paginate-page {
      width: 100%;
      height: 100%;
      overflow: hidden;
      overscroll-behavior: none;
      box-sizing: border-box;
    }
  `;
}

/**
 * 分页模式传入 `paginateViewport`（正文列实际宽高）；滚动模式传 `null` 使用整窗尺寸。
 */
function createLayoutConfig(
  fontSize: number,
  lineHeight: number,
  paddingX: number,
  paginateViewport: { width: number; height: number } | null,
): LayoutConfig {
  const winW = typeof window !== "undefined" ? window.innerWidth : 0;
  const winH = typeof window !== "undefined" ? window.innerHeight : 0;
  const viewPortWidth = paginateViewport ? paginateViewport.width : winW;
  const viewPortHeight = paginateViewport ? paginateViewport.height : winH;

  return {
    fontFamily: '"Noto Sans SC", system-ui, sans-serif',
    fontSize,
    viewPortHeight,
    viewPortWidth,
    paddingX,
    lineHeight,
    doubleColumn: false,
  };
}

function getPaginatedPageCount(pagination: TextChapterPaginationResult | null) {
  if (!pagination) {
    return 1;
  }

  return pagination.mode === "sliced"
    ? Math.max(1, pagination.pageCount || pagination.pages.length)
    : 1;
}

function loadRenderedChapter(data: TextChapterData, indexOverride?: number): RenderedChapter {
  return {
    index: indexOverride ?? data.index,
    title: data.title,
    bodyHtml: data.bodyHtml,
    cssText: data.cssText,
    text: data.text,
  };
}

function getPaginatedNavigationState(
  readerCurChapter: number,
  totalChapters: number,
  pageCount: number,
  rawPageIndex: number,
) {
  const currentPageIndex = Math.max(0, Math.min(pageCount - 1, rawPageIndex));
  const isFirstPageInChapter = currentPageIndex <= 0;
  const isLastPageInChapter = currentPageIndex >= Math.max(0, pageCount - 1);

  return {
    currentPageIndex,
    canGoPrev: !(readerCurChapter <= 0 && isFirstPageInChapter),
    canGoNext: !(readerCurChapter >= Math.max(0, totalChapters - 1) && isLastPageInChapter),
  };
}

function toTextChapterData(chapter: RenderedChapter): TextChapterData {
  return {
    type: "text",
    index: chapter.index,
    title: chapter.title,
    href: "",
    bodyHtml: chapter.bodyHtml,
    cssText: chapter.cssText,
    text: chapter.text,
  };
}

export default function ReflowableDOMReader({
  extractedDirPath,
  format,
  initialPage,
  onStateChange,
  onTocReady,
  onDomProbe,
  onRequestClose,
  onToggleChrome,
  gotoPageCommand,
  readingLayout = "scroll",
  theme = "paper",
  fontSize = DEFAULT_FONT_SIZE,
  lineHeight = DEFAULT_LINE_HEIGHT,
  paddingX = DEFAULT_PADDING_X,
  brightness = DEFAULT_BRIGHTNESS,
  contentInsetTop = DEFAULT_CONTENT_INSET_TOP,
  contentInsetBottom = DEFAULT_CONTENT_INSET_BOTTOM,
  readBinaryFromFileUrl,
  dom,
}: ReflowableDOMReaderProps) {
  void onRequestClose;
  void dom;

  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const paginateScrollRef = useRef<HTMLDivElement | null>(null);
  const measureHostRef = useRef<HTMLDivElement | null>(null);
  const onStateChangeRef = useRef(onStateChange);
  const onTocReadyRef = useRef(onTocReady);
  const onDomProbeRef = useRef(onDomProbe);
  const onToggleChromeRef = useRef(onToggleChrome);
  onStateChangeRef.current = onStateChange;
  onTocReadyRef.current = onTocReady;
  onDomProbeRef.current = onDomProbe;
  onToggleChromeRef.current = onToggleChrome;

  const readerLoadingRef = useRef(false);
  const readerErrorRef = useRef<string | null>(null);
  const scrollSnapRef = useRef({
    curChapter: 0,
    totalChapters: 0,
    ready: false,
    chapterTitle: "",
  });

  const readerTouchStartRef = useRef<ReaderTouchSnapshot | null>(null);
  const renderPaginatedContentRef = useRef<
    (
      paginationResult: TextChapterPaginationResult | null,
      renderedChapter: RenderedChapter | null,
      pageIndexOverride?: number,
    ) => void
  >(() => {});

  const [pagination, setPagination] = useState<TextChapterPaginationResult | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!readBinaryFromFileUrl) {
      return;
    }
    window.__myReaderToolsReadBinary = async (url: string) => {
      const b64 = await readBinaryFromFileUrl(url);
      return base64ToUint8Array(b64);
    };
    return () => {
      delete window.__myReaderToolsReadBinary;
    };
  }, [readBinaryFromFileUrl]);

  const source = useMemo(() => {
    if (!extractedDirPath) return null;
    return { extractedDirPath };
  }, [extractedDirPath]);

  const initialOpenAnchor = useMemo((): BookAnchor | null => {
    if (initialPage != null && initialPage > 0) {
      return { chapterIndex: initialPage };
    }
    return null;
  }, [initialPage]);

  const {
    ready: readerReady,
    error: readerError,
    loading: readerLoading,
    toc,
    totalChapters,
    curChapter,
    chapter: coreChapter,
    curPageIndex,
    gotoChapter,
    gotoNextPage,
    gotoPrevPage,
    layout: runLayout,
    notifyInitialViewCommitted,
    progress: readerProgress,
  } = useBookReader({
    source,
    format: format || "",
    initialOpenAnchor,
  });

  readerLoadingRef.current = readerLoading;
  readerErrorRef.current = readerError;
  scrollSnapRef.current = {
    curChapter,
    totalChapters,
    ready: readerReady,
    chapterTitle: readerProgress.chapterTitle,
  };

  const renderedChapter = useMemo((): RenderedChapter | null => {
    if (!coreChapter || coreChapter.type !== "text") return null;
    return loadRenderedChapter(coreChapter, curChapter);
  }, [coreChapter, curChapter]);

  const displayError = readerError ?? layoutError;

  const renderPaginatedContent = useCallback(
    (
      paginationResult: TextChapterPaginationResult | null,
      chapter: RenderedChapter | null,
      pageIndexOverride?: number,
    ) => {
      const host = paginateScrollRef.current;
      if (!host || !chapter || !paginationResult) {
        return;
      }

      const pageEl = host.querySelector<HTMLElement>(".paginate-page .reader-body-content");
      if (!pageEl) {
        return;
      }

      const chapterData = toTextChapterData(chapter);
      const pageCount = getPaginatedPageCount(paginationResult);
      const pageIndex =
        pageIndexOverride ?? Math.max(0, Math.min(pageCount - 1, curPageIndex));

      renderTextChapterPage(
        pageEl,
        chapterData,
        paginationResult.mode,
        paginationResult.pages,
        pageIndex,
        paginationResult.sourceRoot,
        paginationResult.texts,
      );
    },
    [curPageIndex],
  );
  renderPaginatedContentRef.current = renderPaginatedContent;

  useEffect(() => {
    if (!extractedDirPath || !format) return;
    void onDomProbeRef.current({
      stage: "reflow-init-start",
      detail: {
        format,
        initialPage: initialPage ?? DOM_PROBE_INITIAL_PAGE_FALLBACK,
        extractedDirPath,
      },
    });
  }, [extractedDirPath, format, initialPage]);

  useEffect(() => {
    if (!toc.length) return;
    void onTocReadyRef.current(flattenReflowToc(toc));
  }, [toc]);

  useEffect(() => {
    if (!readerReady || !totalChapters) return;
    void onDomProbeRef.current({
      stage: "reflow-reader-ready",
      detail: {
        chapterCount: totalChapters,
        tocCount: toc.length,
        initialIndex: curChapter,
      },
    });
  }, [readerReady, totalChapters, toc.length, curChapter]);

  useEffect(() => {
    if (!readerError) return;
    void onDomProbeRef.current({
      stage: "reflow-init-failed",
      detail: { message: readerError },
    });
  }, [readerError]);

  useLayoutEffect(() => {
    if (readingLayout !== "paginate") return;
    if (!coreChapter || coreChapter.type !== "text") return;
    if (totalChapters <= 0) return;
    const host = measureHostRef.current;
    const shell = paginateScrollRef.current;
    if (!host || !shell) return;

    let cancelled = false;
    let layoutGeneration = 0;

    const measureAndLayout = () => {
      const w = Math.round(shell.clientWidth);
      const h = Math.round(shell.clientHeight);
      if (w <= 0 || h <= 0) return;
      const renderedNow = loadRenderedChapter(coreChapter, curChapter);
      const gen = ++layoutGeneration;
      void (async () => {
        try {
          setLayoutError(null);
          const config = createLayoutConfig(fontSize, lineHeight, paddingX, { width: w, height: h });
          const nextPagination = (await runLayout(config, host)) ?? null;
          if (cancelled || gen !== layoutGeneration) return;
          setPagination(nextPagination);
          const pageCount = getPaginatedPageCount(nextPagination);
          const pageIndex = Math.max(0, Math.min(pageCount - 1, curPageIndex));

          requestAnimationFrame(() => {
            if (cancelled || gen !== layoutGeneration) return;
            renderPaginatedContentRef.current(nextPagination, renderedNow, pageIndex);
          });
        } catch (e) {
          if (cancelled || gen !== layoutGeneration) return;
          setLayoutError(e instanceof Error ? e.message : String(e));
        }
      })();
    };

    measureAndLayout();
    const ro = new ResizeObserver(() => measureAndLayout());
    ro.observe(shell);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [
    readingLayout,
    coreChapter,
    curChapter,
    curPageIndex,
    totalChapters,
    fontSize,
    lineHeight,
    paddingX,
    runLayout,
    renderedChapter,
    contentInsetTop,
    contentInsetBottom,
  ]);

  useLayoutEffect(() => {
    if (readingLayout !== "scroll") return;
    if (!coreChapter || coreChapter.type !== "text") return;
    if (totalChapters <= 0) return;

    let cancelled = false;

    void (async () => {
      try {
        setLayoutError(null);
        const config = createLayoutConfig(fontSize, lineHeight, paddingX, null);
        await runLayout(config, null);
        if (cancelled) return;
        notifyInitialViewCommitted();
        setPagination(null);
        requestAnimationFrame(() => {
          scrollRootRef.current?.scrollTo({ top: 0, behavior: "auto" });
        });
      } catch (e) {
        if (cancelled) return;
        setLayoutError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    readingLayout,
    coreChapter,
    curChapter,
    totalChapters,
    fontSize,
    lineHeight,
    paddingX,
    runLayout,
    notifyInitialViewCommitted,
  ]);

  useEffect(() => {
    if (gotoPageCommand == null || gotoPageCommand < 0) return;
    if (totalChapters <= 0) return;
    void gotoChapter(gotoPageCommand);
  }, [gotoPageCommand, gotoChapter, totalChapters]);

  const handleReaderTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) {
      readerTouchStartRef.current = null;
      return;
    }
    readerTouchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      timestampMs: Date.now(),
    };
  }, []);

  const handleReaderTouchEnd = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      const start = readerTouchStartRef.current;
      readerTouchStartRef.current = null;
      if (!start || e.changedTouches.length !== 1) return;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const durationMs = Date.now() - start.timestampMs;
      const isTapGesture =
        absDx <= TAP_MAX_DRIFT && absDy <= TAP_MAX_DRIFT && durationMs <= TAP_MAX_DURATION_MS;

      if (isTapGesture) {
        onToggleChromeRef.current?.();
        return;
      }

      if (readingLayout !== "paginate") return;
      if (absDx < PAGINATE_MIN_SWIPE_DISTANCE) return;
      if (absDy > PAGINATE_MAX_VERTICAL_DRIFT && absDy > absDx) return;
      if (totalChapters <= 0 || !readerReady) return;

      void (async () => {
        try {
          if (dx < 0) await gotoNextPage();
          else await gotoPrevPage();
        } catch (err) {
          setLayoutError(err instanceof Error ? err.message : String(err));
        }
      })();
    },
    [readingLayout, totalChapters, readerReady, gotoNextPage, gotoPrevPage],
  );

  const handleReaderTouchCancel = useCallback(() => {
    readerTouchStartRef.current = null;
  }, []);

  useEffect(() => {
    const err = displayError;
    const loading = readerLoading;

    if (readingLayout === "paginate") {
      const pageCount = Math.max(1, getPaginatedPageCount(pagination));
      const nav = getPaginatedNavigationState(curChapter, totalChapters, pageCount, curPageIndex);
      void onStateChangeRef.current({
        ready: readerReady,
        currentPage: nav.currentPageIndex,
        totalPages: pageCount,
        progress: Math.round(readerProgress.fraction * PROGRESS_PERCENT_MULTIPLIER),
        chapterTitle: readerProgress.chapterTitle,
        loading,
        error: err,
        canGoPrev: nav.canGoPrev,
        canGoNext: nav.canGoNext,
      });
    } else {
      void onStateChangeRef.current({
        ready: readerReady,
        currentPage: curChapter,
        totalPages: Math.max(1, totalChapters),
        progress: Math.round(readerProgress.fraction * PROGRESS_PERCENT_MULTIPLIER),
        chapterTitle: readerProgress.chapterTitle,
        loading,
        error: err,
        canGoPrev: curChapter > 0,
        canGoNext: curChapter < Math.max(0, totalChapters - 1),
      });
    }
  }, [
    readerReady,
    curChapter,
    curPageIndex,
    totalChapters,
    readerLoading,
    displayError,
    readerProgress,
    readingLayout,
    pagination,
  ]);

  useEffect(() => {
    if (readingLayout !== "scroll") return;
    const root = scrollRootRef.current;
    if (!root) return;

    const onScroll = () => {
      const snap = scrollSnapRef.current;
      const maxScroll = Math.max(1, root.scrollHeight - root.clientHeight);
      const fraction = Math.max(0, Math.min(1, root.scrollTop / maxScroll));
      const base = snap.totalChapters > 0 ? snap.curChapter / snap.totalChapters : 0;
      const whole =
        snap.totalChapters > 0 ? (snap.curChapter + fraction) / snap.totalChapters : fraction;
      const percent = Math.round(Math.max(base, whole) * PROGRESS_PERCENT_MULTIPLIER);
      void onStateChangeRef.current({
        ready: snap.ready,
        currentPage: snap.curChapter,
        totalPages: Math.max(1, snap.totalChapters),
        progress: percent,
        chapterTitle: snap.chapterTitle,
        loading: readerLoadingRef.current,
        error: readerErrorRef.current,
        canGoPrev: snap.curChapter > 0,
        canGoNext: snap.curChapter < Math.max(0, snap.totalChapters - 1),
      });
    };

    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [readingLayout, curChapter, totalChapters, readerReady, readerProgress.chapterTitle]);

  const scopedCss = useMemo(() => {
    if (!renderedChapter?.cssText) return "";
    return renderedChapter.cssText;
  }, [renderedChapter?.cssText]);

  const baseCss = useMemo(
    () =>
      buildBaseReaderCss(
        theme,
        fontSize,
        lineHeight,
        paddingX,
        brightness,
        contentInsetTop,
        contentInsetBottom,
      ),
    [theme, fontSize, lineHeight, paddingX, brightness, contentInsetTop, contentInsetBottom],
  );

  useEffect(() => {
    if (readingLayout !== "paginate" || !renderedChapter || !pagination) {
      return;
    }

    const id = requestAnimationFrame(() => {
      renderPaginatedContent(pagination, renderedChapter);
    });

    return () => cancelAnimationFrame(id);
  }, [renderedChapter, pagination, readingLayout, renderPaginatedContent]);

  return (
    <>
      <style>{baseCss}</style>
      {scopedCss ? <style>{scopedCss}</style> : null}
      <div id="reflow-measure-host" ref={measureHostRef} />
      {readingLayout === "scroll" ? (
        <div
          id="reflow-scroll-root"
          ref={scrollRootRef}
          onTouchStart={handleReaderTouchStart}
          onTouchEnd={handleReaderTouchEnd}
          onTouchCancel={handleReaderTouchCancel}
        >
          <div className="reader-host">
            {displayError ? (
              <div style={styles.errorCard}>
                <p style={styles.errorTitle}>无法打开 EPUB</p>
                <p style={styles.errorText}>{displayError}</p>
              </div>
            ) : readerLoading && !renderedChapter ? (
              <div style={styles.loading}>正在加载章节…</div>
            ) : renderedChapter ? (
              <>
                <div
                  className="reader-body-content"
                  ref={(node) => {
                    if (node) node.innerHTML = renderedChapter.bodyHtml;
                  }}
                />
              </>
            ) : (
              <div style={styles.loading}>暂无内容</div>
            )}
          </div>
        </div>
      ) : (
        <div
          id="reflow-paginate-root"
          onTouchStart={handleReaderTouchStart}
          onTouchEnd={handleReaderTouchEnd}
          onTouchCancel={handleReaderTouchCancel}
        >
          <div className="paginate-frame">
            {displayError ? (
              <div style={styles.errorCard}>
                <p style={styles.errorTitle}>无法打开 EPUB</p>
                <p style={styles.errorText}>{displayError}</p>
              </div>
            ) : readerLoading && !renderedChapter ? (
              <div style={styles.loading}>正在加载章节…</div>
            ) : renderedChapter ? (
              <>
                <div className="paginate-shell" ref={paginateScrollRef}>
                  <div className="paginate-page">
                    <div className="reader-body-content" />
                  </div>
                </div>
              </>
            ) : (
              <div style={styles.loading}>暂无内容</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  loading: {
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
    padding: LOADING_PADDING,
  },
  errorCard: {
    borderRadius: ERROR_CARD_BORDER_RADIUS,
    padding: ERROR_CARD_PADDING,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
  },
  errorTitle: {
    margin: `0 0 ${ERROR_TITLE_MARGIN_BOTTOM}px`,
    color: "rgba(255,255,255,0.96)",
    fontSize: ERROR_TITLE_FONT_SIZE,
    fontWeight: ERROR_TITLE_FONT_WEIGHT,
    textAlign: "center",
  },
  errorText: {
    margin: 0,
    color: "rgba(255,255,255,0.72)",
    lineHeight: ERROR_TEXT_LINE_HEIGHT,
    textAlign: "center",
    whiteSpace: "pre-wrap",
  },
};

declare global {
  interface Window {
    __myReaderToolsReadBinary?: (url: string) => Promise<Uint8Array>;
  }
}
