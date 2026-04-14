import { BookReader, type ImageChapterData } from "my-reader-tools/rendition";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FlatList } from "react-native";
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { flattenFixedToc } from "@/src/components/reader/reader-toc";
import type { ReaderState, ReaderTocItem } from "@/src/components/reader/types";

import { FixedPagerView } from "./FixedPagerView";
import { FixedScrollView } from "./FixedScrollView";
import { PageCell } from "./PageCell";
import { resolveImageUriForNative } from "./resolveDisplayUri";
import { useFixedReaderGestures } from "./useFixedReaderGestures";

export type MobileFixedNavigationMode = "horizontal" | "vertical";

type MobileFixedReaderProps = {
  /** Local `file:` URI or path readable by my-reader-tools `pathIO` (e.g. PDF/CBZ file). */
  bookFilePath: string | null;
  format: string;
  initialPage?: number;
  onStateChange: (state: ReaderState) => Promise<void>;
  onTocReady: (toc: ReaderTocItem[]) => Promise<void>;
  onRequestClose: () => Promise<void>;
  onToggleChrome?: () => void;
  gotoPageCommand?: number;
  navigationMode?: MobileFixedNavigationMode;
  zoomScale?: number;
  brightness?: number;
  pinchZoomEnabled?: boolean;
  onZoomScaleChange?: (scale: number) => void;
  contentInsetTop?: number;
  contentInsetBottom?: number;
};

function FixedPageLoader({
  pageIndex,
  readerRef,
  width,
  height,
  scale,
  brightness,
  insetTop,
  insetBottom,
}: {
  pageIndex: number;
  readerRef: React.MutableRefObject<BookReader | null>;
  width: number;
  height: number;
  scale: number;
  brightness: number;
  insetTop: number;
  insetBottom: number;
}) {
  const [uri, setUri] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const reader = readerRef.current;
    if (!reader?.ready) return;

    (async () => {
      try {
        const ch = (await reader.getChapter(pageIndex)) as ImageChapterData;
        const display = await resolveImageUriForNative(ch.imageUrl);
        if (!cancelled) {
          setUri(display);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e));
          setUri(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pageIndex, readerRef]);

  if (err) {
    return (
      <View style={[styles.pageFallback, { width, height }]}> 
        <View style={styles.pageErrCard}>
          <Text style={styles.pageErr} numberOfLines={6}>
            {err}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="bg-[#111]" style={{ width, height }}>
      <View
        style={[
          styles.pageCanvas,
          {
            width,
            height,
            opacity: brightness / 100,
            paddingTop: insetTop,
            paddingBottom: insetBottom,
          },
        ]}
      >
        <PageCell uri={uri} loading={!uri} width={width} height={Math.max(120, height - insetTop - insetBottom)} scale={scale} />
      </View>
    </View>
  );
}

export default function MobileFixedReader({
  bookFilePath,
  format,
  initialPage = 0,
  onStateChange,
  onTocReady,
  onRequestClose: _onRequestClose,
  onToggleChrome,
  gotoPageCommand,
  navigationMode = "horizontal",
  zoomScale = 1,
  brightness = 100,
  pinchZoomEnabled = true,
  onZoomScaleChange,
  contentInsetTop = 0,
  contentInsetBottom = 0,
}: MobileFixedReaderProps) {
  const readerRef = useRef<BookReader | null>(null);
  const pagerRef = useRef<FlatList<number>>(null);
  const readyRef = useRef(false);
  const onStateChangeRef = useRef(onStateChange);
  const onTocReadyRef = useRef(onTocReady);
  onStateChangeRef.current = onStateChange;
  onTocReadyRef.current = onTocReady;

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookEpoch, setBookEpoch] = useState(0);

  const reportState = useCallback(
    (page: number, total: number, reader: BookReader, err: string | null, isLoading: boolean) => {
      const progress = reader.getProgress();
      void onStateChangeRef.current({
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
    if (!bookFilePath || !format) return;

    let cancelled = false;
    const reader = new BookReader();
    readerRef.current = reader;

    async function init() {
      try {
        setLoading(true);
        setError(null);

        const book = await reader.init(
          { filePath: bookFilePath },
          format,
          {
            initialOpenAnchor:
              initialPage != null && initialPage > 0
                ? { chapterIndex: initialPage }
                : undefined,
          },
        );
        if (cancelled) return;

        readyRef.current = true;
        const n = book.chapters.length;
        setTotalPages(n);
        setCurrentPage(reader.curChapter);
        setBookEpoch((e) => e + 1);

        const toc = flattenFixedToc(book.toc, n);
        await onTocReadyRef.current(toc);

        setLoading(false);
        reportState(reader.curChapter, n, reader, null, false);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setLoading(false);
        readyRef.current = false;
        void onStateChangeRef.current({
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
      reader.destroy();
      readerRef.current = null;
      readyRef.current = false;
    };
  }, [bookFilePath, format, initialPage, reportState]);

  const goToPage = useCallback(
    (index: number) => {
      const reader = readerRef.current;
      if (!reader || !readyRef.current) return;
      if (index < 0 || index >= totalPages) return;

      reader.gotoChapter(index);
      setCurrentPage(index);
      pagerRef.current?.scrollToIndex({ index, animated: true });
      reportState(index, totalPages, reader, null, false);
    },
    [totalPages, reportState],
  );

  useEffect(() => {
    if (
      gotoPageCommand != null &&
      gotoPageCommand >= 0 &&
      readyRef.current &&
      gotoPageCommand < totalPages
    ) {
      goToPage(gotoPageCommand);
    }
  }, [gotoPageCommand, totalPages, goToPage]);

  const onPagerIndexChange = useCallback(
    (index: number) => {
      const reader = readerRef.current;
      if (!reader || !readyRef.current) return;
      reader.gotoChapter(index);
      setCurrentPage(index);
      reportState(index, totalPages, reader, null, false);
    },
    [totalPages, reportState],
  );

  const renderPage = useCallback(
    (index: number) => (
      <FixedPageLoader
        pageIndex={index}
        readerRef={readerRef}
        width={screenWidth}
        height={screenHeight}
        scale={zoomScale}
        brightness={brightness}
        insetTop={navigationMode === "horizontal" ? contentInsetTop : 0}
        insetBottom={navigationMode === "horizontal" ? contentInsetBottom : 0}
      />
    ),
    [screenWidth, screenHeight, zoomScale, brightness, navigationMode, contentInsetTop, contentInsetBottom],
  );

  const { pinchPanHandlers, listTouchHandlers } = useFixedReaderGestures({
    pinchZoomEnabled,
    zoomScale,
    onZoomScaleChange,
    navigationMode,
    screenWidth,
    currentPage,
    totalPages,
    goToPage,
    onToggleChrome,
  });

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-[#111] px-7" style={{ width: screenWidth, height: screenHeight }}>
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>无法打开</Text>
          <Text style={styles.errText}>{error}</Text>
        </View>
      </View>
    );
  }

  const listKey = `${bookEpoch}-${totalPages}-${navigationMode}-${brightness}`;

  return (
    <View style={styles.container}>
      {totalPages > 0 && !loading ? (
        <View style={{ flex: 1 }} {...pinchPanHandlers}>
          {navigationMode === "horizontal" ? (
            <FixedPagerView
              key={listKey}
              ref={pagerRef}
              width={screenWidth}
              height={screenHeight}
              totalPages={totalPages}
              initialIndex={currentPage}
              pageIndex={currentPage}
              onPageIndexChange={onPagerIndexChange}
              renderPage={renderPage}
              onTouchStart={listTouchHandlers.onTouchStart}
              onTouchEnd={listTouchHandlers.onTouchEnd}
              onTouchCancel={listTouchHandlers.onTouchCancel}
            />
          ) : (
            <FixedScrollView
              key={listKey}
              ref={pagerRef}
              width={screenWidth}
              height={screenHeight}
              totalPages={totalPages}
              initialIndex={currentPage}
              pageIndex={currentPage}
              onPageIndexChange={onPagerIndexChange}
              renderPage={renderPage}
              onTouchStart={listTouchHandlers.onTouchStart}
              onTouchEnd={listTouchHandlers.onTouchEnd}
              onTouchCancel={listTouchHandlers.onTouchCancel}
            />
          )}
        </View>
      ) : (
        <View className="flex-1 items-center justify-center bg-[#111]" style={{ width: screenWidth, height: screenHeight }}>
          <ActivityIndicator size="large" color="rgba(255,255,255,0.7)" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111",
  },
  errorCard: {
    maxWidth: 400,
    width: "100%",
    paddingVertical: 22,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
  },
  errorTitle: {
    color: "rgba(255,255,255,0.96)",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
  },
  errText: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  pageFallback: {
    flex: 1,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  pageCanvas: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pageErrCard: {
    maxWidth: 320,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  pageErr: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  tapEdge: {
    position: "absolute",
    top: 0,
    bottom: 0,
  },
});

