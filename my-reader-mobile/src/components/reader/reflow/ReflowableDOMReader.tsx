"use dom";

import { BookReader, type TextChapterData } from "my-reader-tools/rendition";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  dom?: import("expo/dom").DOMProps;
};

type RenderedChapter = {
  index: number;
  title: string;
  bodyHtml: string;
  cssText: string;
};

type PaginatedPage = {
  key: string;
  html: string;
};

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
) {
  const selected = getThemeVars(theme);

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
      overflow: hidden;
      box-sizing: border-box;
      padding: 72px ${paddingX}px 132px;
      display: flex;
      align-items: stretch;
      justify-content: center;
    }

    .reader-host {
      max-width: 820px;
      margin: 0 auto;
      width: 100%;
    }

    .reader-title {
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
      overflow: hidden;
      margin: 0 auto;
    }

    .paginate-scroll {
      width: 100%;
      height: 100%;
      overflow-x: auto;
      overflow-y: hidden;
      scroll-snap-type: x mandatory;
      display: flex;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }

    .paginate-scroll::-webkit-scrollbar {
      display: none;
    }

    .paginate-page {
      min-width: 100%;
      height: 100%;
      scroll-snap-align: start;
      overflow-y: auto;
      padding-right: 2px;
      box-sizing: border-box;
    }
  `;
}

function splitHtmlIntoPages(html: string): PaginatedPage[] {
  const rawSections = html
    .split(/(?=<h[1-6][\s>])|(?=<p[\s>])|(?=<div[\s>])|(?=<section[\s>])|(?=<blockquote[\s>])/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const segments = rawSections.length > 0 ? rawSections : [html];
  const pages: PaginatedPage[] = [];
  let bucket = "";
  let charCount = 0;

  segments.forEach((segment, index) => {
    const plainLength = segment.replace(/<[^>]+>/g, "").trim().length;
    if (bucket && charCount + plainLength > 900) {
      pages.push({ key: `page-${pages.length + 1}`, html: bucket });
      bucket = "";
      charCount = 0;
    }
    bucket += segment;
    charCount += plainLength;

    if (index === segments.length - 1 && bucket) {
      pages.push({ key: `page-${pages.length + 1}`, html: bucket });
    }
  });

  return pages.length > 0 ? pages : [{ key: "page-1", html }];
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
  dom,
}: ReflowableDOMReaderProps) {
  void onRequestClose;
  void dom;

  const readerRef = useRef<BookReader | null>(null);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const paginateScrollRef = useRef<HTMLDivElement | null>(null);
  const readyRef = useRef(false);
  const onStateChangeRef = useRef(onStateChange);
  const onTocReadyRef = useRef(onTocReady);
  const onDomProbeRef = useRef(onDomProbe);
  onStateChangeRef.current = onStateChange;
  onTocReadyRef.current = onTocReady;
  onDomProbeRef.current = onDomProbe;
  const [chapter, setChapter] = useState<RenderedChapter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [totalChapters, setTotalChapters] = useState(0);
  const [paginatePages, setPaginatePages] = useState<PaginatedPage[]>([]);

  const reportState = useCallback(
    (chapterIndex: number, total: number, reader: BookReader, err: string | null, isLoading: boolean, progressOverride?: number) => {
      const progress = reader.getProgress();
      onStateChangeRef.current({
        ready: readyRef.current,
        currentPage: chapterIndex,
        totalPages: total,
        progress: progressOverride ?? Math.round(progress.fraction * 100),
        chapterTitle: progress.chapterTitle,
        loading: isLoading,
        error: err,
      });
    },
    []
  );

  const renderChapter = useCallback(async (index: number) => {
    const reader = readerRef.current;
    if (!reader || !readyRef.current) {
      return;
    }

    setLoading(true);
    try {
      reader.gotoChapter(index);
      const loaded = (await reader.getChapter(index)) as TextChapterData;
      setChapter({
        index,
        title: loaded.title,
        bodyHtml: loaded.bodyHtml,
        cssText: loaded.cssText,
      });
      setPaginatePages(splitHtmlIntoPages(loaded.bodyHtml));
      setCurrentChapter(index);
      setLoading(false);
      reportState(index, reader.totalChapters, reader, null, false);
      requestAnimationFrame(() => {
        if (readingLayout === "paginate") {
          paginateScrollRef.current?.scrollTo({ left: 0, behavior: "auto" });
          return;
        }
        scrollRootRef.current?.scrollTo({ top: 0, behavior: "auto" });
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setLoading(false);
      reportState(index, reader.totalChapters, reader, msg, false);
    }
  }, [reportState, readingLayout]);

  useEffect(() => {
    const encodedBook = bookBase64;
    if (!encodedBook || !format) return;

    let cancelled = false;
    const reader = new BookReader();
    readerRef.current = reader;
    void onDomProbeRef.current({
      stage: "reflow-init-start",
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

        const encodedBook = bookBase64;
        const binaryStr = atob(encodedBook!);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        const book = await reader.init(bytes.buffer as ArrayBuffer, format, {
          initialOpenAnchor:
            initialPage != null && initialPage > 0
              ? { chapterIndex: initialPage }
              : undefined,
        });
        if (cancelled) return;

        readyRef.current = true;
        setTotalChapters(book.chapters.length);

        const toc = flattenReflowToc(book.toc);
        await onTocReadyRef.current(toc);

        const initialIndex = Math.max(0, Math.min(reader.curChapter, Math.max(0, book.chapters.length - 1)));
        await renderChapter(initialIndex);

        void onDomProbeRef.current({
          stage: "reflow-reader-ready",
          detail: {
            chapterCount: book.chapters.length,
            tocCount: toc.length,
            initialIndex,
          },
        });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setLoading(false);
        await onStateChangeRef.current({
          ready: false,
          currentPage: 0,
          totalPages: 0,
          progress: 0,
          chapterTitle: "",
          loading: false,
          error: msg,
        });
        void onDomProbeRef.current({
          stage: "reflow-init-failed",
          detail: { message: msg },
        });
      }
    }

    void init();

    return () => {
      cancelled = true;
      reader.destroy();
      readerRef.current = null;
      readyRef.current = false;
    };
  }, [bookBase64, format, initialPage, renderChapter]);

  useEffect(() => {
    if (gotoPageCommand == null || gotoPageCommand < 0 || !readyRef.current) {
      return;
    }
    void renderChapter(gotoPageCommand);
  }, [gotoPageCommand, renderChapter]);

  useEffect(() => {
    const root = scrollRootRef.current;
    const reader = readerRef.current;
    if (!root || !reader) {
      return;
    }

    const onScroll = () => {
      const maxScroll = Math.max(1, root.scrollHeight - root.clientHeight);
      const fraction = Math.max(0, Math.min(1, root.scrollTop / maxScroll));
      const base = totalChapters > 0 ? currentChapter / totalChapters : 0;
      const whole = totalChapters > 0 ? (currentChapter + fraction) / totalChapters : fraction;
      const percent = Math.round(Math.max(base, whole) * 100);
      reportState(currentChapter, Math.max(1, totalChapters), reader, null, false, percent);
    };

    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [currentChapter, reportState, totalChapters]);

  const scopedCss = useMemo(() => {
    if (!chapter?.cssText) return "";
    return chapter.cssText;
  }, [chapter?.cssText]);

  const baseCss = useMemo(
    () => buildBaseReaderCss(theme, fontSize, lineHeight, paddingX, brightness),
    [theme, fontSize, lineHeight, paddingX, brightness],
  );

  useEffect(() => {
    if (readingLayout !== "paginate") return;
    const root = paginateScrollRef.current;
    const reader = readerRef.current;
    if (!root || !reader) return;

    const onScroll = () => {
      const pageWidth = Math.max(1, root.clientWidth);
      const index = Math.max(0, Math.min(paginatePages.length - 1, Math.round(root.scrollLeft / pageWidth)));
      const percent = totalChapters > 0
        ? Math.round(((currentChapter + index / Math.max(1, paginatePages.length)) / totalChapters) * 100)
        : 0;
      reportState(currentChapter, Math.max(1, totalChapters), reader, null, false, percent);
    };

    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [currentChapter, paginatePages.length, readingLayout, reportState, totalChapters]);

  return (
    <>
      <style>{baseCss}</style>
      {scopedCss ? <style>{scopedCss}</style> : null}
      {readingLayout === "scroll" ? (
        <div id="reflow-scroll-root" ref={scrollRootRef}>
          <div className="reader-host">
            {error ? (
              <div style={styles.errorCard}>
                <p style={styles.errorTitle}>无法打开 EPUB</p>
                <p style={styles.errorText}>{error}</p>
              </div>
            ) : loading && !chapter ? (
              <div style={styles.loading}>正在加载章节…</div>
            ) : chapter ? (
              <>
                <p className="reader-title">{chapter.title}</p>
                <div className="reader-body-content" ref={(node) => {
                  if (node) node.innerHTML = chapter.bodyHtml;
                }} />
              </>
            ) : (
              <div style={styles.loading}>暂无内容</div>
            )}
          </div>
        </div>
      ) : (
        <div id="reflow-paginate-root">
          <div className="paginate-frame">
            {error ? (
              <div style={styles.errorCard}>
                <p style={styles.errorTitle}>无法打开 EPUB</p>
                <p style={styles.errorText}>{error}</p>
              </div>
            ) : loading && !chapter ? (
              <div style={styles.loading}>正在加载章节…</div>
            ) : chapter ? (
              <>
                <p className="reader-title">{chapter.title}</p>
                <div className="paginate-scroll" ref={paginateScrollRef}>
                  {paginatePages.map((page) => (
                    <div key={page.key} className="paginate-page">
                      <div
                        className="reader-body-content"
                        ref={(node) => {
                          if (node) node.innerHTML = page.html;
                        }}
                      />
                    </div>
                  ))}
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

const styles: Record<string, React.CSSProperties> = {
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
