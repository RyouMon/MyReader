import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FlatList, GestureResponderEvent } from "react-native";
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from "react-native";

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

type ReaderTouchSnapshot = {
  x: number;
  y: number;
  timestampMs: number;
};

const TAP_MAX_DURATION_MS = 260;

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
    <View style={{ width, height, backgroundColor: "#111" }}>
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
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef(zoomScale);
  const readerTouchStartRef = useRef<ReaderTouchSnapshot | null>(null);
  const onToggleChromeRef = useRef(onToggleChrome);
  onStateChangeRef.current = onStateChange;
  onTocReadyRef.current = onTocReady;
  onToggleChromeRef.current = onToggleChrome;

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

  const tapSideWidth = Math.max(48, screenWidth * 0.28);

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

  const getDistance = useCallback((event: GestureResponderEvent) => {
    const touches = event.nativeEvent.touches;
    if (touches.length < 2) return null;
    const [a, b] = touches;
    const dx = a.pageX - b.pageX;
    const dy = a.pageY - b.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const handleTouchStart = useCallback(
    (event: GestureResponderEvent) => {
      if (event.nativeEvent.touches.length !== 1) {
        readerTouchStartRef.current = null;
      } else {
        const touch = event.nativeEvent.touches[0];
        readerTouchStartRef.current = {
          x: touch.pageX,
          y: touch.pageY,
          timestampMs: Date.now(),
        };
      }
      if (!pinchZoomEnabled) return;
      const distance = getDistance(event);
      if (distance == null) return;
      pinchStartDistanceRef.current = distance;
      pinchStartScaleRef.current = zoomScale;
    },
    [pinchZoomEnabled, zoomScale, getDistance],
  );

  const handleTouchMove = useCallback(
    (event: GestureResponderEvent) => {
      if (!pinchZoomEnabled || pinchStartDistanceRef.current == null) return;
      const distance = getDistance(event);
      if (distance == null) return;
      const nextScale = Math.max(
        1,
        Math.min(3, pinchStartScaleRef.current * (distance / pinchStartDistanceRef.current)),
      );
      onZoomScaleChange?.(Number(nextScale.toFixed(2)));
    },
    [pinchZoomEnabled, onZoomScaleChange, getDistance],
  );

  const handleTouchEnd = useCallback(() => {
    const start = readerTouchStartRef.current;
    readerTouchStartRef.current = null;
    pinchStartDistanceRef.current = null;
    if (!start) return;

    const durationMs = Date.now() - start.timestampMs;
    const isTapGesture = durationMs <= TAP_MAX_DURATION_MS;
    if (!isTapGesture) return;

    if (navigationMode === "horizontal" && zoomScale <= 1.02) {
      if (start.x <= tapSideWidth) {
        if (currentPage > 0) goToPage(currentPage - 1);
        return;
      }
      if (start.x >= screenWidth - tapSideWidth) {
        if (currentPage < totalPages - 1) goToPage(currentPage + 1);
        return;
      }
    }

    onToggleChromeRef.current?.();
  }, [currentPage, goToPage, navigationMode, screenWidth, tapSideWidth, totalPages, zoomScale]);

  const handleTouchCancel = useCallback(() => {
    readerTouchStartRef.current = null;
    pinchStartDistanceRef.current = null;
  }, []);

  const listKey = useMemo(
    () => `${bookEpoch}-${totalPages}-${navigationMode}-${zoomScale}-${brightness}`,
    [bookEpoch, totalPages, navigationMode, zoomScale, brightness],
  );

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

  return (
    <View
      style={styles.container}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {totalPages > 0 && !loading ? (
        navigationMode === "horizontal" ? (
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
          />
        )
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
  pageCanvas: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
