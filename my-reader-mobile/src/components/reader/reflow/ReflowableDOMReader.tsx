"use dom";

import { BookReader, type TextChapterData } from "my-reader-tools/rendition";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { flattenReflowToc } from "@/src/components/reader/reader-toc";
import type { ReaderState, ReaderTocItem } from "@/src/components/reader/types";

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
  dom?: import("expo/dom").DOMProps;
};

type RenderedChapter = {
  index: number;
  title: string;
  bodyHtml: string;
  cssText: string;
};

const BASE_READER_CSS = `
  :root {
    color-scheme: dark;
    --reader-bg: #111111;
    --reader-text: rgba(255,255,255,0.92);
    --reader-muted: rgba(255,255,255,0.64);
    --reader-link: #d9a066;
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
  }

  #reflow-scroll-root {
    height: 100vh;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    padding: 24px 20px 40px;
    box-sizing: border-box;
  }

  .reader-host {
    max-width: 820px;
    margin: 0 auto;
  }

  .reader-title {
    color: var(--reader-muted);
    font-size: 13px;
    margin: 0 0 16px;
    text-align: center;
  }

  .reader-body-content {
    color: var(--reader-text);
    font-size: 18px;
    line-height: 1.85;
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
`;

export default function ReflowableDOMReader({
  bookBase64,
  format,
  initialPage,
  onStateChange,
  onTocReady,
  onDomProbe,
  onRequestClose,
  gotoPageCommand,
  dom,
}: ReflowableDOMReaderProps) {
  void onRequestClose;
  void dom;

  const readerRef = useRef<BookReader | null>(null);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
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
      setCurrentChapter(index);
      setLoading(false);
      reportState(index, reader.totalChapters, reader, null, false);
      requestAnimationFrame(() => {
        scrollRootRef.current?.scrollTo({ top: 0, behavior: "auto" });
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setLoading(false);
      reportState(index, reader.totalChapters, reader, msg, false);
    }
  }, [reportState]);

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

  return (
    <>
      <style>{BASE_READER_CSS}</style>
      {scopedCss ? <style>{scopedCss}</style> : null}
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
              <div className="reader-body-content" dangerouslySetInnerHTML={{ __html: chapter.bodyHtml }} />
            </>
          ) : (
            <div style={styles.loading}>暂无内容</div>
          )}
        </div>
      </div>
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
