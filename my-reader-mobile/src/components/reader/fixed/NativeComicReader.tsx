import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FlatList } from "react-native";
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { READER_CHROME, READER_FIXED } from "@/src/design/reader-tokens";

import { flattenFixedToc } from "@/src/components/reader/reader-toc";
import type { ReaderState, ReaderTocItem } from "@/src/components/reader/types";

import { FixedPagerView } from "./FixedPagerView";
import { FixedScrollView } from "./FixedScrollView";
import { PageCell } from "./PageCell";
import {
  disposeNativeComicDocument,
  prepareCbzDocument,
  type NativeComicDocument,
} from "@/src/components/reader/native-comic-document";

import { useFixedReaderGestures } from "./useFixedReaderGestures";

export type MobileFixedNavigationMode = "horizontal" | "vertical";

type NativeComicReaderProps = {
  archiveUri?: string | null;
  archiveFingerprint?: string | null;
  archiveOwned?: boolean;
  bookBytes: Uint8Array | null;
  bookId: number;
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

function buildFingerprint(bytes: Uint8Array) {
  const sampleSize = Math.min(bytes.length, 4096);
  let hash = 2166136261;
  for (let i = 0; i < sampleSize; i++) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `${bytes.length.toString(16)}-${(hash >>> 0).toString(16)}`;
}

function ComicPageLoader({
  uri,
  width,
  height,
  scale,
  brightness,
  insetTop,
  insetBottom,
}: {
  uri: string | null;
  width: number;
  height: number;
  scale: number;
  brightness: number;
  insetTop: number;
  insetBottom: number;
}) {
  return (
    <View style={{ width, height, backgroundColor: READER_FIXED.canvasBg }}>
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
        <PageCell
          uri={uri}
          loading={!uri}
          width={width}
          height={Math.max(120, height - insetTop - insetBottom)}
          scale={scale}
        />
      </View>
    </View>
  );
}

export default function NativeComicReader({
  archiveUri = null,
  archiveFingerprint = null,
  archiveOwned = false,
  bookBytes,
  bookId,
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
}: NativeComicReaderProps) {
  const pagerRef = useRef<FlatList<number>>(null);
  const readyRef = useRef(false);
  const documentRef = useRef<NativeComicDocument | null>(null);
  const onStateChangeRef = useRef(onStateChange);
  const onTocReadyRef = useRef(onTocReady);
  onStateChangeRef.current = onStateChange;
  onTocReadyRef.current = onTocReady;

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [pageUris, setPageUris] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookEpoch, setBookEpoch] = useState(0);

  const reportState = useCallback(
    (page: number, total: number, err: string | null, isLoading: boolean) => {
      const progress = total > 1 ? page / Math.max(1, total - 1) : 0;
      void onStateChangeRef.current({
        ready: readyRef.current,
        currentPage: page,
        totalPages: total,
        progress: Math.round(progress * 100),
        chapterTitle: total > 0 ? `第 ${page + 1} 页` : "",
        loading: isLoading,
        error: err,
        canGoPrev: page > 0,
        canGoNext: page < total - 1,
      });
    },
    [],
  );

  useEffect(() => {
    if (!format) return;
    if (!archiveUri && !bookBytes) return;

    let cancelled = false;
    const fingerprint = archiveFingerprint ?? (bookBytes ? buildFingerprint(bookBytes) : null);

    async function init() {
      try {
        setLoading(true);
        setError(null);

        if (!fingerprint) {
          throw new Error("缺少漫画文件指纹，无法准备 CBZ 文档");
        }

        console.info("[mobile-reader] cbz:init:start", {
          bookId,
          format,
          hasArchiveUri: Boolean(archiveUri),
          archiveUri,
          archiveOwned,
          fingerprint,
          hasBookBytes: Boolean(bookBytes),
          bookBytesLength: bookBytes?.byteLength ?? null,
        });

        const doc = await prepareCbzDocument({
          bookId,
          format,
          source: archiveUri
            ? {
                type: "path",
                archiveUri,
                fingerprint,
                ownsArchiveFile: archiveOwned,
              }
            : {
                type: "bytes",
                bytes: bookBytes as Uint8Array,
                fingerprint,
              },
        });
        if (cancelled) {
          disposeNativeComicDocument(doc);
          return;
        }

        documentRef.current = doc;
        readyRef.current = true;
        const n = doc.pageUris.length;
        const nextPage = n > 0 ? Math.min(Math.max(0, initialPage), n - 1) : 0;
        setPageUris(doc.pageUris);
        setTotalPages(n);
        setCurrentPage(nextPage);
        setBookEpoch((epoch) => epoch + 1);

        console.info("[mobile-reader] cbz:init:document-ready", {
          bookId,
          format,
          cacheKey: doc.cacheKey,
          archiveUri: doc.archiveUri,
          extractionUri: doc.extractionUri,
          pageCount: doc.pageUris.length,
          firstPageUri: doc.pageUris[0] ?? null,
          ownsArchiveFile: doc.ownsArchiveFile,
        });

        const toc = flattenFixedToc(doc.manifest.toc, n);
        await onTocReadyRef.current(toc);

        setLoading(false);
        reportState(nextPage, n, null, false);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[mobile-reader] cbz:init:failed", {
          bookId,
          format,
          hasArchiveUri: Boolean(archiveUri),
          archiveUri,
          archiveOwned,
          fingerprint,
          hasBookBytes: Boolean(bookBytes),
          bookBytesLength: bookBytes?.byteLength ?? null,
          error: e,
          errorMessage: msg,
          errorName: e instanceof Error ? e.name : null,
          errorCause: e instanceof Error ? e.cause : null,
        });
        setError(msg);
        setLoading(false);
        readyRef.current = false;
        setPageUris([]);
        setTotalPages(0);
        setCurrentPage(0);
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
      readyRef.current = false;
      const doc = documentRef.current;
      documentRef.current = null;
      if (doc) {
        disposeNativeComicDocument(doc);
      }
    };
  }, [archiveFingerprint, archiveOwned, archiveUri, bookBytes, bookId, format, initialPage, reportState]);

  const goToPage = useCallback(
    (index: number) => {
      if (!readyRef.current) return;
      if (index < 0 || index >= totalPages) return;

      setCurrentPage(index);
      pagerRef.current?.scrollToIndex({ index, animated: true });
      reportState(index, totalPages, null, false);
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
      if (!readyRef.current) return;
      setCurrentPage(index);
      reportState(index, totalPages, null, false);
    },
    [totalPages, reportState],
  );

  const renderPage = useCallback(
    (index: number) => (
      <ComicPageLoader
        uri={pageUris[index] ?? null}
        width={screenWidth}
        height={screenHeight}
        scale={zoomScale}
        brightness={brightness}
        insetTop={navigationMode === "horizontal" ? contentInsetTop : 0}
        insetBottom={navigationMode === "horizontal" ? contentInsetBottom : 0}
      />
    ),
    [pageUris, screenWidth, screenHeight, zoomScale, brightness, navigationMode, contentInsetTop, contentInsetBottom],
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

  const listKey = useMemo(
    () => `${bookEpoch}-${totalPages}-${navigationMode}-${brightness}`,
    [bookEpoch, totalPages, navigationMode, brightness],
  );

  if (error) {
    return (
      <View className="flex-1 items-center justify-center px-7" style={{ width: screenWidth, height: screenHeight, backgroundColor: READER_FIXED.canvasBg }}>
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>无法打开</Text>
          <Text style={styles.errText}>{error}</Text>
        </View>
      </View>
    );
  }

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
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { alignItems: "center", justifyContent: "center", backgroundColor: READER_FIXED.canvasBg },
          ]}
        >
          <ActivityIndicator size="large" color={READER_CHROME.loadingIndicator} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: READER_FIXED.canvasBg,
  },
  errorCard: {
    maxWidth: 400,
    width: "100%",
    paddingVertical: 22,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: READER_CHROME.errorCardBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: READER_CHROME.errorCardBorder,
    alignItems: "center",
  },
  errorTitle: {
    color: READER_CHROME.textStrong,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
  },
  errText: {
    color: READER_CHROME.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  pageCanvas: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
