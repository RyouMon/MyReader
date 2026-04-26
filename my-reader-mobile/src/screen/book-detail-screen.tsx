import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import Feather from "@expo/vector-icons/Feather";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { BookDetail } from "my-reader-tools/types/book";
import { isReadableInAppFormat, pickReadableFormat } from "my-reader-tools/utils";
import { Share, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useTheme, type ThemePalette } from "@/src/design/tokens";
import { FONT_DISPLAY, FONT_MONO, FONT_UI } from "@/src/design/typography";
import { AnimatedScrollView, Image, Pressable, ScrollView, Text, View } from "@/tw";

import { EmptyState, SectionCard, SettingsRow } from "../components";
import { HeaderToolbar, type HeaderToolbarAction } from "../components/ui/header-toolbar";
import { buildCoverUri, readBookDetailFromMetadata } from "../data/calibre";
import type { BookItem, MobileLibrary, WebDavDataSource } from "../data/types";
import { buildWebDavBookCoverUri } from "../data/webdav";
import { useAppStore } from "../store/app-store";
import { useLibraryStore } from "../store/library-store";

const IDENTIFIER_LABELS: Record<string, string> = {
  isbn: "ISBN",
  goodreads: "Goodreads",
  douban: "豆瓣",
  amazon: "Amazon",
  google: "Google",
  barnesnoble: "B&N",
};

const FORMAT_LABELS: Record<string, string> = {
  EPUB: "可重排版",
  PDF: "固定版式",
  MOBI: "Kindle 格式",
  AZW3: "Kindle 格式",
  TXT: "纯文本",
  CBZ: "漫画归档",
  DJVU: "扫描文档",
  FB2: "FictionBook",
};

/**
 * Converts Calibre language codes into compact labels for the metadata line.
 */
function formatLanguage(code: string): string {
  const map: Record<string, string> = {
    zho: "中文",
    chi: "中文",
    eng: "English",
    jpn: "日本語",
    kor: "한국어",
    fra: "Français",
    deu: "Deutsch",
    spa: "Español",
    rus: "Русский",
  };
  return map[code] ?? code;
}

/**
 * Keeps file sizes scannable inside the compact horizontal format cards.
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Normalizes Calibre dates that can contain sentinel or partial values.
 */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (d.getFullYear() <= 100) return "—";
    return d.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Pulls the year out for the design's compact title metadata row.
 */
function extractYear(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    const year = d.getFullYear();
    if (year <= 100) return null;
    return String(year);
  } catch {
    return null;
  }
}

/**
 * Removes Calibre HTML comments before rendering them as native text.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * Resolves local and WebDAV cover sources through the same path as the library grid.
 */
function resolveCoverForDetail(
  library: MobileLibrary | null,
  detail: BookDetail,
  webDavSource: WebDavDataSource | null,
  fallback?: BookItem["coverUri"]
): BookItem["coverUri"] | undefined {
  if (fallback) return fallback;
  if (!library || !detail.path) return undefined;
  if (library.sourceType === "webdav" && webDavSource) {
    return buildWebDavBookCoverUri(library, webDavSource, detail.path, detail.hasCover);
  }
  return buildCoverUri(library, detail.path, detail.hasCover);
}

type BookDetailEntryMode = "home" | "library";

type BookDetailScreenProps = {
  entryMode?: BookDetailEntryMode;
};

type DetailCacheEntry = {
  detail: BookDetail | null;
  error: string | null;
  loading: boolean;
};

type BookDetailContentProps = {
  activeLibrary: MobileLibrary;
  bookId: string;
  colors: DetailColors;
  detail: BookDetail | null;
  detailError: string | null;
  listBook: BookItem | null;
  loadingDetail: boolean;
  onOpenReader: (bookId: string, format: string | null) => void;
  onSelectFormat: (bookId: string, format: string | null) => void;
  onToggleSynopsis: (bookId: string) => void;
  selectedFormat: string | null;
  synopsisExpanded: boolean;
  webDavSource: WebDavDataSource | null;
};

/**
 * Coordinates route-level behavior for regular pushes and library modal paging.
 */
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
  const translateX = useSharedValue(0);
  const isLibraryEntry = entryMode === "library";

  const webDavSource = useMemo(() => {
    if (!activeLibrary || activeLibrary.sourceType !== "webdav") return null;
    const found = dataSources.find(
      (d) => d.id === activeLibrary.dataSourceId && d.type === "webdav"
    );
    return (found as WebDavDataSource | undefined) ?? null;
  }, [activeLibrary, dataSources]);

  useEffect(() => {
    if (id && !isLibraryEntry) {
      setCurrentId(id);
    }
  }, [id, isLibraryEntry]);

  useEffect(() => {
    if (id && isLibraryEntry && currentId === null) {
      setCurrentId(id);
    }
  }, [currentId, id, isLibraryEntry]);

  useEffect(() => {
    setDetailCache({});
    setSelectedFormatById({});
    setSynopsisExpandedById({});
    loadingIdsRef.current.clear();
  }, [activeLibraryId]);

  useEffect(() => {
    detailCacheRef.current = detailCache;
  }, [detailCache]);

  const libraryOrderIds = useMemo(() => {
    if (
      isLibraryEntry &&
      bookDetailLibraryOrder &&
      bookDetailLibraryOrder.libraryId === activeLibraryId
    ) {
      return bookDetailLibraryOrder.bookIds;
    }
    return books.map((book) => book.id);
  }, [activeLibraryId, bookDetailLibraryOrder, books, isLibraryEntry]);

  const currentIndex = currentId ? libraryOrderIds.indexOf(currentId) : -1;
  const previousId = isLibraryEntry && currentIndex > 0 ? libraryOrderIds[currentIndex - 1] : null;
  const nextId =
    isLibraryEntry && currentIndex >= 0 && currentIndex < libraryOrderIds.length - 1
      ? libraryOrderIds[currentIndex + 1]
      : null;

  const windowIds = useMemo(
    () =>
      isLibraryEntry
        ? [previousId, currentId, nextId].filter((item): item is string => Boolean(item))
        : currentId
          ? [currentId]
          : [],
    [currentId, isLibraryEntry, nextId, previousId]
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
    const lines = [currentDetail.title, currentDetail.authors.filter(Boolean).join(", ") || currentDetail.authorSort].filter(
      (line): line is string => Boolean(line)
    );
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
        label: isLibraryEntry ? "关闭" : "返回",
        onPress: handleGoBack,
        icon: <Feather name={isLibraryEntry ? "x" : "arrow-left"} size={20} color={palette.text} />,
        iosSfSymbol: isLibraryEntry ? "xmark" : "chevron.left",
        iconOnly: true,
        color: palette.text,
      },
    ],
    [handleGoBack, isLibraryEntry, palette.text]
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

  const settleSwipe = useCallback(
    (targetId: string) => {
      setCurrentId(targetId);
      router.setParams({ id: targetId });
      translateX.set(0);
    },
    [translateX]
  );

  const pagerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -width + translateX.get() }],
  }));

  const horizontalPagerGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-14, 14])
        .failOffsetY([-18, 18])
        .onUpdate((event) => {
          const movingToPrevious = event.translationX > 0;
          const movingToNext = event.translationX < 0;
          if ((movingToPrevious && previousId) || (movingToNext && nextId)) {
            translateX.set(event.translationX);
            return;
          }
          translateX.set(event.translationX * 0.28);
        })
        .onEnd((event) => {
          const distanceThreshold = width * 0.28;
          const velocityThreshold = 620;
          const shouldMoveToPrevious =
            Boolean(previousId) &&
            (event.translationX > distanceThreshold || event.velocityX > velocityThreshold);
          const shouldMoveToNext =
            Boolean(nextId) &&
            (event.translationX < -distanceThreshold || event.velocityX < -velocityThreshold);

          if (shouldMoveToPrevious && previousId) {
            translateX.set(
              withTiming(width, { duration: 180 }, (finished) => {
                if (finished) runOnJS(settleSwipe)(previousId);
              })
            );
            return;
          }
          if (shouldMoveToNext && nextId) {
            translateX.set(
              withTiming(-width, { duration: 180 }, (finished) => {
                if (finished) runOnJS(settleSwipe)(nextId);
              })
            );
            return;
          }

          translateX.set(
            withSpring(0, {
              damping: 30,
              stiffness: 180,
              overshootClamping: true,
            })
          );
        }),
    [nextId, previousId, settleSwipe, translateX, width]
  );

  const renderDetailPage = useCallback(
    (bookId: string | null) => {
      if (!bookId || !activeLibrary) {
        return <View style={{ width }} />;
      }
      const entry = detailCache[bookId];
      const selectedFormat =
        selectedFormatById[bookId] ??
        (entry?.detail ? pickReadableFormat(entry.detail.formats) : null);
      return (
        <View key={bookId} className="flex-1" style={{ width }}>
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
        </View>
      );
    },
    [
      activeLibrary,
      detailCache,
      detailColors,
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

  if (!isLibraryEntry) {
    return (
      <View className="flex-1" style={{ backgroundColor: palette.background }}>
        <Stack.Screen options={screenOptions} />
        <HeaderToolbar left={headerLeftActions} right={headerRightActions} />
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
          onToggleSynopsis={handleToggleSynopsis}
          selectedFormat={
            selectedFormatById[currentId] ??
            (currentEntry?.detail ? pickReadableFormat(currentEntry.detail.formats) : null)
          }
          synopsisExpanded={Boolean(synopsisExpandedById[currentId])}
          webDavSource={webDavSource}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 overflow-hidden" style={{ backgroundColor: palette.background }}>
      <Stack.Screen options={screenOptions} />
      <HeaderToolbar left={headerLeftActions} right={headerRightActions} />
      <GestureDetector gesture={horizontalPagerGesture}>
        <Animated.View style={{ flex: 1, overflow: "hidden" }}>
          <Animated.View style={[{ flex: 1, flexDirection: "row", width: width * 3 }, pagerAnimatedStyle]}>
            {renderDetailPage(previousId)}
            {renderDetailPage(currentId)}
            {renderDetailPage(nextId)}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/**
 * Renders one detail page so the library pager can keep adjacent books mounted.
 */
function BookDetailContent({
  activeLibrary,
  bookId,
  colors,
  detail,
  detailError,
  listBook,
  loadingDetail,
  onOpenReader,
  onSelectFormat,
  onToggleSynopsis,
  selectedFormat,
  synopsisExpanded,
  webDavSource,
}: BookDetailContentProps) {
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.set(event.contentOffset.y);
    },
  });

  const coverUri = useMemo(
    () =>
      detail
        ? resolveCoverForDetail(activeLibrary, detail, webDavSource, listBook?.coverUri)
        : listBook?.coverUri,
    [activeLibrary, detail, listBook?.coverUri, webDavSource]
  );

  const progress =
    typeof listBook?.progress === "number" ? listBook.progress : 0;
  const progressLabel = `${Math.round(progress * 100)}%`;

  const readableFormats = useMemo(
    () => (detail ? detail.formats.filter(isReadableInAppFormat) : []),
    [detail]
  );

  const formatSizeMap = useMemo(() => {
    const m = new Map<string, number>();
    if (!detail) return m;
    for (const fs of detail.formatSizes) {
      m.set(fs.format.toUpperCase(), fs.sizeBytes);
    }
    return m;
  }, [detail]);

  if (loadingDetail) {
    return (
      <View className="flex-1 items-center justify-center px-4" style={{ backgroundColor: colors.palette.background }}>
        <Text className="text-sm" style={{ color: colors.palette.textMuted }}>
          加载书籍详情…
        </Text>
      </View>
    );
  }

  if (detailError || !detail) {
    return (
      <View className="flex-1 px-4 pt-4" style={{ backgroundColor: colors.palette.background }}>
        <EmptyState
          title="没有找到这本书"
          detail={detailError ?? "它可能已从当前书库移除，或页面参数已经失效。"}
        />
      </View>
    );
  }

  const book = detail;
  const year = extractYear(book.pubdate);
  const langDisplay = book.languages.map(formatLanguage).join(", ");
  const ratingStars = book.rating ? Math.round(book.rating / 2) : 0;
  const ratingValue = book.rating ? (book.rating / 2).toFixed(1) : null;
  const seriesLabel =
    book.series && book.seriesIndex !== null && book.seriesIndex !== undefined
      ? `${book.series} · 第 ${Number.isInteger(book.seriesIndex) ? book.seriesIndex : book.seriesIndex.toFixed(1)} 部`
      : book.series;
  const synopsisText = book.comment ? stripHtml(book.comment) : "";
  const readableSelectedFormat = selectedFormat ?? pickReadableFormat(book.formats);
  const canReadInApp = readableFormats.length > 0;
  const metaLine = [year, book.publisher, langDisplay].filter(Boolean).join(" · ");
  const bookInfoRows = [
    { label: "排序作者", value: book.authorSort || "—" },
    { label: "出版日期", value: formatDate(book.pubdate) },
    { label: "语言", value: langDisplay || "—" },
    { label: "库中路径", value: book.path || "—", mono: true },
    { label: "添加时间", value: formatDate(book.timestamp) },
    { label: "最后修改", value: formatDate(book.lastModified) },
    ...(book.uuid
      ? [
          {
            label: "UUID",
            value: book.uuid,
            mono: true,
          },
        ]
      : []),
  ];

  const openReader = (format: string | null = readableSelectedFormat) => {
    if (!canReadInApp || !format) return;
    onOpenReader(bookId, format);
  };

  return (
    <AnimatedScrollView
      className="flex-1"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="pb-28"
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      style={{ backgroundColor: colors.palette.background }}
    >
      <View>
        <HeroSection
          book={book}
          colors={colors}
          coverUri={coverUri}
          metaLine={metaLine}
          ratingStars={ratingStars}
          ratingValue={ratingValue}
          seriesLabel={seriesLabel}
        />

        {book.formats.length > 0 ? (
          <FormatSection
            book={book}
            colors={colors}
            formatSizeMap={formatSizeMap}
            onReadFormat={(format) => {
              onSelectFormat(bookId, format);
              openReader(format);
            }}
            progress={progress}
            progressLabel={progressLabel}
            readableFormats={readableFormats}
            selectedFormat={readableSelectedFormat}
          />
        ) : null}

        {synopsisText ? (
          <SynopsisSection
            colors={colors}
            expanded={synopsisExpanded}
            onToggle={() => onToggleSynopsis(bookId)}
            text={synopsisText}
          />
        ) : null}

        <InfoRowSection colors={colors} items={bookInfoRows} title="详细信息" />

        {book.identifiers.length > 0 ? <IdentifierSection book={book} colors={colors} /> : null}
      </View>
    </AnimatedScrollView>
  );
}

type DetailColors = {
  accent: string;
  accentPressed: string;
  accentText: string;
  background: string;
  border: string;
  card: string;
  disabledBg: string;
  disabledText: string;
  muted: string;
  palette: ThemePalette;
  progressTrack: string;
  sectionBg: string;
  success: string;
  successBg: string;
  tagBg: string;
  tagText: string;
  tertiary: string;
  text: string;
};

type InfoCardItem = {
  label: string;
  mono?: boolean;
  value: string;
};

/**
 * Bridges the Pencil spec colors to the existing mobile theme tokens.
 */
function getDetailColors(palette: ThemePalette, colorScheme: string | null | undefined): DetailColors {
  const isDark = colorScheme === "dark";

  return {
    accent: isDark ? "#D4703A" : "#C4622D",
    accentPressed: "#B05523",
    accentText: isDark ? "#1C1714" : "#FAF6F0",
    background: isDark ? "#1C1814" : "#F7F3EC",
    border: isDark ? "rgba(240, 235, 225, 0.12)" : "rgba(28, 23, 20, 0.10)",
    card: isDark ? "#26211D" : "#FFFFFF",
    disabledBg: isDark ? "#2F2923" : "#F5F1EA",
    disabledText: isDark ? "#B8AFA6" : "#5C5349",
    muted: isDark ? "#B8AFA6" : "#5C5349",
    palette,
    progressTrack: isDark ? "#382F27" : "#EDE8DF",
    sectionBg: isDark ? "#1C1814" : "#F7F3EC",
    success: isDark ? "#55A884" : "#3A7D5A",
    successBg: isDark ? "#1E3D2E" : "#C2DDD0",
    tagBg: isDark ? "#5A3020" : "#E8C9B5",
    tagText: isDark ? "#FAFAFA" : "#0A0A0A",
    tertiary: isDark ? "#7A7068" : "#9C9089",
    text: isDark ? "#F0EBE1" : "#1C1714",
  };
}

/**
 * Renders the compact cover-and-metadata hero from the Pencil screen.
 */
function HeroSection({
  book,
  colors,
  coverUri,
  metaLine,
  ratingStars,
  ratingValue,
  seriesLabel,
}: {
  book: BookDetail;
  colors: DetailColors;
  coverUri?: BookItem["coverUri"];
  metaLine: string;
  ratingStars: number;
  ratingValue: string | null;
  seriesLabel: string | null;
}) {
  const authors = book.authors.filter(Boolean).join(", ") || book.authorSort;
  const ratingLabel = ratingValue ? `${"★".repeat(ratingStars)}${"☆".repeat(5 - ratingStars)}  ${ratingValue}` : null;

  return (
    <View className="flex-row gap-4 px-4 pb-5 pt-4" style={{ backgroundColor: colors.sectionBg }}>
      <View
        className="h-[188px] w-[128px] overflow-hidden rounded-xl"
        style={{ backgroundColor: colors.accentPressed, borderColor: "rgba(0,0,0,0.13)", borderWidth: 1 }}
      >
        {coverUri ? (
          <Image source={coverUri} className="h-full w-full object-cover" />
        ) : (
          <View className="h-full w-full justify-end px-3 py-4" style={{ backgroundColor: colors.accentPressed }}>
            <Text
              className="text-center text-[15px] leading-5"
              numberOfLines={4}
              style={{ color: "#FFFFFF", fontFamily: FONT_DISPLAY, fontWeight: "700", opacity: 0.88 }}
            >
              {book.title}
            </Text>
          </View>
        )}
      </View>

      <View className="flex-1 gap-3 py-1">
        <Text className="text-xl leading-7" numberOfLines={3} style={{ color: colors.text, fontFamily: FONT_DISPLAY, fontWeight: "700" }}>
          {book.title}
        </Text>
        {seriesLabel ? (
          <Text className="text-sm leading-5" numberOfLines={2} style={{ color: colors.tertiary, fontFamily: FONT_UI }}>
            {seriesLabel}
          </Text>
        ) : null}
        <Text className="text-base leading-6" numberOfLines={2} style={{ color: colors.accent, fontFamily: FONT_UI, fontWeight: "600" }}>
          {authors}
        </Text>
        <View style={{ height: 1, backgroundColor: colors.border }} />
        {metaLine ? (
          <Text className="text-sm leading-5" numberOfLines={2} style={{ color: colors.tertiary, fontFamily: FONT_UI }}>
            {metaLine}
          </Text>
        ) : null}
        {ratingLabel ? (
          <Text className="text-sm leading-5" style={{ color: colors.muted, fontFamily: FONT_UI, fontWeight: "600" }}>
            {ratingLabel}
          </Text>
        ) : null}
        {book.tags.length > 0 ? (
          <View className="flex-row flex-wrap gap-1">
            {book.tags.slice(0, 4).map((tag) => (
              <View key={tag} className="min-h-9 justify-center rounded-2xl px-[14px] py-[9px]" style={{ backgroundColor: colors.tagBg, borderColor: colors.border, borderWidth: 1 }}>
                <Text className="text-[13px] leading-5" style={{ color: colors.tagText, fontFamily: FONT_UI, fontWeight: "600" }}>
                  {tag}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Displays available formats as the horizontal card rail used in the design.
 */
function FormatSection({
  book,
  colors,
  formatSizeMap,
  onReadFormat,
  progress,
  progressLabel,
  readableFormats,
  selectedFormat,
}: {
  book: BookDetail;
  colors: DetailColors;
  formatSizeMap: Map<string, number>;
  onReadFormat: (format: string) => void;
  progress: number;
  progressLabel: string;
  readableFormats: string[];
  selectedFormat: string | null;
}) {
  const readableFormatSet = new Set(readableFormats.map((format) => format.toUpperCase()));
  const selectedFormatKey = selectedFormat?.toUpperCase() ?? null;

  return (
    <SectionFrame colors={colors}>
      <SectionHeader colors={colors} detail={`${book.formats.length} 种格式`} title="文件格式" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
        {book.formats.map((format) => {
          const upper = format.toUpperCase();
          return (
            <FormatCard
              key={upper}
              colors={colors}
              format={upper}
              isReadable={readableFormatSet.has(upper)}
              isSelected={selectedFormatKey === upper}
              onRead={() => onReadFormat(upper)}
              progress={progress}
              progressLabel={progressLabel}
              size={formatSizeMap.get(upper) ?? 0}
            />
          );
        })}
      </ScrollView>
    </SectionFrame>
  );
}

/**
 * Renders one file format option without inventing download/cache state.
 */
function FormatCard({
  colors,
  format,
  isReadable,
  isSelected,
  onRead,
  progress,
  progressLabel,
  size,
}: {
  colors: DetailColors;
  format: string;
  isReadable: boolean;
  isSelected: boolean;
  onRead: () => void;
  progress: number;
  progressLabel: string;
  size: number;
}) {
  const actionLabel = isReadable ? (progress > 0 ? "继续阅读" : "开始阅读") : "不支持阅读";

  return (
    <View className="w-[196px] gap-3 rounded-2xl p-4" style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}>
      <View className="flex-row items-center gap-2">
        <Feather name={isReadable ? "file-text" : "file"} size={20} color={isReadable ? colors.accent : colors.tertiary} />
        <Text className="flex-1 text-base leading-6" style={{ color: colors.text, fontFamily: FONT_UI, fontWeight: "700" }}>
          {format}
        </Text>
        <View className="min-h-7 justify-center rounded-full px-3" style={{ backgroundColor: isReadable ? colors.successBg : colors.disabledBg }}>
          <Text className="text-xs leading-4" style={{ color: isReadable ? colors.success : colors.disabledText, fontFamily: FONT_UI, fontWeight: "600" }}>
            {isReadable ? (isSelected ? "当前" : "可阅读") : "不支持"}
          </Text>
        </View>
      </View>
      <Text className="text-[13px] leading-5" style={{ color: colors.tertiary, fontFamily: FONT_UI }}>
        {formatFileSize(size)}
        {FORMAT_LABELS[format] ? ` · ${FORMAT_LABELS[format]}` : ""}
      </Text>
      {isReadable ? (
        <View className="flex-row items-center gap-2">
          <View className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: colors.progressTrack }}>
            <View className="h-full rounded-full" style={{ backgroundColor: colors.accent, width: `${Math.max(0, Math.min(progress, 1)) * 100}%` }} />
          </View>
          <Text className="text-xs leading-4" style={{ color: colors.tertiary, fontFamily: FONT_UI }}>
            {progress > 0 ? progressLabel : "0%"}
          </Text>
        </View>
      ) : (
        <Text className="text-xs leading-4" style={{ color: colors.tertiary, fontFamily: FONT_UI }}>
          未开始阅读
        </Text>
      )}
      <Pressable
        accessibilityLabel={`${actionLabel} ${format}`}
        accessibilityRole="button"
        className="min-h-12 items-center justify-center rounded-2xl px-5 py-3"
        disabled={!isReadable}
        onPress={onRead}
        style={{
          backgroundColor: isReadable ? colors.accent : colors.card,
          borderColor: isReadable ? colors.accent : colors.text,
          borderWidth: isReadable ? 0 : 1,
          opacity: isReadable ? 1 : 0.6,
        }}
      >
        <Text className="text-sm leading-5" style={{ color: isReadable ? colors.accentText : colors.text, fontFamily: FONT_UI, fontWeight: "700" }}>
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Keeps section spacing and background identical across repeated blocks.
 */
function SectionFrame({ children, colors }: { children: ReactNode; colors: DetailColors }) {
  return (
    <View className="gap-[10px] px-4 pb-4" style={{ backgroundColor: colors.sectionBg }}>
      {children}
    </View>
  );
}

/**
 * Renders the section title line and optional count label.
 */
function SectionHeader({ colors, detail, title }: { colors: DetailColors; detail?: string; title: string }) {
  return (
    <View className="flex-row items-center justify-between pb-[10px]" style={{ borderBottomColor: colors.border, borderBottomWidth: detail ? 0 : 1 }}>
      <Text className="text-[16px] leading-6" style={{ color: colors.text, fontFamily: FONT_DISPLAY, fontWeight: "700" }}>
        {title}
      </Text>
      {detail ? (
        <Text className="text-xs leading-4" style={{ color: colors.tertiary, fontFamily: FONT_UI }}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Renders Calibre comments as a native text synopsis with expansion.
 */
function SynopsisSection({
  colors,
  expanded,
  onToggle,
  text,
}: {
  colors: DetailColors;
  expanded: boolean;
  onToggle: () => void;
  text: string;
}) {
  return (
    <SectionFrame colors={colors}>
      <SectionHeader colors={colors} title="简介" />
      <Text className="text-[13px] leading-[22px]" numberOfLines={expanded ? undefined : 6} style={{ color: colors.muted, fontFamily: FONT_UI }}>
        {text}
      </Text>
      <Pressable accessibilityRole="button" className="self-start" onPress={onToggle}>
        <Text className="text-[13px] leading-5" style={{ color: colors.accent, fontFamily: FONT_UI, fontWeight: "500" }}>
          {expanded ? "收起" : "展开全文"}
        </Text>
      </Pressable>
    </SectionFrame>
  );
}

/**
 * Renders book metadata as one native row group for mobile scanning.
 */
function InfoRowSection({ colors, items, title }: { colors: DetailColors; items: InfoCardItem[]; title: string }) {
  return (
    <SectionFrame colors={colors}>
      <SectionHeader colors={colors} title={title} />
      <SectionCard>
        {items.map((item, index) => (
          <SettingsRow
            key={`${item.label}-${item.value}`}
            title={item.label}
            detail={item.value}
            isLast={index === items.length - 1}
          />
        ))}
      </SectionCard>
    </SectionFrame>
  );
}

/**
 * Keeps identifiers visible without competing with primary book metadata.
 */
function IdentifierSection({ book, colors }: { book: BookDetail; colors: DetailColors }) {
  return (
    <SectionFrame colors={colors}>
      <SectionHeader colors={colors} title="标识符" />
      <View className="flex-row flex-wrap gap-2">
        {book.identifiers.map((ident, idx) => (
          <View
            key={`${ident.idType}-${ident.value}-${idx}`}
            className="rounded-[10px] px-3 py-2"
            style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}
          >
            <Text className="text-[10px] uppercase leading-4" style={{ color: colors.tertiary, fontFamily: FONT_UI, fontWeight: "600" }}>
              {IDENTIFIER_LABELS[ident.idType] ?? ident.idType}
            </Text>
            <Text className="mt-0.5 text-xs leading-4" style={{ color: colors.text, fontFamily: FONT_MONO }}>
              {ident.value}
            </Text>
          </View>
        ))}
      </View>
    </SectionFrame>
  );
}

