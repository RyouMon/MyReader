"use dom";

import {
  renderTextChapterPage,
  type LayoutConfig,
  type TextChapterData,
  type TextChapterPaginationResult,
} from "my-reader-tools/rendition";
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

type ReflowableDOMReaderProps = {
  bookBase64: string | null;
  format: string;
  initialPage?: number;
  onStateChange: (state: ReaderState) => Promise<void>;
  onTocReady: (toc: ReaderTocItem[]) => Promise<void>;
  onDomProbe: (event: {
    stage: string;
    detail?: Record<string, unknown> | null;
  }) => Promise<void>;
  onRequestClose: () => Promise<void>;
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
  dom?: import("expo/dom").DOMProps;
};

type RenderedChapter = {
  index: number;
  title: string;
  bodyHtml: string;
  cssText: string;
  text: string;
};

function base64ToArrayBuffer(b64: string): ArrayBuffer | null {
  try {
    const binaryStr = atob(b64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes.buffer;
  } catch {
    return null;
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
      filter: brightness(${Math.max(0.2, brightness / 100)});
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
      left: -200vw;
      top: 0;
      width: calc(100vw - ${paddingX * 2}px);
      height: calc(100dvh - ${paginateVerticalReserve}px);
      overflow: hidden;
      pointer-events: none;
      opacity: 0;
      box-sizing: border-box;
    }

    .reader-host {
      max-width: 820px;
      margin: 0 auto;
      width: 100%;
    }

    .reader-title {
      flex-shrink: 0;
      color: var(--reader-muted);
      font-size: 13px;
      margin: 0 0 16px;
      text-align: center;
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
      width: min(100%, 820px);
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
  bookBase64,
  format,
  initialPage,
  onStateChange,
  onTocReady,
  onDomProbe,
  onRequestClose,
  gotoPageCommand,
  readingLayout = "scroll",
  theme = "paper",
  fontSize = 18,
  lineHeight = 1.85,
  paddingX = 20,
  brightness = 100,
  contentInsetTop = 72,
  contentInsetBottom = 132,
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
  onStateChangeRef.current = onStateChange;
  onTocReadyRef.current = onTocReady;
  onDomProbeRef.current = onDomProbe;

  const readerLoadingRef = useRef(false);
  const readerErrorRef = useRef<string | null>(null);
  const scrollSnapRef = useRef({
    curChapter: 0,
    totalChapters: 0,
    ready: false,
    chapterTitle: "",
  });

  const paginateTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const renderPaginatedContentRef = useRef<
    (
      paginationResult: TextChapterPaginationResult | null,
      renderedChapter: RenderedChapter | null,
      pageIndexOverride?: number,
    ) => void
  >(() => {});

  const [pagination, setPagination] = useState<TextChapterPaginationResult | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);

  const buffer = useMemo((): ArrayBuffer | null => {
    if (!bookBase64) return null;
    return base64ToArrayBuffer(bookBase64);
  }, [bookBase64]);

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
    buffer,
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
    if (!bookBase64 || !format) return;
    void onDomProbeRef.current({
      stage: "reflow-init-start",
      detail: {
        format,
        initialPage: initialPage ?? 0,
        base64Length: bookBase64.length,
      },
    });
  }, [bookBase64, format, initialPage]);

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

  const handlePaginateTouchStart = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (readingLayout !== "paginate") return;
      if (e.touches.length !== 1) return;
      paginateTouchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    },
    [readingLayout],
  );

  const handlePaginateTouchEnd = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (readingLayout !== "paginate") return;
      const start = paginateTouchStartRef.current;
      paginateTouchStartRef.current = null;
      if (!start || e.changedTouches.length !== 1) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const minSwipe = 48;
      if (Math.abs(dx) < minSwipe) return;
      if (Math.abs(dy) > 72 && Math.abs(dy) > Math.abs(dx)) return;
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

  const handlePaginateTouchCancel = useCallback(() => {
    paginateTouchStartRef.current = null;
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
        progress: Math.round(readerProgress.fraction * 100),
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
        progress: Math.round(readerProgress.fraction * 100),
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
      const percent = Math.round(Math.max(base, whole) * 100);
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
        <div id="reflow-scroll-root" ref={scrollRootRef}>
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
                <p className="reader-title">{renderedChapter.title}</p>
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
          onTouchStart={handlePaginateTouchStart}
          onTouchEnd={handlePaginateTouchEnd}
          onTouchCancel={handlePaginateTouchCancel}
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
                <p className="reader-title">{renderedChapter.title}</p>
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
    padding: "24px 0",
  },
  errorCard: {
    borderRadius: 16,
    padding: 20,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
  },
  errorTitle: {
    margin: "0 0 12px",
    color: "rgba(255,255,255,0.96)",
    fontSize: 18,
    fontWeight: 700,
    textAlign: "center",
  },
  errorText: {
    margin: 0,
    color: "rgba(255,255,255,0.72)",
    lineHeight: 1.6,
    textAlign: "center",
    whiteSpace: "pre-wrap",
  },
};
