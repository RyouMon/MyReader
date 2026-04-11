import { lazy, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StatusBar,
  StyleSheet,
} from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { resolveReadFormat } from "my-reader-tools/rendition/utils";

import { Pressable, Text, View } from "@/tw";
import { useThemePalette } from "@/src/design/tokens";
import { readBookDetailFromMetadata, readBookFileBytes } from "@/src/data/calibre";
import { downloadWebDavBookFileBytes } from "@/src/data/webdav";
import { useLibraryStore } from "@/src/store/library-store";
import { useAppStore } from "@/src/store/app-store";
import type { WebDavDataSource } from "@/src/data/types";
import type { ReaderState, ReaderTocItem } from "@/src/components/reader/types";

/** 按格式懒加载，避免打开 PDF（expo/dom）时仍执行原生侧的 BookReader，进而误拉 Epub/foliate 等 DOM 依赖。 */
const FixedReaderSurface = lazy(async () => import("@/src/components/reader/fixed/FixedReaderSurface"));
const ReflowableDOMReader = lazy(async () => import("@/src/components/reader/reflow/ReflowableDOMReader"));

type LoadState =
  | { status: "loading"; message: string }
  | { status: "error"; message: string }
  | {
      status: "ready";
      bookBase64: string;
      bookBuffer: Uint8Array;
      format: string;
      title: string;
      initialPage: number;
      layoutMode: "fixedLayout" | "reflowable" | "unknown";
    };

export default function ReaderScreen() {
  const { id, format: formatParam } = useLocalSearchParams<{
    id?: string;
    format?: string;
  }>();
  const palette = useThemePalette();
  const insets = useSafeAreaInsets();
  const { activeLibrary } = useLibraryStore();
  const dataSources = useAppStore((s) => s.dataSources);

  const webDavSource = activeLibrary?.sourceType === "webdav"
    ? (dataSources.find(
        (d) => d.id === activeLibrary.dataSourceId && d.type === "webdav"
      ) as WebDavDataSource | undefined) ?? null
    : null;

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    message: "正在加载书籍…",
  });
  const [readerState, setReaderState] = useState<ReaderState | null>(null);
  const [toc, setToc] = useState<ReaderTocItem[]>([]);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [tocOpen, setTocOpen] = useState(false);
  const [gotoPageCmd, setGotoPageCmd] = useState<number | undefined>(undefined);

  useEffect(() => {
    console.info("[mobile-reader] effect:start", {
      id,
      formatParam,
      activeLibraryId: activeLibrary?.id ?? null,
      activeLibrarySourceType: activeLibrary?.sourceType ?? null,
      hasWebDavSource: Boolean(webDavSource),
    });

    if (!id || !activeLibrary) {
      console.error("[mobile-reader] effect:missing-input", {
        id,
        hasActiveLibrary: Boolean(activeLibrary),
      });
      setLoadState({
        status: "error",
        message: !id ? "缺少书籍参数" : "未选择书库",
      });
      return;
    }

    const currentLibrary = activeLibrary;
    let cancelled = false;

    async function load() {
      try {
        console.info("[mobile-reader] load:start", {
          id,
          formatParam,
          libraryId: currentLibrary.id,
          sourceType: currentLibrary.sourceType,
        });
        setLoadState({ status: "loading", message: "正在读取书籍信息…" });

        const calibreId = Number(id);
        if (!Number.isFinite(calibreId) || calibreId <= 0) {
          console.error("[mobile-reader] load:invalid-book-id", { id, calibreId });
          setLoadState({ status: "error", message: "无效的书籍 ID" });
          return;
        }

        const detail = await readBookDetailFromMetadata(currentLibrary, calibreId);
        if (cancelled) return;
        if (!detail) {
          console.error("[mobile-reader] load:book-detail-not-found", {
            calibreId,
            libraryId: currentLibrary.id,
          });
          setLoadState({ status: "error", message: "在书库中未找到该书" });
          return;
        }

        console.info("[mobile-reader] load:book-detail-ready", {
          calibreId,
          title: detail.title,
          formats: detail.formats,
        });

        const fmt = resolveReadFormat(detail.formats, formatParam);
        if (!fmt) {
          console.error("[mobile-reader] load:no-supported-format", {
            calibreId,
            formats: detail.formats,
            formatParam,
          });
          setLoadState({
            status: "error",
            message: `该书没有可阅读的格式（需要 EPUB、CBZ 或 PDF）`,
          });
          return;
        }

        const fmtUpper = fmt.toUpperCase();
        console.info("[mobile-reader] load:resolved-format", {
          calibreId,
          resolvedFormat: fmtUpper,
        });

        setLoadState({
          status: "loading",
          message: webDavSource ? "正在从 WebDAV 下载书籍…" : "正在加载书籍文件…",
        });

        const bytes = webDavSource
          ? await downloadWebDavBookFileBytes(currentLibrary, webDavSource, calibreId, fmt)
          : await readBookFileBytes(currentLibrary, calibreId, fmt);
        if (cancelled) return;

        console.info("[mobile-reader] load:file-bytes-ready", {
          calibreId,
          format: fmtUpper,
          byteLength: bytes.byteLength,
          sourceType: webDavSource ? "webdav" : "local",
        });

        const detailLayoutMode =
          fmtUpper === "EPUB" ? "reflowable" : fmtUpper === "PDF" || fmtUpper === "CBZ" ? "fixedLayout" : "unknown";
        const base64 = uint8ArrayToBase64(bytes);

        console.info("[mobile-reader] load:base64-ready", {
          calibreId,
          format: fmtUpper,
          base64Length: base64.length,
          layoutMode: detailLayoutMode,
          renderer:
            detailLayoutMode === "reflowable"
              ? "native-reflow-webview"
              : fmtUpper === "PDF"
                ? "dom"
                : "native-fixed",
        });

        setLoadState({
          status: "ready",
          bookBase64: base64,
          bookBuffer: bytes,
          format: fmt,
          title: detail.title,
          initialPage: 0,
          layoutMode: detailLayoutMode,
        });

        console.info("[mobile-reader] load:ready", {
          calibreId,
          format: fmtUpper,
          title: detail.title,
          initialPage: 0,
          layoutMode: detailLayoutMode,
        });
      } catch (e) {
        if (cancelled) return;
        console.error("[mobile-reader] load:failed", {
          id,
          formatParam,
            libraryId: currentLibrary.id,

          error: e,
        });
        setLoadState({
          status: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, activeLibrary, formatParam, webDavSource]);

  const handleStateChange = useCallback(async (state: ReaderState) => {
    console.info("[mobile-reader] state-change", state);
    setReaderState(state);
  }, []);

  const handleTocReady = useCallback(async (items: ReaderTocItem[]) => {
    console.info("[mobile-reader] toc-ready", {
      count: items.length,
      firstItems: items.slice(0, 5),
    });
    setToc(items);
  }, []);

  const handleRequestClose = useCallback(async () => {
    if (router.canGoBack()) {
      router.back();
    }
  }, []);

  const handleBack = useCallback(() => {
    if (tocOpen) {
      setTocOpen(false);
      return;
    }
    if (router.canGoBack()) {
      router.back();
    }
  }, [tocOpen]);

  const toggleChrome = useCallback(() => {
    if (tocOpen) {
      setTocOpen(false);
      return;
    }
    setChromeVisible((v) => !v);
  }, [tocOpen]);

  const handleTocSelect = useCallback((pageIndex: number) => {
    console.info("[mobile-reader] toc-select", { pageIndex });
    setGotoPageCmd(pageIndex);
    setTocOpen(false);
    setTimeout(() => setGotoPageCmd(undefined), 100);
  }, []);

  const domFallback = useMemo(
    () => (
      <DomReaderFallback
        format={loadState.status === "ready" ? loadState.format : null}
        title={loadState.status === "ready" ? loadState.title : null}
      />
    ),
    [loadState]
  );

  const progressPercent = readerState?.progress ?? 0;
  const pageLabel = readerState
    ? `${readerState.currentPage + 1} / ${readerState.totalPages}`
    : "";

  if (loadState.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: "#111" }}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#fff" />
        <Text className="mt-4 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
          {loadState.message}
        </Text>
      </View>
    );
  }

  if (loadState.status === "error") {
    return (
      <View style={[styles.errorScreen, { backgroundColor: palette.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar barStyle="light-content" />
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>无法打开书籍</Text>
          <Text style={styles.errorBody}>{loadState.message}</Text>
          <Pressable
            style={[styles.errorBackBtn, { borderColor: "rgba(255,255,255,0.2)" }]}
            onPress={handleBack}
          >
            <Text style={styles.errorBackBtnText}>返回</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const title = loadState.title;
  const fmtUpper = loadState.format.toUpperCase();
  const isReflowSurface = loadState.layoutMode === "reflowable";
  const isFixedSurface = loadState.layoutMode === "fixedLayout";

  if (__DEV__) {
    console.info("[mobile-reader] render:ready-screen", {
      title,
      format: fmtUpper,
      layoutMode: loadState.layoutMode,
      isFixedSurface,
      isReflowSurface,
      readerReady: readerState?.ready ?? false,
      currentPage: readerState?.currentPage ?? null,
      totalPages: readerState?.totalPages ?? null,
      tocCount: toc.length,
      chromeVisible,
      tocOpen,
    });
  }

  return (
    <View className="flex-1" style={{ backgroundColor: "#111" }}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <Pressable style={StyleSheet.absoluteFill} onPress={toggleChrome}>
        {isReflowSurface ? (
          <ReflowableDOMReader
            bookBase64={loadState.bookBase64}
            format={loadState.format}
            initialPage={loadState.initialPage}
            onStateChange={handleStateChange}
            onTocReady={handleTocReady}
            onDomProbe={async (event) => {
              console.info("[mobile-reader] dom-probe", event);
            }}
            onRequestClose={handleRequestClose}
            gotoPageCommand={gotoPageCmd}
            dom={{
              style: { flex: 1 },
              scrollEnabled: true,
            }}
          />
        ) : isFixedSurface ? (
          <FixedReaderSurface
            bookBase64={loadState.bookBase64}
            format={loadState.format}
            initialPage={loadState.initialPage}
            onStateChange={handleStateChange}
            onTocReady={handleTocReady}
            onRequestClose={handleRequestClose}
            gotoPageCommand={gotoPageCmd}
            fallback={domFallback}
          />
        ) : null}
      </Pressable>

      {chromeVisible && (
        <>
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            style={[
              styles.topBar,
              { paddingTop: insets.top + 8 },
            ]}
            pointerEvents="box-none"
          >
            <View className="flex-row items-center gap-3 px-4" pointerEvents="auto">
              <Pressable
                className="h-10 w-10 items-center justify-center rounded-full"
                style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
                onPress={handleBack}
              >
                <MaterialIcons name="arrow-back" size={20} color="#fff" />
              </Pressable>
              <View className="flex-1 px-2">
                <Text
                  className="text-sm"
                  style={{ color: "#fff", fontWeight: "600" }}
                  numberOfLines={1}
                >
                  {title}
                </Text>
                {readerState?.chapterTitle ? (
                  <Text
                    className="text-xs"
                    style={{ color: "rgba(255,255,255,0.6)" }}
                    numberOfLines={1}
                  >
                    {readerState.chapterTitle}
                  </Text>
                ) : null}
              </View>
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            style={[
              styles.bottomBar,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
            pointerEvents="box-none"
          >
            <View className="px-4" pointerEvents="auto">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {pageLabel}
                </Text>
                <Text className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {progressPercent}%
                </Text>
              </View>

              <View className="mb-3 h-[2px] overflow-hidden rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
                <View
                  className="h-full rounded-full"
                  style={{
                    backgroundColor: palette.primary,
                    width: `${progressPercent}%`,
                  }}
                />
              </View>

              <View className="flex-row gap-3">
                <Pressable
                  className="flex-1 h-11 flex-row items-center justify-center gap-2 rounded-2xl"
                  style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
                  onPress={() => setTocOpen(true)}
                >
                  <MaterialIcons name="list" size={18} color="#fff" />
                  <Text className="text-sm" style={{ color: "#fff", fontWeight: "600" }}>
                    目录
                  </Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </>
      )}

      {tocOpen && (
        <>
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            style={styles.scrim}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setTocOpen(false)} />
          </Animated.View>

          <Animated.View
            entering={SlideInDown.duration(280)}
            exiting={SlideOutDown.duration(220)}
            style={[styles.tocSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          >
            <View className="mb-2 mt-3 h-[5px] w-11 self-center rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.2)" }} />
            <Text className="px-5 py-3 text-base" style={{ color: "#fff", fontWeight: "700" }}>
              目录
            </Text>
            <View className="flex-1 px-4">
              {toc.length > 0 ? (
                <Animated.ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 16 }}
                >
                    {toc.map((item) => {
                      const isActive = readerState
                        ? item.pageIndex === readerState.currentPage
                        : false;
                      return (
                        <Pressable
                          key={item.id}

                        className="mb-2 rounded-2xl px-4 py-3"
                        style={{
                          backgroundColor: isActive
                            ? "rgba(201,135,78,0.15)"
                            : "rgba(255,255,255,0.06)",
                          borderWidth: isActive ? 1 : 0,
                          borderColor: isActive
                            ? "rgba(201,135,78,0.3)"
                            : "transparent",
                        }}
                        onPress={() => handleTocSelect(item.pageIndex)}
                      >
                        <Text
                          className="text-sm"
                          style={{
                            color: isActive ? palette.primary : "rgba(255,255,255,0.8)",
                            fontWeight: isActive ? "700" : "500",
                          }}
                          numberOfLines={2}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </Animated.ScrollView>
              ) : (
                <View className="flex-1 items-center justify-center">
                  <Text className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
                    此书籍没有目录
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>
        </>
      )}
    </View>
  );
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (Platform.OS === "web") {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode.apply(null, slice as unknown as number[]));
  }
  const binary = chunks.join("");

  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(binary);
  }

  const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  const len = binary.length;
  for (let i = 0; i < len; i += 3) {
    const b1 = binary.charCodeAt(i);
    const b2 = i + 1 < len ? binary.charCodeAt(i + 1) : 0;
    const b3 = i + 2 < len ? binary.charCodeAt(i + 2) : 0;

    result += base64Chars[(b1 >> 2) & 0x3f];
    result += base64Chars[((b1 << 4) | (b2 >> 4)) & 0x3f];
    result += i + 1 < len ? base64Chars[((b2 << 2) | (b3 >> 6)) & 0x3f] : "=";
    result += i + 2 < len ? base64Chars[b3 & 0x3f] : "=";
  }
  return result;
}

function DomReaderFallback({
  format,
  title,
}: {
  format: string | null;
  title: string | null;
}) {
  useEffect(() => {
    console.info("[mobile-reader] dom-fallback:mounted", {
      format,
      title,
    });
  }, [format, title]);

  return (
    <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: "#111" }}>
      <ActivityIndicator size="large" color="#fff" />
      <Text className="mt-4 text-sm" style={{ color: "rgba(255,255,255,0.72)" }}>
        正在挂载阅读器…
      </Text>
      <Text className="mt-2 text-center text-xs" style={{ color: "rgba(255,255,255,0.42)" }}>
        {format ? `format=${format}` : "format=unknown"}
        {title ? ` · ${title}` : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  errorScreen: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  errorCard: {
    maxWidth: 400,
    width: "100%",
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 22,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  errorTitle: {
    color: "rgba(255,255,255,0.96)",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  errorBody: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  errorBackBtn: {
    marginTop: 22,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  errorBackBtnText: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 15,
    fontWeight: "600",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingTop: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    zIndex: 30,
  },
  tocSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    backgroundColor: "#1C1916",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "55%",
  },
});
