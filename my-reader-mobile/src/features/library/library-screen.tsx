import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { MenuView, type MenuComponentRef } from "@react-native-menu/menu";
import { FlashList } from "@shopify/flash-list";
import { Stack, router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Platform, View, useWindowDimensions } from "react-native";

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar";
import { useThemePalette } from "@/src/design/tokens";

import {
  BookCard,
  BookRow,
  EmptyState,
  HeaderToolbar,
  LibrarySkeletonContent,
  PrimaryButton,
  RoundIconButton,
  Screen,
  SearchField,
  SectionHeading,
  type HeaderToolbarAction,
} from "@/src/components";
import { AndroidMenuRippleButton } from "@/src/components/ui/AndroidMenuRippleButton";
import type { BookItem } from "@/src/data/types";
import { useDebouncedValue } from "@/src/hooks/use-debounced-value";
import { useLibraryBookMeta } from "@/src/hooks/use-library-book-meta";
import { useLibraryBookSearch, type DownloadFilterOption, type SortOption } from "@/src/hooks/use-library-book-search";
import { notifyLibraryRefresh } from "@/src/notifications/download-notifications";
import { useAppStore } from "@/src/store/app-store";
import type { LibraryViewMode } from "@/src/store/app-store.types";
import { useLibraryStore } from "@/src/store/library-store";
import { syncDbNow } from "@/src/sync/db_sync";
import { useSyncActions } from "@/src/sync/useSyncActions";
import { useBookActions } from "./hooks/useBookActions";

const downloadFilterOptions = [
  { value: "all", label: "全部" },
  { value: "downloaded", label: "已下载" },
  { value: "notDownloaded", label: "未下载" },
  { value: "downloading", label: "正在下载" },
] as const;
const sortOptions = ["书名", "作者", "最近添加"] as const;
const viewOptions: { value: LibraryViewMode; label: string }[] = [
  { value: "grid", label: "网格视图" },
  { value: "list", label: "列表视图" },
];

const defaultSortOption: SortOption = "最近添加";
const GRID_MIN_CARD_WIDTH = 150;
const GRID_MIN_COLUMNS = 2;
const GRID_MAX_COLUMNS = 6;

type LibraryScreenProps = {
  libraryId?: string;
};

/** Returns the display label for the active download-state filter. */
function getDownloadFilterLabel(option: DownloadFilterOption) {
  return downloadFilterOptions.find((item) => item.value === option)?.label ?? "全部";
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
  const palette = useThemePalette();
  const { width } = useWindowDimensions();
  const GRID_GAP = 12;
  const GRID_PADDING_H = 16;
  const gridColumns = getResponsiveGridColumns(width, GRID_GAP, GRID_PADDING_H);
  const GRID_HALF_GAP = GRID_GAP / 2;
  const LIST_PADDING_H = GRID_PADDING_H;
  const cardWidth = (width - GRID_PADDING_H * 2 - GRID_GAP * (gridColumns - 1)) / gridColumns;
  const { activeLibraryId, libraries, books, loadingBooks, refreshingLibraryId, loading, switchLibrary, error, refreshLibrary } =
    useLibraryStore();
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>(defaultSortOption);
  const [downloadFilter, setDownloadFilter] = useState<DownloadFilterOption>("all");
  const [selectedFormatById, setSelectedFormatById] = useState<Record<string, string>>({});
  const viewMode = useAppStore((state) => state.libraryViewMode);
  const setViewMode = useAppStore((state) => state.setLibraryViewMode);
  const dataSources = useAppStore((state) => state.dataSources);
  const debouncedQuery = useDebouncedValue(query, 180);
  const isGridView = viewMode === "grid";
  const syncActions = useSyncActions();


  const [openMenuBookId, setOpenMenuBookId] = useState<string | null>(null);
  const menuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRefreshingIdRef = useRef<string | null>(null);

  const isLoadingNewContent = loadingBooks && !refreshingLibraryId;

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
      "切换书库",
      `当前书库：${selectedLibrary?.name ?? "未选择"}`,
      [
        ...libraries.map((library) => ({
          text: `${effectiveLibraryId === library.id ? "✓ " : ""}${library.name}`,
          onPress: () => applyLibrarySelection(library.id),
        })),
        { text: "关闭", style: "cancel" },
      ]
    );
  }, [applyLibrarySelection, effectiveLibraryId, libraries, selectedLibrary]);

  const handleSyncCurrentLibrary = useCallback(() => {
    if (!selectedLibrary) return;
    void (async () => {
      try {
        await refreshLibrary(selectedLibrary.id);
      } catch (e) {
        console.error("[library-screen] refresh library failed:", e);
      }
      try {
        await syncDbNow(selectedLibrary, dataSources);
      } catch (e) {
        console.error("[library-screen] db sync failed:", e);
      }
    })();
  }, [selectedLibrary, dataSources, refreshLibrary]);

  const leftMenuRef = useRef<MenuComponentRef>(null);
  const rightMenuRef = useRef<MenuComponentRef>(null);

  const androidLeftMenuActions = useMemo(
    () => [
      { id: "refreshLibrary", title: "同步当前书库" },
      {
        id: "switchLibrary",
        title: "切换书库",
        subactions: libraries.map((library) => ({
          id: `switchLibrary:${library.id}`,
          title: `${effectiveLibraryId === library.id ? "✓ " : ""}${library.name}`,
        })),
      },
    ],
    [libraries, effectiveLibraryId],
  );

  const androidRightMenuActions = useMemo(
    () => [
      {
        id: "filter",
        title: "筛选",
        subactions: downloadFilterOptions.map((option) => ({
          id: `filter:${option.value}`,
          title: `${downloadFilter === option.value ? "✓ " : ""}${option.label}`,
        })),
      },
      {
        id: "sort",
        title: "排序",
        subactions: sortOptions.map((option) => ({
          id: `sort:${option}`,
          title: `${sortBy === option ? "✓ " : ""}${option}`,
        })),
      },
      {
        id: "view",
        title: "视图",
        subactions: viewOptions.map((option) => ({
          id: `view:${option.value}`,
          title: `${viewMode === option.value ? "✓ " : ""}${option.label}`,
        })),
      },
    ],
    [downloadFilter, sortBy, viewMode],
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


  useEffect(() => {
    if (prevRefreshingIdRef.current !== null && refreshingLibraryId === null) {
      const storeError = useAppStore.getState().error;
      notifyLibraryRefresh(storeError ? "error" : "done", storeError ?? undefined);
    }
    prevRefreshingIdRef.current = refreshingLibraryId;
  }, [refreshingLibraryId]);

  const isWebdav = selectedLibrary?.sourceType === "webdav";
  const selectedLibraryId = selectedLibrary?.id;

  const { updateContext, handleBookPress, handleBookMenuAction } = useBookActions();

  useEffect(() => {
    updateContext({
      books,
      bookDownloadStatusById,
      bookFormatMetaById,
      fileStateBundle,
      openMenuBookId,
      selectedFormatById,
      selectedLibrary,
      syncActions,
      setSelectedFormatById,
    });
  }, [
    books,
    bookDownloadStatusById,
    bookFormatMetaById,
    fileStateBundle,
    openMenuBookId,
    selectedFormatById,
    selectedLibrary,
    syncActions,
    updateContext,
  ]);

  const emptyLibrariesToolbarRight: HeaderToolbarAction[] = [
    {
      label: "添加书库",
      onPress: () => router.push("/settings/add-library"),
      icon: <SymbolView name="plus" size={18} tintColor={palette.text} />,
      iosSfSymbol: "plus",
    },
  ];

  const unselectedLibraryToolbarRight: HeaderToolbarAction[] = [
    {
      label: "切换书库",
      onPress: openLibrarySwitchMenu,
      icon: <SymbolView name="arrow.left.arrow.right" size={18} tintColor={palette.text} />,
      iosSfSymbol: "arrow.left.arrow.right",
    },
    {
      label: "添加书库",
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
      const subscriptionLibraryId = isWebdav && status === "downloading" ? selectedLibraryId : undefined;
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
              menuIsWebdav={isWebdav}
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
          menuIsWebdav={isWebdav}
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
      isWebdav,
      selectedFormatById,
      selectedLibraryId,
    ],
  );

  const getItemType = useCallback(() => (isGridView ? "grid" : "list"), [isGridView]);

  if (loading && typeof effectiveLibraryId === "string" && !selectedLibrary) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "书库",
            headerLargeTitle: true,
          }}
        />
        <Screen>
          <EmptyState title="正在加载书库" detail="正在读取本地与 WebDAV 书库配置。" icon={{ ios: "hourglass", android: "hourglass-empty" }} />
        </Screen>
      </>
    );
  }

  const showInvalidLibrary =
    typeof effectiveLibraryId === "string" &&
    !selectedLibrary &&
    !loading &&
    libraries.length > 0;

  if (showInvalidLibrary) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "书库",
            headerLargeTitle: true,
          }}
        />
        <Screen>
          <EmptyState title="没有找到这个书库" detail="它可能已被移除，或链接参数已经失效。" icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }} />
        </Screen>
      </>
    );
  }

  if (!loading && libraries.length === 0) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "书库",
            headerLargeTitle: true,
            headerLargeTitleShadowVisible: false,
          }}
        />
        <HeaderToolbar right={emptyLibrariesToolbarRight} />
        <Screen>
          <EmptyState
            title="还没有添加书库"
            detail="先添加一个 Calibre 书库，之后即可在书库标签中浏览图书。"
            action={<PrimaryButton title="添加书库" onPress={() => router.push("/settings/add-library")} />}
            icon={{ ios: "books.vertical.fill", android: "library-books" }}
          />
        </Screen>
      </>
    );
  }

  if (loading && libraries.length === 0) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "书库",
            headerLargeTitle: true,
          }}
        />
        <Screen>
          <EmptyState title="正在加载书库" detail="正在读取本地与 WebDAV 书库配置。" icon={{ ios: "hourglass", android: "hourglass-empty" }} />
        </Screen>
      </>
    );
  }

  if (!selectedLibrary) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "书库",
            headerLargeTitle: true,
          }}
        />
        <HeaderToolbar right={unselectedLibraryToolbarRight} />
        <Screen>
          <EmptyState
            title="未选择书库"
            detail="请选择要浏览的书库，或添加新的 Calibre 书库。"
            action={
              <RoundIconButton
                label="切换书库"
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
      <SearchField placeholder="搜索书名、作者、标签" value={query} onChangeText={setQuery} />
      <SectionHeading
        title={getDownloadFilterLabel(downloadFilter)}
        detail={`${visibleBooks.length} / ${books.length} 本`}
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
                      accessibilityLabel="书库操作"
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
                      accessibilityLabel="视图配置"
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
              同步当前书库
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.Menu inline title="切换书库">
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
            <Stack.Toolbar.Menu inline title="筛选">
              {downloadFilterOptions.map((option) => (
                <Stack.Toolbar.MenuAction
                  key={`download-filter-${option.value}`}
                  isOn={downloadFilter === option.value}
                  onPress={() => setDownloadFilter(option.value)}
                >
                  {option.label}
                </Stack.Toolbar.MenuAction>
              ))}
            </Stack.Toolbar.Menu>
            <Stack.Toolbar.Menu inline title="排序">
              {sortOptions.map((option) => (
                <Stack.Toolbar.MenuAction key={`sort-${option}`} isOn={sortBy === option} onPress={() => setSortBy(option)}>
                  {option}
                </Stack.Toolbar.MenuAction>
              ))}
            </Stack.Toolbar.Menu>
            <Stack.Toolbar.Menu inline title="视图">
              {viewOptions.map((option) => (
                <Stack.Toolbar.MenuAction
                  key={`view-${option.value}`}
                  isOn={viewMode === option.value}
                  onPress={() => setViewMode(option.value)}
                >
                  {option.label}
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
          ) : error ? (
            <EmptyState title="读取失败" detail={error} icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }} />
          ) : (
            <EmptyState title="没有匹配的图书" detail="请调整搜索词，或确认书库中存在图书。" icon={{ ios: "magnifyingglass", android: "search" }} />
          )
        }
        renderItem={renderItem}
      />
    </>
  );
}
