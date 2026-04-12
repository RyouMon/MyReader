"use dom";

import { BookReader, type ImageChapterData } from "my-reader-tools/rendition";
import { useCallback, useEffect, useRef, useState } from "react";

import { flattenFixedToc } from "@/src/components/reader/reader-toc";
import type { ReaderState, ReaderTocItem } from "@/src/components/reader/types";

console.info("[mobile-pdf-dom] module:loaded");

export default function FixedLayoutDOMReader({
  bookBase64,
  format,
  initialPage,
  onStateChange,
  onTocReady,
  onDomProbe,
  onRequestClose,
  gotoPageCommand,
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
  gotoPageCommand?: number;
  dom?: import("expo/dom").DOMProps;
}) {
  void onRequestClose;
  void dom;

  const readerRef = useRef<BookReader | null>(null);
  const onStateChangeRef = useRef(onStateChange);
  const onTocReadyRef = useRef(onTocReady);
  const onDomProbeRef = useRef(onDomProbe);
  onStateChangeRef.current = onStateChange;
  onTocReadyRef.current = onTocReady;
  onDomProbeRef.current = onDomProbe;

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const readyRef = useRef(false);

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

        const ch = (await reader.getChapter(reader.curChapter)) as ImageChapterData;
        if (cancelled) return;

        console.info("[mobile-pdf-dom] init:first-chapter-ready", {
          chapterIndex: reader.curChapter,
          chapterType: ch?.type,
          imageUrlPrefix: ch?.imageUrl?.slice(0, 64) ?? null,
        });
        await onDomProbeRef.current({
          stage: "first-chapter-ready",
          detail: {
            chapterIndex: reader.curChapter,
            chapterType: ch?.type,
            hasImageUrl: Boolean(ch?.imageUrl),
          },
        });

        setImageUrl(ch.imageUrl);
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
      const ch = (await reader.getChapter(index)) as ImageChapterData;
      setCurrentPage(index);
      setImageUrl(ch.imageUrl);
      reportState(index, totalPages, reader, null, false);
    },
    [reportState, totalPages],
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
    <div style={styles.container}>
      {loading ? (
        <div style={styles.centered}>
          <div style={styles.card}>正在加载 PDF…</div>
        </div>
      ) : imageUrl ? (
        <img
          src={imageUrl}
          alt={`page-${currentPage + 1}`}
          style={styles.image}
        />
      ) : (
        <div style={styles.centered}>
          <div style={styles.card}>暂无可显示页面</div>
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
    justifyContent: "center",
    background: "#111",
    overflow: "hidden",
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
    background: "#111",
  },
};
