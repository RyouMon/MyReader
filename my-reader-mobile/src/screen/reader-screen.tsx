import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
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
import FixedLayoutDOMReader, {
  type ReaderState,
  type ReaderTocItem,
} from "@/src/components/reader/FixedLayoutDOMReader";

type LoadState =
  | { status: "loading"; message: string }
  | { status: "error"; message: string }
  | { status: "ready"; bookBase64: string; format: string; title: string; initialPage: number };

export default function ReaderScreen() {
  const { id, format: formatParam } = useLocalSearchParams<{
    id?: string;
    format?: string;
  }>();
  const palette = useThemePalette();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
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
    if (!id || !activeLibrary) {
      setLoadState({
        status: "error",
        message: !id ? "缺少书籍参数" : "未选择书库",
      });
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setLoadState({ status: "loading", message: "正在读取书籍信息…" });

        const calibreId = Number(id);
        if (!Number.isFinite(calibreId) || calibreId <= 0) {
          setLoadState({ status: "error", message: "无效的书籍 ID" });
          return;
        }

        const detail = await readBookDetailFromMetadata(activeLibrary!, calibreId);
        if (cancelled) return;
        if (!detail) {
          setLoadState({ status: "error", message: "在书库中未找到该书" });
          return;
        }

        const fmt = resolveReadFormat(detail.formats, formatParam);
        if (!fmt) {
          setLoadState({
            status: "error",
            message: `该书没有可阅读的格式（需要 EPUB、CBZ 或 PDF）`,
          });
          return;
        }

        const fmtUpper = fmt.toUpperCase();
        if (fmtUpper !== "PDF" && fmtUpper !== "CBZ") {
          setLoadState({
            status: "error",
            message: `暂不支持 ${fmtUpper} 格式阅读，仅支持 PDF 和 CBZ`,
          });
          return;
        }

        setLoadState({
          status: "loading",
          message: webDavSource ? "正在从 WebDAV 下载书籍…" : "正在加载书籍文件…",
        });

        const bytes = webDavSource
          ? await downloadWebDavBookFileBytes(activeLibrary!, webDavSource, calibreId, fmt)
          : await readBookFileBytes(activeLibrary!, calibreId, fmt);
        if (cancelled) return;

        const base64 = uint8ArrayToBase64(bytes);

        setLoadState({
          status: "ready",
          bookBase64: base64,
          format: fmt,
          title: detail.title,
          initialPage: 0,
        });
      } catch (e) {
        if (cancelled) return;
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
    setReaderState(state);
  }, []);

  const handleTocReady = useCallback(async (items: ReaderTocItem[]) => {
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
    setGotoPageCmd(pageIndex);
    setTocOpen(false);
    setTimeout(() => setGotoPageCmd(undefined), 100);
  }, []);

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
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: palette.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text className="text-base" style={{ color: palette.error, fontWeight: "600" }}>
          加载失败
        </Text>
        <Text className="mt-2 text-center text-sm" style={{ color: palette.textMuted }}>
          {loadState.message}
        </Text>
        <Pressable
          className="mt-6 rounded-2xl px-6 py-3"
          style={{ backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }}
          onPress={handleBack}
        >
          <Text className="text-sm" style={{ color: palette.text, fontWeight: "600" }}>
            返回
          </Text>
        </Pressable>
      </View>
    );
  }

  const title = loadState.title;

  return (
    <View className="flex-1" style={{ backgroundColor: "#111" }}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <Pressable style={StyleSheet.absoluteFill} onPress={toggleChrome}>
        <FixedLayoutDOMReader
          bookBase64={loadState.bookBase64}
          format={loadState.format}
          initialPage={loadState.initialPage}
          onStateChange={handleStateChange}
          onTocReady={handleTocReady}
          onRequestClose={handleRequestClose}
          gotoPageCommand={gotoPageCmd}
          dom={{
            style: { flex: 1, width: screenWidth, height: screenHeight },
            scrollEnabled: false,
          }}
        />
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
                  {toc.map((item, idx) => {
                    const isActive = readerState
                      ? item.pageIndex === readerState.currentPage
                      : false;
                    return (
                      <Pressable
                        key={`${item.pageIndex}-${idx}`}
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

const styles = StyleSheet.create({
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
