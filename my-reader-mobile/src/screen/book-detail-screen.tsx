import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import Feather from "@expo/vector-icons/Feather";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { pickReadableFormat } from "my-reader-tools/utils";
import { Share, useWindowDimensions } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";

import { useTheme } from "@/src/design/tokens";
import { View } from "@/tw";

import { EmptyState, HeaderToolbar, type HeaderToolbarAction } from "../components";
import { BookDetailContent, getDetailColors } from "../components/books/book-detail";
import { readBookDetailFromMetadata } from "../data/calibre";
import type { WebDavDataSource } from "../data/types";
import { useDetailSwipePager } from "../hooks/use-detail-swipe-pager";
import { useAppStore } from "../store/app-store";
import { useLibraryStore } from "../store/library-store";

type BookDetailEntryMode = "home" | "library";

type BookDetailScreenProps = {
  entryMode?: BookDetailEntryMode;
};

type DetailCacheEntry = {
  detail: import("my-reader-tools/types/book").BookDetail | null;
  error: string | null;
  loading: boolean;
};

function PagerSlot({
  detailIndex,
  width,
  children,
}: {
  detailIndex: number;
  width: number;
  children: ReactNode;
}) {
  return (
    <View style={{ position: "absolute", left: detailIndex * width, top: 0, bottom: 0, width }}>
      {children}
    </View>
  );
}

export default function BookDetailScreen({ entryMode = "home" }: BookDetailScreenProps) {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { width } = useWindowDimensions();
  const { colorScheme, palette } = useTheme();
  const { books, activeLibrary, activeLibraryId } = useLibraryStore();
  const dataSources = useAppStore((s) => s.dataSources);
  const bookDetailLibraryOrder = useAppStore((s) => s.bookDetailLibraryOrder);
  const [currentId, setCurrentId] = useState<string | null>(id ?? null);
  const [detailCache, setDetailCache] = useState<Record<string, DetailCacheEntry>>({});
  const [selectedFormatById, setSelectedFormatById] = useState<Record<string, string | null>>({});
  const [synopsisExpandedById, setSynopsisExpandedById] = useState<Record<string, boolean>>({});
  const detailCacheRef = useRef(detailCache);
  const loadingIdsRef = useRef(new Set<string>());
  const [initialPageIndex] = useState(() => {
    if (entryMode !== "library") return 0;
    const initialId = id ?? null;
    if (!initialId) return 0;
    const orderForCalc =
      bookDetailLibraryOrder?.libraryId === activeLibraryId
        ? bookDetailLibraryOrder.bookIds
        : books.map((b) => b.id);
    return Math.max(0, orderForCalc.indexOf(initialId));
  });

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
    setSynopsisExpandedById({});
    loadingIdsRef.current.clear();
  }, [activeLibraryId]);

  useEffect(() => {
    detailCacheRef.current = detailCache;
  }, [detailCache]);

  const detailOrderIds = useMemo(() => {
    if (entryMode === "home") {
      return currentId ? [currentId] : [];
    }
    if (bookDetailLibraryOrder && bookDetailLibraryOrder.libraryId === activeLibraryId) {
      return bookDetailLibraryOrder.bookIds;
    }
    return books.map((book) => book.id);
  }, [activeLibraryId, bookDetailLibraryOrder, books, currentId, entryMode]);

  const currentIndex = currentId ? detailOrderIds.indexOf(currentId) : -1;
  const previousId = currentIndex > 0 ? detailOrderIds[currentIndex - 1] : null;
  const nextId =
    currentIndex >= 0 && currentIndex < detailOrderIds.length - 1
      ? detailOrderIds[currentIndex + 1]
      : null;

  const windowIds = useMemo(
    () => [previousId, currentId, nextId].filter((item): item is string => Boolean(item)),
    [currentId, nextId, previousId]
  );

  useEffect(() => {
    if (!activeLibrary) return;
    let cancelled = false;

    for (const bookId of windowIds) {
      const cacheEntry = detailCacheRef.current[bookId];
      if (cacheEntry || loadingIdsRef.current.has(bookId)) {
        continue;
      }

      const numericId = Number(bookId);
      if (!Number.isFinite(numericId) || numericId <= 0) {
        setDetailCache((prev) => ({
          ...prev,
          [bookId]: {
            detail: null,
            error: "无效的书籍 ID",
            loading: false,
          },
        }));
        continue;
      }

      loadingIdsRef.current.add(bookId);
      setDetailCache((prev) => ({
        ...prev,
        [bookId]: {
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
            [bookId]: {
              detail: next,
              error: next ? null : "在 metadata 中未找到该书",
              loading: false,
            },
          }));
          if (next) {
            setSelectedFormatById((prev) =>
              Object.prototype.hasOwnProperty.call(prev, bookId)
                ? prev
                : { ...prev, [bookId]: pickReadableFormat(next.formats) }
            );
          }
        })
        .catch((e) => {
          if (cancelled) return;
          setDetailCache((prev) => ({
            ...prev,
            [bookId]: {
              detail: null,
              error: e instanceof Error ? e.message : String(e),
              loading: false,
            },
          }));
        })
        .finally(() => {
          loadingIdsRef.current.delete(bookId);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [activeLibrary, windowIds]);

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
        label: "关闭",
        onPress: handleGoBack,
        icon: <Feather name="x" size={20} color={palette.text} />,
        iosSfSymbol: "xmark",
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

  const handleToggleSynopsis = useCallback((bookId: string) => {
    setSynopsisExpandedById((prev) => ({ ...prev, [bookId]: !prev[bookId] }));
  }, []);

  const openReader = useCallback((bookId: string, format: string | null) => {
    if (!format) return;
    router.push({
      pathname: "/reader/[id]",
      params: { id: bookId, format },
    });
  }, []);

  const handleSwipeCommit = useCallback((targetId: string) => {
    setCurrentId(targetId);
    router.setParams({ id: targetId });
  }, []);

  const { gesture: horizontalPagerGesture, animatedStyle: pagerAnimatedStyle } = useDetailSwipePager({
    width,
    currentIndex,
    initialIndex: initialPageIndex,
    previousId,
    nextId,
    onCommit: handleSwipeCommit,
  });

  const renderDetailPage = useCallback(
    (bookId: string | null) => {
      if (!bookId || !activeLibrary) return null;
      const idx = detailOrderIds.indexOf(bookId);
      if (idx < 0) return null;
      const entry = detailCache[bookId];
      const selectedFormat =
        selectedFormatById[bookId] ??
        (entry?.detail ? pickReadableFormat(entry.detail.formats) : null);
      return (
        <PagerSlot key={bookId} detailIndex={idx} width={width}>
          <BookDetailContent
            activeLibrary={activeLibrary}
            bookId={bookId}
            colors={detailColors}
            detail={entry?.detail ?? null}
            detailError={entry?.error ?? null}
            listBook={getListBook(bookId)}
            loadingDetail={entry?.loading ?? true}
            onOpenReader={openReader}
            onSelectFormat={handleSelectFormat}
            onToggleSynopsis={handleToggleSynopsis}
            selectedFormat={selectedFormat}
            synopsisExpanded={Boolean(synopsisExpandedById[bookId])}
            webDavSource={webDavSource}
          />
        </PagerSlot>
      );
    },
    [
      activeLibrary,
      detailCache,
      detailColors,
      detailOrderIds,
      getListBook,
      handleSelectFormat,
      handleToggleSynopsis,
      openReader,
      selectedFormatById,
      synopsisExpandedById,
      webDavSource,
      width,
    ]
  );

  if (!currentId) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <HeaderToolbar left={headerLeftActions} right={headerRightActions} />
        <View className="flex-1 px-4 pt-4" style={{ backgroundColor: palette.background }}>
          <EmptyState title="缺少书籍参数" detail="请从书库重新进入书籍详情。" />
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
          <EmptyState title="没有当前书库" detail="请先在设置或书库中选择要使用的 Calibre 书库。" />
        </View>
      </>
    );
  }

  return (
    <View className="flex-1 overflow-hidden" style={{ backgroundColor: palette.background }}>
      <Stack.Screen options={screenOptions} />
      <HeaderToolbar left={headerLeftActions} right={headerRightActions} />
      <GestureDetector gesture={horizontalPagerGesture}>
        <Animated.View style={{ flex: 1, overflow: "hidden" }}>
          <Animated.View style={[{ flex: 1 }, pagerAnimatedStyle]}>
            {renderDetailPage(previousId)}
            {renderDetailPage(currentId)}
            {renderDetailPage(nextId)}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
