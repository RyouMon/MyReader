import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Feather from "@expo/vector-icons/Feather";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { pickReadableFormat } from "my-reader-tools/utils";
import { Share } from "react-native";

import { useTheme } from "@/src/design/tokens";
import { View } from "@/tw";

import { EmptyState, HeaderToolbar, type HeaderToolbarAction } from "@/src/components";
import { BookDetailContent, getDetailColors } from "@/src/features/library/components/books/book-detail";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { readBookDetailFromMetadata } from "@/src/data/calibre";
import type { WebDavDataSource } from "@/src/data/types";
import { useAppStore } from "@/src/store/app-store";
import { useLibraryStore } from "@/src/store/library-store";

type DetailCacheEntry = {
  detail: import("my-reader-tools/types/book").BookDetail | null;
  error: string | null;
  loading: boolean;
};

export default function BookDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colorScheme, palette } = useTheme();
  const { books, activeLibrary, activeLibraryId } = useLibraryStore();
  const dataSources = useAppStore((s) => s.dataSources);
  const [currentId, setCurrentId] = useState<string | null>(id ?? null);
  const [detailCache, setDetailCache] = useState<Record<string, DetailCacheEntry>>({});
  const [selectedFormatById, setSelectedFormatById] = useState<Record<string, string | null>>({});
  const detailCacheRef = useRef(detailCache);
  const loadingIdsRef = useRef(new Set<string>());

  const webDavSource = useMemo(() => {
    if (!activeLibrary || activeLibrary.sourceType !== "webdav") return null;
    const found = dataSources.find(
      (d) => d.id === activeLibrary.dataSourceId && d.type === "webdav"
    );
    return (found as WebDavDataSource | undefined) ?? null;
  }, [activeLibrary, dataSources]);

  useEffect(() => {
    if (id && currentId === null) {
      setCurrentId(id);
    }
  }, [currentId, id]);

  useEffect(() => {
    setDetailCache({});
    setSelectedFormatById({});
    loadingIdsRef.current.clear();
  }, [activeLibraryId]);

  useEffect(() => {
    detailCacheRef.current = detailCache;
  }, [detailCache]);

  useEffect(() => {
    if (!activeLibrary || !currentId) return;
    let cancelled = false;

    const cacheEntry = detailCacheRef.current[currentId];
    if (cacheEntry || loadingIdsRef.current.has(currentId)) {
      return;
    }

    const numericId = Number(currentId);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      setDetailCache((prev) => ({
        ...prev,
        [currentId]: {
          detail: null,
          error: "无效的书籍 ID",
          loading: false,
        },
      }));
      return;
    }

    loadingIdsRef.current.add(currentId);
    setDetailCache((prev) => ({
      ...prev,
      [currentId]: {
        detail: null,
        error: null,
        loading: true,
      },
    }));

    void readBookDetailFromMetadata(activeLibrary, Math.trunc(numericId))
      .then((next) => {
        if (cancelled) return;
        setDetailCache((prev) => ({
          ...prev,
          [currentId]: {
            detail: next,
            error: next ? null : "在 metadata 中未找到该书",
            loading: false,
          },
        }));
        if (next) {
          setSelectedFormatById((prev) =>
            Object.prototype.hasOwnProperty.call(prev, currentId)
              ? prev
              : { ...prev, [currentId]: pickReadableFormat(next.formats) }
          );
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setDetailCache((prev) => ({
          ...prev,
          [currentId]: {
            detail: null,
            error: e instanceof Error ? e.message : String(e),
            loading: false,
          },
        }));
      })
      .finally(() => {
        loadingIdsRef.current.delete(currentId);
      });

    return () => {
      cancelled = true;
    };
  }, [activeLibrary, currentId]);

  const currentEntry = currentId ? detailCache[currentId] : undefined;
  const currentDetail = currentEntry?.detail ?? null;

  const handleShare = useCallback(() => {
    if (!currentDetail) return;
    const lines = [
      currentDetail.title,
      currentDetail.authors.filter(Boolean).join(", ") || currentDetail.authorSort,
    ].filter((line): line is string => Boolean(line));
    void Share.share({
      title: currentDetail.title,
      message: lines.join("\n"),
    });
  }, [currentDetail]);

  const handleGoBack = useCallback(() => {
    router.back();
  }, []);

  const detailColors = useMemo(() => getDetailColors(palette, colorScheme), [palette, colorScheme]);
  const noop = useCallback(() => {}, []);

  const headerLeftActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        label: "返回",
        onPress: handleGoBack,
        icon: <Feather name="arrow-left" size={20} color={palette.text} />,
        iosSfSymbol: "chevron.left",
        iconOnly: true,
        color: palette.text,
      },
    ],
    [handleGoBack, palette.text]
  );

  const headerRightActions = useMemo<HeaderToolbarAction[] | undefined>(() => {
    if (!currentDetail) return undefined;
    return [
      {
        label: "收藏",
        onPress: noop,
        icon: <Feather name="star" size={20} color={detailColors.muted} />,
        iosSfSymbol: "star",
        iconOnly: true,
        color: detailColors.muted,
      },
      {
        label: "分享",
        onPress: handleShare,
        icon: <Feather name="share-2" size={19} color={detailColors.muted} />,
        iosSfSymbol: "square.and.arrow.up",
        iconOnly: true,
        color: detailColors.muted,
      },
    ];
  }, [currentDetail, detailColors.muted, handleShare, noop]);

  const screenOptions = useMemo<NativeStackNavigationOptions>(
    () => ({
      title: "书籍详情",
      headerShown: true,
      headerLargeTitle: false,
      headerLargeTitleShadowVisible: false,
      headerShadowVisible: false,
      headerBackVisible: false,
      headerBackButtonDisplayMode: "generic",
      headerStyle: { backgroundColor: palette.background },
      headerTintColor: palette.text,
    }),
    [palette.background, palette.text]
  );

  const getListBook = useCallback(
    (bookId: string) => books.find((item) => item.id === bookId) ?? null,
    [books]
  );

  const handleSelectFormat = useCallback((bookId: string, format: string | null) => {
    setSelectedFormatById((prev) => ({ ...prev, [bookId]: format }));
  }, []);

  const openReader = useCallback((bookId: string, format: string | null) => {
    if (!format) return;
    router.push({
      pathname: "/reader/[id]",
      params: { id: bookId, format },
    });
  }, []);

  const selectedFormat = currentId
    ? (selectedFormatById[currentId] ??
        (currentEntry?.detail ? pickReadableFormat(currentEntry.detail.formats) : null))
    : null;

  if (!currentId) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <HeaderToolbar left={headerLeftActions} right={headerRightActions} />
        <View className="flex-1 px-4 pt-4" style={{ backgroundColor: palette.background }}>
          <EmptyState title="缺少书籍参数" detail="请从书库重新进入书籍详情。" icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }} />
        </View>
      </>
    );
  }

  if (!activeLibraryId || !activeLibrary) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <HeaderToolbar left={headerLeftActions} right={headerRightActions} />
        <View className="flex-1 px-4 pt-4" style={{ backgroundColor: palette.background }}>
          <EmptyState title="没有当前书库" detail="请先在设置或书库中选择要使用的 Calibre 书库。" icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }} />
        </View>
      </>
    );
  }

  return (
    <View className="flex-1 overflow-hidden" style={{ backgroundColor: palette.background }}>
      <Stack.Screen options={screenOptions} />
      <HeaderToolbar left={headerLeftActions} right={headerRightActions} />
      <ErrorBoundary
        title="书籍详情加载失败"
        message="书籍详情页面遇到了意外错误，请重试。"
        onRetry={() => {
          if (currentId) {
            loadingIdsRef.current.delete(currentId);
            setDetailCache((prev) => {
              const next = { ...prev };
              delete next[currentId];
              return next;
            });
          }
        }}
      >
        <BookDetailContent
          activeLibrary={activeLibrary}
          bookId={currentId}
          colors={detailColors}
          detail={currentEntry?.detail ?? null}
          detailError={currentEntry?.error ?? null}
          listBook={getListBook(currentId)}
          loadingDetail={currentEntry?.loading ?? true}
          onOpenReader={openReader}
          onSelectFormat={handleSelectFormat}
          selectedFormat={selectedFormat}
          webDavSource={webDavSource}
        />
      </ErrorBoundary>
    </View>
  );
}
