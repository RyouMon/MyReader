"use dom";

import { BookReader } from "my-reader-tools/rendition/BookReader";
import type { ImageChapterData } from "my-reader-tools/rendition/types";
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

  void onDomProbe({
    stage: "component-render",
    detail: {
      format,
      hasBookBase64: Boolean(bookBase64),
      base64Length: bookBase64?.length ?? 0,
      initialPage: initialPage ?? 0,
      gotoPageCommand: gotoPageCommand ?? null,
    },
  });

  const readerRef = useRef<BookReader | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const readyRef = useRef(false);

  useEffect(() => {
    void onDomProbe({
      stage: "effect-mounted",
      detail: {
        format,
        hasBookBase64: Boolean(bookBase64),
      },
    });
    return () => {
      void onDomProbe({
        stage: "effect-unmounted",
        detail: { format },
      });
    };
  }, [bookBase64, format, onDomProbe]);

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
      onStateChange({
        ready: readyRef.current,
        currentPage: page,
        totalPages: total,
        progress: Math.round(progress.fraction * 100),
        chapterTitle: progress.chapterTitle,
        loading: isLoading,
        error: err,
      });
    },
    [onStateChange],
  );

  useEffect(() => {
    if (!bookBase64 || !format) return;

    let cancelled = false;
    const reader = new BookReader();
    readerRef.current = reader;

    console.info("[mobile-pdf-dom] init-effect:start", {
      format,
      initialPage: initialPage ?? 0,
      base64Length: bookBase64.length,
    });
    void onDomProbe({
      stage: "init-effect-start",
      detail: {
        format,
        initialPage: initialPage ?? 0,
        base64Length: bookBase64.length,
      },
    });

    async function init() {
      try {
        setLoading(true);
        setError(null);

        console.info("[mobile-pdf-dom] init:decode-base64:start", {
          format,
          base64Length: bookBase64?.length ?? 0,
        });

        const binaryStr = atob(bookBase64!);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        console.info("[mobile-pdf-dom] init:decode-base64:done", {
          format,
          byteLength: bytes.byteLength,
        });
        void onDomProbe({
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
        void onDomProbe({
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
        onTocReady(toc);

        const ch = (await reader.getChapter(reader.curChapter)) as ImageChapterData;
        if (cancelled) return;

        console.info("[mobile-pdf-dom] init:first-chapter-ready", {
          chapterIndex: reader.curChapter,
          chapterType: ch?.type,
          imageUrlPrefix: ch?.imageUrl?.slice(0, 64) ?? null,
        });
        void onDomProbe({
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
        void onDomProbe({
          stage: "init-failed",
          detail: {
            format,
            initialPage: initialPage ?? 0,
            message: msg,
          },
        });
        setError(msg);
        setLoading(false);
        onStateChange({
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

    init();

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
  }, [bookBase64, format, initialPage, onStateChange, onTocReady, onDomProbe, reportState]);

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
      if (index < 0 || index >= totalPages) {
        console.warn("[mobile-pdf-dom] goto-page:out-of-range", {
          index,
          totalPages,
        });
        return;
      }

      setLoading(true);
      try {
        console.info("[mobile-pdf-dom] goto-page:start", {
          from: currentPage,
          to: index,
          totalPages,
        });
        reader.gotoChapter(index);
        const ch = (await reader.getChapter(index)) as ImageChapterData;
        console.info("[mobile-pdf-dom] goto-page:chapter-ready", {
          index,
          chapterType: ch?.type,
          imageUrlPrefix: ch?.imageUrl?.slice(0, 64) ?? null,
        });
        setImageUrl(ch.imageUrl);
        setCurrentPage(index);
        setLoading(false);
        reportState(index, totalPages, reader, null, false);
      } catch (e) {
        console.error("[mobile-pdf-dom] goto-page:failed", {
          index,
          totalPages,
          error: e,
        });
        setLoading(false);
      }
    },
    [currentPage, totalPages, reportState],
  );

  useEffect(() => {
    if (gotoPageCommand != null && gotoPageCommand >= 0 && readyRef.current) {
      console.info("[mobile-pdf-dom] goto-page-command", {
        gotoPageCommand,
      });
      gotoPage(gotoPageCommand);
    }
  }, [gotoPageCommand, gotoPage]);

  const handleTap = useCallback(
    (
      e:
        | React.MouseEvent<HTMLDivElement>
        | React.MouseEvent<HTMLButtonElement>
    ) => {
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      const ratio = x / width;

      if (ratio < 0.3) {
        if (currentPage > 0) gotoPage(currentPage - 1);
      } else if (ratio > 0.7) {
        if (currentPage < totalPages - 1) gotoPage(currentPage + 1);
      }
    },
    [currentPage, totalPages, gotoPage],
  );

  return (
    <div style={styles.container}>
      {error ? (
        <div style={styles.errorContainer}>
          <div style={styles.errorCard}>
            <p style={styles.errorTitle}>无法渲染</p>
            <p style={styles.errorText}>{error}</p>
          </div>
        </div>
      ) : imageUrl ? (
        <button
          type="button"
          style={styles.imageButton}
          onClick={handleTap}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              handleTap(e as unknown as React.MouseEvent<HTMLDivElement>);
            }
          }}
        >
          <img
            src={imageUrl}
            alt={`Page ${currentPage + 1}`}
            style={styles.pageImage}
            draggable={false}
          />
        </button>
      ) : loading ? (
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
        </div>
      ) : null}
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
    backgroundColor: "#111",
    overflow: "hidden",
    userSelect: "none",
    WebkitUserSelect: "none",
  },
  imageContainer: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  imageButton: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
    border: "none",
    background: "transparent",
  },
  pageImage: {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
  },
  loadingContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid rgba(255,255,255,0.15)",
    borderTopColor: "rgba(255,255,255,0.7)",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  errorContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
    minHeight: "100vh",
    padding: 24,
    boxSizing: "border-box",
  },
  errorCard: {
    maxWidth: 400,
    width: "100%",
    padding: "22px 20px",
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
  },
  errorTitle: {
    color: "rgba(255,255,255,0.96)",
    fontSize: 16,
    fontWeight: 700,
    textAlign: "center" as const,
    margin: "0 0 10px 0",
  },
  errorText: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    textAlign: "center" as const,
    lineHeight: 1.65,
    margin: 0,
  },
};
