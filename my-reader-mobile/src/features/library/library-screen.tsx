import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { FlashList } from "@shopify/flash-list";
import { Stack, router } from "expo-router";
import { useTranslation } from "react-i18next";
import { View, useWindowDimensions } from "react-native";

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar";
import { useThemePalette } from "@/src/design/tokens";

import {
  EmptyState,
  PrimaryButton,
  RoundIconButton,
  Screen,
  SectionHeading,
} from "@/src/components";
import { switchActiveLibrary } from "@/src/domain/library/hooks/library-actions";
import { useBookReadingFormat } from "@/src/domain/library/hooks/use-book-reading-format";
import { notifyLibraryRefresh } from "@/src/domain/notifications/download-notifications";
import { useSyncLibrary } from "@/src/domain/sync/hooks/use-sync-library";
import type { BookItem } from "@/src/domain/types";
import { isRemoteSourceType } from "@/src/domain/types";
import {
  BookCard,
  BookRow,
  LibrarySkeletonContent,
} from "@/src/features/library/components/books";
import { useLibraryHeaderChrome } from "@/src/features/library/hooks/use-library-header-chrome";
import { useSearchQuery } from "@/src/features/library/hooks/use-search-query";
import { getLibraryDownloadFilterLabel } from "@/src/features/library/utils/library-header-config";
import { resolveLibraryScreenVariant } from "@/src/features/library/utils/resolve-library-screen-variant";
import { useBooks } from "@/src/features/library/hooks/useLibraryQuery";
import { useLibraryBookMeta } from "@/src/hooks/use-library-book-meta";
import { useBookFilter, type DownloadFilterOption, type SortOption } from "@/src/features/library/hooks/use-book-filter";
import { useAppStore } from "@/src/store/app-store";
import { useBookActions } from "./hooks/useBookActions";

const defaultSortOption: SortOption = "recentlyAdded";
const GRID_MIN_CARD_WIDTH = 150;
const GRID_MIN_COLUMNS = 2;
const GRID_MAX_COLUMNS = 6;

type LibraryScreenProps = {
  libraryId?: string;
};

/** Computes responsive grid columns so larger screens can show more books per row. */
function getResponsiveGridColumns(containerWidth: number, gap: number, horizontalPadding: number): number {
  const availableWidth = Math.max(0, containerWidth - horizontalPadding * 2);
  const estimatedColumns = Math.floor((availableWidth + gap) / (GRID_MIN_CARD_WIDTH + gap));
  return Math.max(GRID_MIN_COLUMNS, Math.min(GRID_MAX_COLUMNS, estimatedColumns || GRID_MIN_COLUMNS));
}

type LibraryItemSeparator = NonNullable<
  ComponentProps<typeof FlashList<BookItem>>["ItemSeparatorComponent"]
>;

const SeparatorGrid = memo(function SeparatorGrid() {
  return <View className="h-3" />;
}) as LibraryItemSeparator;
const SeparatorList = memo(function SeparatorList() {
  return null;
}) as LibraryItemSeparator;

export default function LibraryScreen({ libraryId: libraryIdProp }: LibraryScreenProps) {
  const { t } = useTranslation();
  const palette = useThemePalette();
  const { width } = useWindowDimensions();
  const GRID_GAP = 12;
  const GRID_PADDING_H = 16;
  const gridColumns = getResponsiveGridColumns(width, GRID_GAP, GRID_PADDING_H);
  const GRID_HALF_GAP = GRID_GAP / 2;
  const LIST_PADDING_H = GRID_PADDING_H;
  const cardWidth = (width - GRID_PADDING_H * 2 - GRID_GAP * (gridColumns - 1)) / gridColumns;
  const { switchLibrary } = { switchLibrary: switchActiveLibrary };
  const libraries = useAppStore((s) => s.libraries);
  const activeLibraryId = useAppStore((s) => s.activeLibraryId);
  const storeReady = useAppStore((s) => s.storeReady);
  const effectiveLibraryId = libraryIdProp ?? activeLibraryId ?? undefined;
  const { data: books = [], isLoading: loadingBooks, error: booksError } = useBooks(activeLibraryId);
  const { syncNow } = useSyncLibrary();
  const viewMode = useAppStore((s) => s.libraryViewMode);
  const setViewMode = useAppStore((s) => s.setLibraryViewMode);
  const { query, setQuery, debouncedQuery, clearQuery } = useSearchQuery(effectiveLibraryId);
  const [sortBy, setSortBy] = useState<SortOption>(defaultSortOption);
  const [downloadFilter, setDownloadFilter] = useState<DownloadFilterOption>("all");
  const isGridView = viewMode === "grid";

  const [openMenuBookId, setOpenMenuBookId] = useState<string | null>(null);
  const menuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLoadingNewContent = loadingBooks && books.length === 0;

  const handleMenuOpen = useCallback((bookId: string) => {
    if (menuCloseTimerRef.current) {
      clearTimeout(menuCloseTimerRef.current);
      menuCloseTimerRef.current = null;
    }
    setOpenMenuBookId(bookId);
  }, []);

  const handleMenuClose = useCallback(() => {
    menuCloseTimerRef.current = setTimeout(() => {
      setOpenMenuBookId(null);
      menuCloseTimerRef.current = null;
    }, 120);
  }, []);

  /** Switches active library only when user selects a different one. */
  const applyLibrarySelection = useCallback(
    (nextLibraryId: string) => {
      if (nextLibraryId === effectiveLibraryId) return;
      void switchLibrary(nextLibraryId);
    },
    [effectiveLibraryId, switchLibrary],
  );

  const selectedLibrary = useMemo(
    () => (effectiveLibraryId ? libraries.find((library) => library.id === effectiveLibraryId) ?? null : null),
    [libraries, effectiveLibraryId],
  );

  const { selectedFormatById, setBookReadingFormat } = useBookReadingFormat(selectedLibrary, books);

  const variant = resolveLibraryScreenVariant({
    storeReady,
    effectiveLibraryId,
    hasSelectedLibrary: selectedLibrary !== null,
    librariesCount: libraries.length,
  });

  const { bookFormatsById, bookFormatMetaById, fileStateBundle, bookDownloadStatusById, bookActiveFormatsById } = useLibraryBookMeta(
    selectedLibrary,
    books,
    selectedFormatById,
  );
  const { visibleBooks } = useBookFilter(
    books,
    debouncedQuery,
    sortBy,
    downloadFilter,
    bookDownloadStatusById,
  );

  /** Opens a platform-neutral library picker menu without navigation. */
  const openLibrarySwitchMenu = useCallback(() => {
    showAlertWithStatusBarRestore(
      t("library.switchLibrary"),
      t("library.switchLibraryAlert.message", { name: selectedLibrary?.name ?? t("library.switchLibraryAlert.unselected") }),
      [
        ...libraries.map((library) => ({
          text: `${effectiveLibraryId === library.id ? "✓ " : ""}${library.name}`,
          onPress: () => applyLibrarySelection(library.id),
        })),
        { text: t("library.switchLibraryAlert.close"), style: "cancel" },
      ],
    );
  }, [applyLibrarySelection, effectiveLibraryId, libraries, selectedLibrary, t]);

  const handleSyncCurrentLibrary = useCallback(() => {
    if (!selectedLibrary) return;
    void (async () => {
      try {
        await syncNow(selectedLibrary.id);
        notifyLibraryRefresh("done");
      } catch (e) {
        console.error("[library-screen] sync library failed:", e);
        notifyLibraryRefresh("error", e instanceof Error ? e.message : undefined);
      }
    })();
  }, [selectedLibrary, syncNow]);

  const { options, toolbar } = useLibraryHeaderChrome({
    variant,
    selectedLibrary,
    libraries,
    effectiveLibraryId,
    downloadFilter,
    sortBy,
    viewMode,
    onSyncCurrentLibrary: handleSyncCurrentLibrary,
    onSelectLibrary: applyLibrarySelection,
    onOpenLibrarySwitchMenu: openLibrarySwitchMenu,
    onSetDownloadFilter: setDownloadFilter,
    onSetSortBy: setSortBy,
    onSetViewMode: setViewMode,
    onQueryChange: setQuery,
    onSearchCancel: clearQuery,
  });

  useEffect(() => {
    if (!libraryIdProp || !selectedLibrary || libraryIdProp === activeLibraryId) {
      return;
    }

    void switchLibrary(libraryIdProp);
  }, [activeLibraryId, libraryIdProp, selectedLibrary, switchLibrary]);

  const isRemote = isRemoteSourceType(selectedLibrary?.sourceType);
  const selectedLibraryId = selectedLibrary?.id;

  const { handleBookPress, handleBookMenuAction } = useBookActions(
    books,
    bookDownloadStatusById,
    bookFormatMetaById,
    fileStateBundle,
    openMenuBookId,
    selectedFormatById,
    selectedLibrary,
    setBookReadingFormat,
  );

  const isMenuOpen = openMenuBookId !== null;

  const renderItem = useCallback(
    ({ item }: { item: BookItem }) => {
      const status = bookDownloadStatusById[item.id] ?? "notDownloaded";
      const effectiveFormat = bookFormatMetaById.get(item.id)?.effectiveFormat;
      const subscriptionLibraryId = isRemote && status === "downloading" ? selectedLibraryId : undefined;
      const activeFormat = effectiveFormat ?? (status === "downloading" ? bookActiveFormatsById.get(item.id) : undefined);
      const subscriptionFormat = subscriptionLibraryId ? activeFormat : undefined;
      const menuFormats = bookFormatsById[item.id];
      const menuSelectedFormat = selectedFormatById[item.id];

      if (isGridView) {
        return (
          <View className="px-1.5">
            <BookCard
              book={item}
              downloadStatus={status}
              width={cardWidth}
              isAnyMenuOpen={isMenuOpen}
              onPress={handleBookPress}
              menuIsRemote={isRemote}
              menuFormats={menuFormats}
              menuSelectedFormat={menuSelectedFormat}
              onMenuAction={handleBookMenuAction}
              onMenuOpen={handleMenuOpen}
              onMenuClose={handleMenuClose}
              subscriptionLibraryId={subscriptionLibraryId}
              subscriptionFormat={subscriptionFormat}
            />
          </View>
        );
      }

      return (
        <BookRow
          book={item}
          downloadStatus={status}
          isAnyMenuOpen={isMenuOpen}
          onPress={handleBookPress}
          menuIsRemote={isRemote}
          menuFormats={menuFormats}
          menuSelectedFormat={menuSelectedFormat}
          onMenuAction={handleBookMenuAction}
          onMenuOpen={handleMenuOpen}
          onMenuClose={handleMenuClose}
          horizontalPadding={LIST_PADDING_H}
          subscriptionLibraryId={subscriptionLibraryId}
          subscriptionFormat={subscriptionFormat}
        />
      );
    },
    [
      LIST_PADDING_H,
      bookActiveFormatsById,
      bookDownloadStatusById,
      bookFormatMetaById,
      bookFormatsById,
      cardWidth,
      handleBookMenuAction,
      handleBookPress,
      handleMenuClose,
      handleMenuOpen,
      isGridView,
      isMenuOpen,
      isRemote,
      selectedFormatById,
      selectedLibraryId,
    ],
  );

  const getItemType = useCallback(() => (isGridView ? "grid" : "list"), [isGridView]);

  const header = (
    <>
      <Stack.Screen options={options} />
      {toolbar}
    </>
  );

  if (variant === "loading") {
    return (
      <>
        {header}
        <Screen>
          <EmptyState title={t("library.loading.title")} detail={t("library.loading.detail")} icon={{ ios: "hourglass", android: "hourglass-empty" }} />
        </Screen>
      </>
    );
  }

  if (variant === "invalid") {
    return (
      <>
        {header}
        <Screen>
          <EmptyState title={t("library.notFound.title")} detail={t("library.notFound.detail")} icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }} />
        </Screen>
      </>
    );
  }

  if (variant === "empty") {
    return (
      <>
        {header}
        <Screen>
          <EmptyState
            title={t("library.noLibrary.title")}
            detail={t("library.noLibrary.detail")}
            action={<PrimaryButton title={t("library.addLibrary")} onPress={() => router.push("/settings/add-library")} />}
            icon={{ ios: "books.vertical.fill", android: "library-books" }}
          />
        </Screen>
      </>
    );
  }

  if (variant === "unselected") {
    return (
      <>
        {header}
        <Screen>
          <EmptyState
            title={t("library.unselected.title")}
            detail={t("library.unselected.detail")}
            action={
              <RoundIconButton
                label={t("library.switchLibrary")}
                onPress={openLibrarySwitchMenu}
                icon={<MaterialIcons name="swap-horiz" size={22} color={palette.text} />}
              />
            }
            icon={{ ios: "list.bullet.rectangle", android: "list" }}
          />
        </Screen>
      </>
    );
  }

  const listHeader = (
    <View style={{ marginBottom: isGridView ? 8 : 0, paddingHorizontal: isGridView ? 0 : LIST_PADDING_H }}>
      <SectionHeading
        title={getLibraryDownloadFilterLabel(t, downloadFilter)}
        detail={t("library.bookCountRatio", { visible: visibleBooks.length, total: books.length })}
      />
    </View>
  );

  const emptyState = useMemo(() => {
    if (query.length > 0) {
      return {
        title: t("library.noMatch.search.title"),
        detail: t("library.noMatch.search.detail"),
        icon: { ios: "magnifyingglass", android: "search" } as const,
      };
    }
    if (books.length === 0) {
      return {
        title: t("library.noMatch.empty.title"),
        detail: t("library.noMatch.empty.detail"),
        icon: { ios: "books.vertical", android: "library-books" } as const,
      };
    }
    if (downloadFilter !== "all") {
      return {
        title: t("library.noMatch.filter.title"),
        detail: t("library.noMatch.filter.detail"),
        icon: { ios: "line.3.horizontal.decrease.circle", android: "filter-list" } as const,
      };
    }
    return {
      title: t("library.noMatch.search.title"),
      detail: t("library.noMatch.search.detail"),
      icon: { ios: "magnifyingglass", android: "search" } as const,
    };
  }, [query.length, books.length, downloadFilter, t]);

  return (
    <>
      {header}
      <FlashList
        key={`${viewMode}-${gridColumns}-${activeLibraryId ?? "none"}`}
        data={isLoadingNewContent ? [] : visibleBooks}
        numColumns={isGridView ? gridColumns : 1}
        keyExtractor={(item) => item.id}
        getItemType={getItemType}
        contentInsetAdjustmentBehavior="automatic"
        className="flex-1"
        style={{ backgroundColor: palette.background }}
        contentContainerStyle={{
          paddingHorizontal: isGridView ? GRID_PADDING_H - GRID_HALF_GAP : 0,
          paddingTop: 16,
          paddingBottom: 40,
        }}
        ItemSeparatorComponent={isGridView ? SeparatorGrid : SeparatorList}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          isLoadingNewContent ? (
            <LibrarySkeletonContent
              viewMode={viewMode}
              cardWidth={cardWidth}
              gridColumns={gridColumns}
              gridGap={GRID_GAP}
              listPaddingH={LIST_PADDING_H}
            />
          ) : booksError ? (
            <EmptyState title={t("library.loadError.title")} detail={booksError.message} icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }} />
          ) : (
            <EmptyState title={emptyState.title} detail={emptyState.detail} icon={emptyState.icon} />
          )
        }
        renderItem={renderItem}
      />
    </>
  );
}
