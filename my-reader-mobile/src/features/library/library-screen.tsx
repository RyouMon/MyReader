import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { MenuView, type MenuComponentRef } from "@react-native-menu/menu";
import { FlashList } from "@shopify/flash-list";
import { Stack, router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { Platform, View, useWindowDimensions } from "react-native";

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar";
import { useThemePalette } from "@/src/design/tokens";

import {
  EmptyState,
  HeaderToolbar,
  PrimaryButton,
  RoundIconButton,
  Screen,
  SearchField,
  SectionHeading,
  type HeaderToolbarAction,
} from "@/src/components";
import {
  BookCard,
  BookRow,
  LibrarySkeletonContent,
} from "@/src/features/library/components/books";
import { AndroidMenuRippleButton } from "@/src/components/ui/AndroidMenuRippleButton";
import type { BookItem } from "@/src/domain/types";
import { isRemoteSourceType } from "@/src/domain/types";
import { useDebouncedValue } from "@/src/hooks/use-debounced-value";
import { useLibraryBookMeta } from "@/src/hooks/use-library-book-meta";
import { useLibraryBookSearch, type DownloadFilterOption, type SortOption } from "@/src/hooks/use-library-book-search";
import { notifyLibraryRefresh } from "@/src/notifications/download-notifications";
import { useAppStore } from "@/src/store/app-store";
import type { LibraryViewMode } from "@/src/store/app-store.types";
import { useBooks, useRefreshLibraryMutation } from "@/src/hooks/queries/useLibraryQuery";
import { useLibraryActions } from "@/src/hooks/use-library-actions";
import { useSyncActions } from "@/src/hooks/useSyncActions";
import { useBookActions } from "./hooks/useBookActions";

const downloadFilterOptions = [
  { value: "all", labelKey: "library.filter.all" as const },
  { value: "downloaded", labelKey: "library.filter.downloaded" as const },
  { value: "notDownloaded", labelKey: "library.filter.notDownloaded" as const },
  { value: "downloading", labelKey: "library.filter.downloading" as const },
] as const;
const sortOptions: { value: SortOption; labelKey: string }[] = [
  { value: "title", labelKey: "library.sort.title" },
  { value: "author", labelKey: "library.sort.author" },
  { value: "recentlyAdded", labelKey: "library.sort.recentlyAdded" },
];
const viewOptions: { value: LibraryViewMode; labelKey: string }[] = [
  { value: "grid", labelKey: "library.view.grid" },
  { value: "list", labelKey: "library.view.list" },
];

const defaultSortOption: SortOption = "recentlyAdded";
const GRID_MIN_CARD_WIDTH = 150;
const GRID_MIN_COLUMNS = 2;
const GRID_MAX_COLUMNS = 6;

type LibraryScreenProps = {
  libraryId?: string;
};

/** Returns the display label for the active download-state filter. */
function getDownloadFilterLabel(t: (key: string) => string, option: DownloadFilterOption) {
  const item = downloadFilterOptions.find((item) => item.value === option);
  return item ? t(item.labelKey) : t("library.filter.all");
}

/** Computes responsive grid columns so larger screens can show more books per row. */
function getResponsiveGridColumns(containerWidth: number, gap: number, horizontalPadding: number): number {
  const availableWidth = Math.max(0, containerWidth - horizontalPadding * 2);
  const estimatedColumns = Math.floor((availableWidth + gap) / (GRID_MIN_CARD_WIDTH + gap));
  return Math.max(GRID_MIN_COLUMNS, Math.min(GRID_MAX_COLUMNS, estimatedColumns || GRID_MIN_COLUMNS));
}

const SeparatorGrid = memo(function SeparatorGrid() {
  return <View className="h-3" />;
});
const SeparatorList = memo(function SeparatorList() {
  return null;
});

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
  const { switchLibrary } = useLibraryActions();
  const libraries = useAppStore((s) => s.libraries);
  const activeLibraryId = useAppStore((s) => s.activeLibraryId);
  const storeReady = useAppStore((s) => s.storeReady);
  const { data: books = [], isLoading: loadingBooks, error: booksError } = useBooks(activeLibraryId);
  const refreshMutation = useRefreshLibraryMutation();
  const viewMode = useAppStore((s) => s.libraryViewMode);
  const setViewMode = useAppStore((s) => s.setLibraryViewMode);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>(defaultSortOption);
  const [downloadFilter, setDownloadFilter] = useState<DownloadFilterOption>("all");
  const [selectedFormatById, setSelectedFormatById] = useState<Record<string, string>>({});
  const debouncedQuery = useDebouncedValue(query, 180);
  const isGridView = viewMode === "grid";
  const syncActions = useSyncActions();


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

  const effectiveLibraryId = libraryIdProp ?? activeLibraryId ?? undefined;

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
    [libraries, effectiveLibraryId]
  );

  const { bookFormatsById, bookFormatMetaById, fileStateBundle, bookDownloadStatusById } = useLibraryBookMeta(
    selectedLibrary,
    books,
    selectedFormatById,
  );
  const { visibleBooks } = useLibraryBookSearch(
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
      ]
    );
  }, [applyLibrarySelection, effectiveLibraryId, libraries, selectedLibrary, t]);

  const handleSyncCurrentLibrary = useCallback(() => {
    if (!selectedLibrary) return;
    void (async () => {
      try {
        await refreshMutation.mutateAsync(selectedLibrary.id);
        notifyLibraryRefresh("done");
      } catch (e) {
        console.error("[library-screen] refresh library failed:", e);
        notifyLibraryRefresh("error", e instanceof Error ? e.message : undefined);
      }
      try {
        await syncActions.triggerSync("manual");
      } catch (e) {
        console.error("[library-screen] sync failed:", e);
      }
    })();
  }, [selectedLibrary, refreshMutation, syncActions]);

  const leftMenuRef = useRef<MenuComponentRef>(null);
  const rightMenuRef = useRef<MenuComponentRef>(null);

  const androidLeftMenuActions = useMemo(
    () => [
      { id: "refreshLibrary", title: t("library.syncCurrentLibrary") },
      {
        id: "switchLibrary",
        title: t("library.switchLibrary"),
        subactions: libraries.map((library) => ({
          id: `switchLibrary:${library.id}`,
          title: `${effectiveLibraryId === library.id ? "✓ " : ""}${library.name}`,
        })),
      },
    ],
    [libraries, effectiveLibraryId, t],
  );

  const androidRightMenuActions = useMemo(
    () => [
      {
        id: "filter",
        title: t("library.filterLabel"),
        subactions: downloadFilterOptions.map((option) => ({
          id: `filter:${option.value}`,
          title: `${downloadFilter === option.value ? "✓ " : ""}${t(option.labelKey)}`,
        })),
      },
      {
        id: "sort",
        title: t("library.sortLabel"),
        subactions: sortOptions.map((option) => ({
          id: `sort:${option.value}`,
          title: `${sortBy === option.value ? "✓ " : ""}${t(option.labelKey)}`,
        })),
      },
      {
        id: "view",
        title: t("library.viewLabel"),
        subactions: viewOptions.map((option) => ({
          id: `view:${option.value}`,
          title: `${viewMode === option.value ? "✓ " : ""}${t(option.labelKey)}`,
        })),
      },
    ],
    [downloadFilter, sortBy, viewMode, t],
  );

  function handleAndroidLeftMenuAction(event: string) {
    if (event === "refreshLibrary") {
      handleSyncCurrentLibrary();
      return;
    }
    if (event.startsWith("switchLibrary:")) {
      applyLibrarySelection(event.slice("switchLibrary:".length));
    }
  }

  function handleAndroidRightMenuAction(event: string) {
    if (event.startsWith("filter:")) {
      setDownloadFilter(event.slice("filter:".length) as DownloadFilterOption);
      return;
    }
    if (event.startsWith("sort:")) {
      setSortBy(event.slice("sort:".length) as SortOption);
      return;
    }
    if (event.startsWith("view:")) {
      setViewMode(event.slice("view:".length) as LibraryViewMode);
    }
  }

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
    syncActions,
    setSelectedFormatById,
  );

  const emptyLibrariesToolbarRight: HeaderToolbarAction[] = [
    {
      label: t("library.addLibrary"),
      onPress: () => router.push("/settings/add-library"),
      icon: <SymbolView name="plus" size={18} tintColor={palette.text} />,
      iosSfSymbol: "plus",
    },
  ];

  const unselectedLibraryToolbarRight: HeaderToolbarAction[] = [
    {
      label: t("library.switchLibrary"),
      onPress: openLibrarySwitchMenu,
      icon: <SymbolView name="arrow.left.arrow.right" size={18} tintColor={palette.text} />,
      iosSfSymbol: "arrow.left.arrow.right",
    },
    {
      label: t("library.addLibrary"),
      onPress: () => router.push("/settings/add-library"),
      icon: <SymbolView name="plus" size={18} tintColor={palette.text} />,
      iosSfSymbol: "plus",
    },
  ];

  const isMenuOpen = openMenuBookId !== null;

  const renderItem = useCallback(
    ({ item }: { item: BookItem }) => {
      const status = bookDownloadStatusById[item.id] ?? "notDownloaded";
      const effectiveFormat = bookFormatMetaById.get(item.id)?.effectiveFormat;
      const subscriptionLibraryId = isRemote && status === "downloading" ? selectedLibraryId : undefined;
      const subscriptionFormat = subscriptionLibraryId ? effectiveFormat : undefined;
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

  if (!storeReady && typeof effectiveLibraryId === "string" && !selectedLibrary) {
    return (
      <>
        <Stack.Screen
          options={{
            title: t("library.title"),
            headerLargeTitle: true,
          }}
        />
        <Screen>
          <EmptyState title={t("library.loading.title")} detail={t("library.loading.detail")} icon={{ ios: "hourglass", android: "hourglass-empty" }} />
        </Screen>
      </>
    );
  }

  const showInvalidLibrary =
    typeof effectiveLibraryId === "string" &&
    !selectedLibrary &&
    !storeReady &&
    libraries.length > 0;

  if (showInvalidLibrary) {
    return (
      <>
        <Stack.Screen
          options={{
            title: t("library.title"),
            headerLargeTitle: true,
          }}
        />
        <Screen>
          <EmptyState title={t("library.notFound.title")} detail={t("library.notFound.detail")} icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }} />
        </Screen>
      </>
    );
  }

  if (!storeReady && libraries.length === 0) {
    return (
      <>
        <Stack.Screen
          options={{
            title: t("library.title"),
            headerLargeTitle: true,
            headerLargeTitleShadowVisible: false,
          }}
        />
        <HeaderToolbar right={emptyLibrariesToolbarRight} />
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

  if (storeReady && libraries.length === 0) {
    return (
      <>
        <Stack.Screen
          options={{
            title: t("library.title"),
            headerLargeTitle: true,
          }}
        />
        <Screen>
          <EmptyState title={t("library.loading.title")} detail={t("library.loading.detail")} icon={{ ios: "hourglass", android: "hourglass-empty" }} />
        </Screen>
      </>
    );
  }

  if (!selectedLibrary) {
    return (
      <>
        <Stack.Screen
          options={{
            title: t("library.title"),
            headerLargeTitle: true,
          }}
        />
        <HeaderToolbar right={unselectedLibraryToolbarRight} />
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
    <View className="gap-5" style={{ marginBottom: isGridView ? 8 : 0, paddingHorizontal: isGridView ? 0 : LIST_PADDING_H }}>
      <SearchField placeholder={t("library.searchPlaceholder")} value={query} onChangeText={setQuery} />
      <SectionHeading
        title={getDownloadFilterLabel(t, downloadFilter)}
        detail={t("library.bookCountRatio", { visible: visibleBooks.length, total: books.length })}
      />
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: selectedLibrary.name,
          headerLargeTitle: true,
          headerLeft:
            Platform.OS !== "ios"
              ? () => (
                  <View className="h-10 w-10">
                    <MenuView
                      ref={leftMenuRef}
                      actions={androidLeftMenuActions}
                      onPressAction={({ nativeEvent }) => handleAndroidLeftMenuAction(nativeEvent.event)}
                      style={{ position: "absolute", top: 0, left: 0, width: 40, height: 40, opacity: 0 }}
                    >
                      <View className="h-10 w-10" />
                    </MenuView>
                    <AndroidMenuRippleButton
                      menuRef={leftMenuRef}
                      icon={<MaterialIcons name="more-vert" size={22} color={palette.text} />}
                      accessibilityLabel={t("library.libraryActions")}
                    />
                  </View>
                )
              : undefined,
          headerRight:
            Platform.OS !== "ios"
              ? () => (
                  <View className="h-10 w-10">
                    <MenuView
                      ref={rightMenuRef}
                      actions={androidRightMenuActions}
                      isAnchoredToRight
                      onPressAction={({ nativeEvent }) => handleAndroidRightMenuAction(nativeEvent.event)}
                      style={{ position: "absolute", top: 0, left: 0, width: 40, height: 40, opacity: 0 }}
                    >
                      <View className="h-10 w-10" />
                    </MenuView>
                    <AndroidMenuRippleButton
                      menuRef={rightMenuRef}
                      icon={<MaterialIcons name="tune" size={22} color={palette.text} />}
                      accessibilityLabel={t("library.viewConfig")}
                    />
                  </View>
                )
              : undefined,
        }}
      />
      {Platform.OS === "ios" ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Menu icon="ellipsis">
            <Stack.Toolbar.MenuAction onPress={handleSyncCurrentLibrary}>
              {t("library.syncCurrentLibrary")}
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.Menu inline title={t("library.switchLibrary")}>
              {libraries.map((library) => (
                <Stack.Toolbar.MenuAction
                  key={`library-${library.id}`}
                  isOn={effectiveLibraryId === library.id}
                  onPress={() => applyLibrarySelection(library.id)}
                >
                  {library.name}
                </Stack.Toolbar.MenuAction>
              ))}
            </Stack.Toolbar.Menu>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      ) : null}
      {Platform.OS === "ios" ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Menu icon="line.3.horizontal.decrease">
            <Stack.Toolbar.Menu inline title={t("library.filterLabel")}>
              {downloadFilterOptions.map((option) => (
                <Stack.Toolbar.MenuAction
                  key={`download-filter-${option.value}`}
                  isOn={downloadFilter === option.value}
                  onPress={() => setDownloadFilter(option.value)}
                >
                  {t(option.labelKey)}
                </Stack.Toolbar.MenuAction>
              ))}
            </Stack.Toolbar.Menu>
            <Stack.Toolbar.Menu inline title={t("library.sortLabel")}>
              {sortOptions.map((option) => (
                <Stack.Toolbar.MenuAction key={`sort-${option.value}`} isOn={sortBy === option.value} onPress={() => setSortBy(option.value)}>
                  {t(option.labelKey)}
                </Stack.Toolbar.MenuAction>
              ))}
            </Stack.Toolbar.Menu>
            <Stack.Toolbar.Menu inline title={t("library.viewLabel")}>
              {viewOptions.map((option) => (
                <Stack.Toolbar.MenuAction
                  key={`view-${option.value}`}
                  isOn={viewMode === option.value}
                  onPress={() => setViewMode(option.value)}
                >
                  {t(option.labelKey)}
                </Stack.Toolbar.MenuAction>
              ))}
            </Stack.Toolbar.Menu>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      ) : null}
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
            <EmptyState title={t("library.noMatch.title")} detail={t("library.noMatch.detail")} icon={{ ios: "magnifyingglass", android: "search" }} />
          )
        }
        renderItem={renderItem}
      />
    </>
  );
}
