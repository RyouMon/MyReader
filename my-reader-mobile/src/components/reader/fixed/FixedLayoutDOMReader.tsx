"use dom";

import { BookReader, type ImageChapterData } from "my-reader-tools/rendition";
import { type TouchEvent as ReactTouchEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { flattenFixedToc } from "@/src/components/reader/reader-toc";
import type { ReaderState, ReaderTocItem } from "@/src/components/reader/types";
import type { ReadingLayout, ReaderTheme } from "@/src/store/app-store.types";

console.info("[mobile-pdf-dom] module:loaded");

const THEME_STYLES: Record<ReaderTheme, { background: string; foreground: string; muted: string }> = {
  paper: { background: "#f5efe6", foreground: "#2f261f", muted: "#6c6258" },
  light: { background: "#ffffff", foreground: "#222222", muted: "#6b7280" },
  green: { background: "#e8f0e4", foreground: "#253325", muted: "#5f7161" },
  dark: { background: "#111111", foreground: "rgba(255,255,255,0.92)", muted: "rgba(255,255,255,0.6)" },
};

type RenderedPage = {
  key: string;
  index: number;
  imageUrl: string;
};

type ReaderTouchSnapshot = {
  x: number;
  y: number;
  timestampMs: number;
};

const TAP_MAX_DRIFT = 12;
const TAP_MAX_DURATION_MS = 260;

export default function FixedLayoutDOMReader({
  bookBase64,
  format,
  initialPage,
  onStateChange,
  onTocReady,
  onDomProbe,
  onRequestClose,
  onToggleChrome,
  gotoPageCommand,
  readingLayout = "paginate",
  theme = "dark",
  brightness = 100,
  zoomScale = 1,
  onZoomScaleChange,
  contentInsetTop = 0,
  contentInsetBottom = 0,
  dom,
}: {
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
  onToggleChrome?: () => void;
  gotoPageCommand?: number;
  readingLayout?: ReadingLayout;
  theme?: ReaderTheme;
  brightness?: number;
  zoomScale?: number;
  onZoomScaleChange?: (scale: number) => void;
  contentInsetTop?: number;
  contentInsetBottom?: number;
  dom?: import("expo/dom").DOMProps;
}) {
  void onRequestClose;
  void dom;

  const readerRef = useRef<BookReader | null>(null);
  const onStateChangeRef = useRef(onStateChange);
  const onTocReadyRef = useRef(onTocReady);
  const onDomProbeRef = useRef(onDomProbe);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef(zoomScale);
  const readerTouchStartRef = useRef<ReaderTouchSnapshot | null>(null);
  const onToggleChromeRef = useRef(onToggleChrome);
  onStateChangeRef.current = onStateChange;
  onTocReadyRef.current = onTocReady;
  onDomProbeRef.current = onDomProbe;
  onToggleChromeRef.current = onToggleChrome;

  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const readyRef = useRef(false);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void onDomProbeRef.current({
      stage: "effect-mounted",
      detail: {
        format,
        hasBookBase64: Boolean(bookBase64),
      },
    });
    return () => {
      void onDomProbeRef.current({
        stage: "effect-unmounted",
        detail: { format },
      });
    };
  }, [bookBase64, format]);

  const reportState = useCallback(
    (page: number, total: number, reader: BookReader, err: string | null, isLoading: boolean) => {
      const progress = reader.getProgress();
      console.info("[mobile-pdf-dom] report-state", {
        ready: readyRef.current,
        page,
        total,
        progressPercent: Math.round(progress.fraction * 100),
        chapterTitle: progress.chapterTitle,
        isLoading,
        err,
      });
      onStateChangeRef.current({
        ready: readyRef.current,
        currentPage: page,
        totalPages: total,
        progress: Math.round(progress.fraction * 100),
        chapterTitle: progress.chapterTitle,
        loading: isLoading,
        error: err,
      });
    },
    [],
  );

  useEffect(() => {
    const encodedBook = bookBase64;
    if (!encodedBook || !format) return;

    let cancelled = false;
    const reader = new BookReader();
    readerRef.current = reader;

    console.info("[mobile-pdf-dom] init-effect:start", {
      format,
      initialPage: initialPage ?? 0,
      base64Length: bookBase64.length,
    });
    void onDomProbeRef.current({
      stage: "init-effect-start",
      detail: {
        format,
        initialPage: initialPage ?? 0,
        base64Length: encodedBook.length,
      },
    });

    async function init() {
      try {
        setLoading(true);
        setError(null);

        const base64 = encodedBook;
        if (!base64) {
          throw new Error("缺少书籍内容，无法初始化阅读器");
        }
        console.info("[mobile-pdf-dom] init:decode-base64:start", {
          format,
          base64Length: base64.length,
        });

        const binaryStr = atob(base64);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        console.info("[mobile-pdf-dom] init:decode-base64:done", {
          format,
          byteLength: bytes.byteLength,
        });
        void onDomProbeRef.current({
          stage: "base64-decoded",
          detail: {
            format,
            byteLength: bytes.byteLength,
          },
        });

        const book = await reader.init(bytes.buffer as ArrayBuffer, format, {
          initialOpenAnchor:
            initialPage != null && initialPage > 0
              ? { chapterIndex: initialPage }
              : undefined,
        });
        if (cancelled) return;

        console.info("[mobile-pdf-dom] init:reader-ready", {
          format,
          layoutMode: book.layoutMode,
          chapterCount: book.chapters.length,
          tocCount: book.toc.length,
          readerCurrentChapter: reader.curChapter,
        });
        await onDomProbeRef.current({
          stage: "reader-ready",
          detail: {
            format,
            layoutMode: book.layoutMode,
            chapterCount: book.chapters.length,
            tocCount: book.toc.length,
            readerCurrentChapter: reader.curChapter,
          },
        });

        readyRef.current = true;
        setTotalPages(book.chapters.length);
        setCurrentPage(reader.curChapter);

        const toc = flattenFixedToc(book.toc, book.chapters.length);
        console.info("[mobile-pdf-dom] init:flattened-toc", {
          sourceTocCount: book.toc.length,
          flattenedCount: toc.length,
          firstItems: toc.slice(0, 5),
        });
        await onTocReadyRef.current(toc);

        const pageImages: RenderedPage[] = [];
        for (let index = 0; index < book.chapters.length; index += 1) {
          const chapter = (await reader.getChapter(index)) as ImageChapterData;
          if (cancelled) return;
          pageImages.push({
            key: `${chapter.title || "page"}-${index + 1}`,
            index,
            imageUrl: chapter.imageUrl,
          });
        }

        setPages(pageImages);
        setLoading(false);
        reportState(reader.curChapter, book.chapters.length, reader, null, false);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[mobile-pdf-dom] init:failed", {
          format,
          initialPage: initialPage ?? 0,
          error: e,
        });
        await onDomProbeRef.current({
          stage: "init-failed",
          detail: {
            format,
            initialPage: initialPage ?? 0,
            message: msg,
          },
        });
        setError(msg);
        setLoading(false);
        onStateChangeRef.current({
          ready: false,
          currentPage: 0,
          totalPages: 0,
          progress: 0,
          chapterTitle: "",
          loading: false,
          error: msg,
        });
      }
    }

    void init();

    return () => {
      cancelled = true;
      console.info("[mobile-pdf-dom] init-effect:cleanup", {
        format,
        ready: readyRef.current,
      });
      reader.destroy();
      readerRef.current = null;
      readyRef.current = false;
    };
  }, [bookBase64, format, initialPage, reportState]);

  const gotoPage = useCallback(
    async (index: number) => {
      const reader = readerRef.current;
      if (!reader || !readyRef.current) {
        console.warn("[mobile-pdf-dom] goto-page:reader-not-ready", {
          index,
          hasReader: Boolean(reader),
          ready: readyRef.current,
        });
        return;
      }
      if (index < 0 || index >= totalPages) return;

      reader.gotoChapter(index);
      setCurrentPage(index);
      if (readingLayout === "scroll") {
        scrollRootRef.current?.querySelector(`[data-page-index='${index}']`)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
      reportState(index, totalPages, reader, null, false);
    },
    [reportState, totalPages, readingLayout],
  );

  useEffect(() => {
    if (
      gotoPageCommand != null &&
      gotoPageCommand >= 0 &&
      readyRef.current &&
      gotoPageCommand < totalPages
    ) {
      void gotoPage(gotoPageCommand);
    }
  }, [gotoPageCommand, totalPages, gotoPage]);

  useEffect(() => {
    if (readingLayout !== "scroll") return;
    const root = scrollRootRef.current;
    const reader = readerRef.current;
    if (!root || !reader) return;

    const onScroll = () => {
      const items = Array.from(root.querySelectorAll<HTMLElement>("[data-page-index]"));
      if (!items.length) return;
      const center = root.scrollTop + root.clientHeight / 2;
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const item of items) {
        const top = item.offsetTop;
        const mid = top + item.offsetHeight / 2;
        const distance = Math.abs(mid - center);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = Number(item.dataset.pageIndex ?? 0);
        }
      }
      if (!Number.isNaN(nearestIndex) && nearestIndex !== currentPage) {
        reader.gotoChapter(nearestIndex);
        setCurrentPage(nearestIndex);
        reportState(nearestIndex, totalPages, reader, null, false);
      }
    };

    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [currentPage, readingLayout, reportState, totalPages]);

  const themeStyle = useMemo(() => THEME_STYLES[theme], [theme]);

  const getDistance = useCallback((event: TouchEvent) => {
    if (event.touches.length < 2) return null;
    const [a, b] = Array.from(event.touches);
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const handleReaderTouchStart = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) {
      readerTouchStartRef.current = null;
      return;
    }
    readerTouchStartRef.current = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
      timestampMs: Date.now(),
    };
  }, []);

  const handleReaderTouchEnd = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const start = readerTouchStartRef.current;
    readerTouchStartRef.current = null;
    if (!start || event.changedTouches.length !== 1) return;
    if (pinchStartDistanceRef.current != null) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const durationMs = Date.now() - start.timestampMs;
    const isTapGesture =
      Math.abs(dx) <= TAP_MAX_DRIFT &&
      Math.abs(dy) <= TAP_MAX_DRIFT &&
      durationMs <= TAP_MAX_DURATION_MS;
    if (!isTapGesture) return;

    onToggleChromeRef.current?.();
  }, []);

  const handleReaderTouchCancel = useCallback(() => {
    readerTouchStartRef.current = null;
  }, []);

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return;

    const onTouchStart = (event: TouchEvent) => {
      const distance = getDistance(event);
      if (distance == null) return;
      pinchStartDistanceRef.current = distance;
      pinchStartScaleRef.current = zoomScale;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (pinchStartDistanceRef.current == null) return;
      const distance = getDistance(event);
      if (distance == null) return;
      event.preventDefault();
      const nextScale = Math.max(1, Math.min(3, pinchStartScaleRef.current * (distance / pinchStartDistanceRef.current)));
      onZoomScaleChange?.(Number(nextScale.toFixed(2)));
    };

    const onTouchEnd = () => {
      pinchStartDistanceRef.current = null;
    };

    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", onTouchEnd, { passive: true });
    root.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [getDistance, onZoomScaleChange, zoomScale]);

  if (error) {
    return (
      <div style={styles.centered}>
        <div style={styles.card}>
          <div style={styles.title}>无法打开 PDF</div>
          <div style={styles.errorText}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRootRef}
      onTouchStart={handleReaderTouchStart}
      onTouchEnd={handleReaderTouchEnd}
      onTouchCancel={handleReaderTouchCancel}
      style={{
        ...styles.container,
        background: themeStyle.background,
        color: themeStyle.foreground,
        filter: `brightness(${Math.max(0.2, brightness / 100)})`,
        overflowY: readingLayout === "scroll" ? "auto" : "hidden",
        justifyContent: readingLayout === "scroll" ? "flex-start" : "center",
        paddingTop: readingLayout === "paginate" ? `${contentInsetTop}px` : 0,
        paddingBottom: readingLayout === "paginate" ? `${contentInsetBottom}px` : 0,
        boxSizing: "border-box",
      }}
    >
      {loading ? (
        <div style={styles.centered}>
          <div style={{ ...styles.card, color: themeStyle.foreground }}>正在加载 PDF…</div>
        </div>
      ) : pages.length > 0 ? (
        readingLayout === "paginate" ? (
          <div style={styles.paginateWrap}>
            <img
              src={pages[currentPage]?.imageUrl}
              alt={`page-${currentPage + 1}`}
              style={{
                ...styles.image,
                transform: `scale(${zoomScale})`,
                transformOrigin: "center center",
              }}
            />
          </div>
        ) : (
          <div style={styles.scrollList}>
            {pages.map((page) => (
              <div key={page.key} data-page-index={page.index} style={styles.scrollPage}>
                <img
                  src={page.imageUrl}
                  alt={`page-${page.index + 1}`}
                  style={{
                    ...styles.image,
                    transform: `scale(${zoomScale})`,
                    transformOrigin: "center top",
                  }}
                />
                <div style={{ ...styles.pageMeta, color: themeStyle.muted }}>第 {page.index + 1} 页</div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div style={styles.centered}>
          <div style={{ ...styles.card, color: themeStyle.foreground }}>暂无可显示页面</div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    paddingTop: 72,
    paddingBottom: 132,
    boxSizing: "border-box",
  },
  paginateWrap: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    paddingLeft: 12,
    paddingRight: 12,
    boxSizing: "border-box",
  },
  scrollList: {
    width: "100%",
    minHeight: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 20,
    padding: "0 12px 0",
    boxSizing: "border-box",
  },
  scrollPage: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  pageMeta: {
    fontSize: 12,
  },
  centered: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    boxSizing: "border-box",
  },
  card: {
    color: "rgba(255,255,255,0.9)",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 16,
    padding: 16,
    maxWidth: 360,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    background: "transparent",
  },
};
