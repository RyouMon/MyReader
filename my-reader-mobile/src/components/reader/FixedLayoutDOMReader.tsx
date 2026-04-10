"use dom";

import { BookReader } from "my-reader-tools/rendition/BookReader";
import type { ImageChapterData } from "my-reader-tools/rendition/types";
import { useCallback, useEffect, useRef, useState } from "react";

import { flattenFixedToc } from "@/src/components/reader/reader-toc";
import type { ReaderState, ReaderTocItem } from "@/src/components/reader/types";


export default function FixedLayoutDOMReader({
  bookBase64,
  format,
  initialPage,
  onStateChange,
  onTocReady,
  onRequestClose,
  gotoPageCommand,
  dom,
}: {
  bookBase64: string | null;
  format: string;
  initialPage?: number;
  onStateChange: (state: ReaderState) => Promise<void>;
  onTocReady: (toc: ReaderTocItem[]) => Promise<void>;
  onRequestClose: () => Promise<void>;
  gotoPageCommand?: number;
  dom?: import("expo/dom").DOMProps;
}) {
  void onRequestClose;
  void dom;

  const readerRef = useRef<BookReader | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const readyRef = useRef(false);

  const reportState = useCallback(
    (page: number, total: number, reader: BookReader, err: string | null, isLoading: boolean) => {
      const progress = reader.getProgress();
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

    async function init() {
      try {
        setLoading(true);
        setError(null);

        const binaryStr = atob(bookBase64!);
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
        setTotalPages(book.chapters.length);
        setCurrentPage(reader.curChapter);

        const toc = flattenFixedToc(book.toc, book.chapters.length);
        onTocReady(toc);

        const ch = (await reader.getChapter(reader.curChapter)) as ImageChapterData;
        if (cancelled) return;

        setImageUrl(ch.imageUrl);
        setLoading(false);
        reportState(reader.curChapter, book.chapters.length, reader, null, false);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
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
      reader.destroy();
      readerRef.current = null;
      readyRef.current = false;
    };
  }, [bookBase64, format]);

  const gotoPage = useCallback(
    async (index: number) => {
      const reader = readerRef.current;
      if (!reader || !readyRef.current) return;
      if (index < 0 || index >= totalPages) return;

      setLoading(true);
      try {
        reader.gotoChapter(index);
        const ch = (await reader.getChapter(index)) as ImageChapterData;
        setImageUrl(ch.imageUrl);
        setCurrentPage(index);
        setLoading(false);
        reportState(index, totalPages, reader, null, false);
      } catch (e) {
        setLoading(false);
      }
    },
    [totalPages, reportState],
  );

  useEffect(() => {
    if (gotoPageCommand != null && gotoPageCommand >= 0 && readyRef.current) {
      gotoPage(gotoPageCommand);
    }
  }, [gotoPageCommand, gotoPage]);

  const handleTap = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
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
        <div style={styles.imageContainer} onClick={handleTap}>
          <img
            src={imageUrl}
            alt={`Page ${currentPage + 1}`}
            style={styles.pageImage}
            draggable={false}
          />
        </div>
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
