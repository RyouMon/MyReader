import {
  tocItemsFromNativePdfTableContents,
  type NativePdfTableContentNode,
  pdfEqualPageProgressPercent,
} from "@/src/components/reader/native-pdf";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { flattenFixedToc } from "@/src/components/reader/reader-toc";
import type { ReaderState, ReaderTocItem } from "@/src/components/reader/types";
import type {
  FixedNavigationMode,
  ReadingLayout,
  ReaderTheme,
} from "@/src/store/app-store.types";

/** 避免顶层 `import "react-native-pdf"`：会在加载时初始化 blob-util 原生模块；未 prebuild 时会导致 NativeEventEmitter 崩溃并令 lazy 得到 undefined。 */
type PdfRefLike = { setPage(pageNumber: number): void };
type PdfComponent = ComponentType<Record<string, unknown>>;

const THEME_BACKGROUNDS: Record<ReaderTheme, string> = {
  paper: "#f5efe6",
  light: "#ffffff",
  green: "#e8f0e4",
  dark: "#111111",
};

const NATIVE_MODULE_HINT =
  "请使用包含 react-native-pdf / react-native-blob-util 的 Development Build：在项目根执行 npx expo prebuild 后 npx expo run:ios 或 npx expo run:android（勿使用 Expo Go）。";

export type NativePdfReaderProps = {
  pdfLocalUri: string;
  initialPage?: number;
  onStateChange: (state: ReaderState) => Promise<void>;
  onTocReady: (toc: ReaderTocItem[]) => Promise<void>;
  onRequestClose: () => Promise<void>;
  onToggleChrome?: () => void;
  gotoPageCommand?: number;
  readingLayout?: ReadingLayout;
  navigationMode?: FixedNavigationMode;
  theme?: ReaderTheme;
  brightness?: number;
  zoomScale?: number;
  onZoomScaleChange?: (scale: number) => void;
  contentInsetTop?: number;
  contentInsetBottom?: number;
};

function isLocalFileUri(uri: string): boolean {
  return uri.startsWith("file://") || uri.startsWith("file:");
}

export default function NativePdfReader({
  pdfLocalUri,
  initialPage = 0,
  onStateChange,
  onTocReady,
  onRequestClose: _onRequestClose,
  onToggleChrome,
  gotoPageCommand,
  readingLayout = "paginate",
  navigationMode = "horizontal",
  theme = "dark",
  brightness = 100,
  zoomScale = 1,
  onZoomScaleChange,
  contentInsetTop = 0,
  contentInsetBottom = 0,
}: NativePdfReaderProps) {
  void _onRequestClose;

  const [Pdf, setPdf] = useState<PdfComponent | null>(null);
  const [nativeModuleError, setNativeModuleError] = useState<string | null>(null);

  const pdfRef = useRef<PdfRefLike | null>(null);
  const readyRef = useRef(false);
  const onStateChangeRef = useRef(onStateChange);
  const onTocReadyRef = useRef(onTocReady);
  onStateChangeRef.current = onStateChange;
  onTocReadyRef.current = onTocReady;

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setNativeModuleError(null);
    setPdf(null);
    import("react-native-pdf")
      .then((mod) => {
        if (cancelled) return;
        const C = mod.default;
        if (typeof C !== "function" && typeof C !== "object") {
          setNativeModuleError("react-native-pdf 未导出有效组件");
          return;
        }
        setPdf(() => C as unknown as PdfComponent);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[native-pdf] load-module-failed", e);
        setNativeModuleError(msg);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reportState = useCallback(
    (page0: number, total: number, err: string | null, isLoading: boolean) => {
      const progress = pdfEqualPageProgressPercent(page0, total);
      void onStateChangeRef.current({
        ready: readyRef.current,
        currentPage: page0,
        totalPages: total,
        progress,
        chapterTitle: total > 0 ? `第 ${page0 + 1} 页` : "",
        loading: isLoading,
        error: err,
        canGoPrev: page0 > 0,
        canGoNext: total > 0 && page0 < total - 1,
      });
    },
    [],
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    readyRef.current = false;
    setTotalPages(0);
  }, [pdfLocalUri]);

  const handleLoadComplete = useCallback(
    async (
      numberOfPages: number,
      _path: string,
      _size: { width: number; height: number },
      tableContents?: { title?: string; pageIdx?: number; children?: unknown[] }[],
    ) => {
      try {
        readyRef.current = true;
        setTotalPages(numberOfPages);
        const raw = tableContents as NativePdfTableContentNode[] | undefined;
        const tocTree = tocItemsFromNativePdfTableContents(raw);
        const toc = flattenFixedToc(tocTree, numberOfPages);
        await onTocReadyRef.current(toc);

        const start = Math.min(Math.max(0, initialPage), Math.max(0, numberOfPages - 1));
        if (start > 0) {
          pdfRef.current?.setPage(start + 1);
        }
        setLoading(false);
        reportState(start, numberOfPages, null, false);
      } catch (e) {
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
    },
    [initialPage, reportState],
  );

  const handlePageChanged = useCallback(
    (page1Based: number, numberOfPages: number) => {
      const page0 = Math.max(0, page1Based - 1);
      reportState(page0, numberOfPages, null, false);
    },
    [reportState],
  );

  const handleError = useCallback(
    (err: object) => {
      const msg =
        err && typeof err === "object" && "message" in err && typeof (err as { message?: string }).message === "string"
          ? (err as { message: string }).message
          : JSON.stringify(err);
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
    },
    [],
  );

  useEffect(() => {
    if (
      gotoPageCommand != null &&
      gotoPageCommand >= 0 &&
      readyRef.current &&
      gotoPageCommand < totalPages
    ) {
      pdfRef.current?.setPage(gotoPageCommand + 1);
    }
  }, [gotoPageCommand, totalPages]);

  const horizontal = navigationMode === "horizontal";
  const paginate = readingLayout === "paginate";
  const bg = THEME_BACKGROUNDS[theme];

  if (nativeModuleError) {
    return (
      <View style={[styles.centered, { width: screenWidth, height: screenHeight }]}>
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>PDF 原生模块未加载</Text>
          <Text style={styles.errText}>{nativeModuleError}</Text>
          <Text style={[styles.errText, styles.hintText]}>{NATIVE_MODULE_HINT}</Text>
        </View>
      </View>
    );
  }

  if (!Pdf) {
    return (
      <View style={[styles.centered, { width: screenWidth, height: screenHeight }]}>
        <ActivityIndicator size="large" color="rgba(255,255,255,0.7)" />
        <Text style={[styles.errText, styles.hintText, { marginTop: 16 }]}>正在加载 PDF 引擎…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { width: screenWidth, height: screenHeight }]}>
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>无法打开 PDF</Text>
          <Text style={styles.errText}>{error}</Text>
        </View>
      </View>
    );
  }

  if (!isLocalFileUri(pdfLocalUri)) {
    return (
      <View style={[styles.centered, { width: screenWidth, height: screenHeight }]}>
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>无法打开 PDF</Text>
          <Text style={styles.errText}>无效的本地路径</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: bg,
          opacity: Math.max(0.2, brightness / 100),
          paddingTop: paginate ? contentInsetTop : 0,
          paddingBottom: paginate ? contentInsetBottom : 0,
        },
      ]}
    >
      <Pdf
        key={pdfLocalUri}
        ref={pdfRef}
        source={{ uri: pdfLocalUri, cache: false }}
        style={{
          flex: 1,
          width: screenWidth,
          height: screenHeight,
          backgroundColor: bg,
        }}
        scale={zoomScale}
        minScale={1}
        maxScale={3}
        horizontal={horizontal}
        scrollEnabled={readingLayout === "scroll"}
        enablePaging={paginate}
        fitPolicy={2}
        spacing={paginate ? 10 : 0}
        enableDoubleTapZoom
        onLoadComplete={handleLoadComplete}
        onPageChanged={handlePageChanged}
        onError={handleError}
        onScaleChanged={onZoomScaleChange}
        onPageSingleTap={() => {
          onToggleChrome?.();
        }}
      />
      {loading ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="rgba(255,255,255,0.7)" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
    paddingHorizontal: 28,
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
  hintText: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 19,
    color: "rgba(255,255,255,0.55)",
  },
});
