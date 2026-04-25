import { useEffect, useMemo, useState } from "react";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Stack, router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { FlashList } from "@shopify/flash-list";
import { FlatList, Platform, View, useWindowDimensions } from "react-native";

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar";
import { useThemePalette } from "@/src/design/tokens";

import {
  BookCard,
  BookRow,
  EmptyState,
  FilterChip,
  HeaderToolbar,
  PrimaryButton,
  RoundIconButton,
  Screen,
  SearchField,
  SectionHeading,
  type HeaderToolbarAction,
} from "../components";
import { useDebouncedValue } from "../hooks/use-debounced-value";
import { useAppStore } from "../store/app-store";
import type { LibraryViewMode } from "../store/app-store.types";
import { useLibraryStore } from "../store/library-store";

const libraryFilters = ["全部", "已加入"] as const;
const sortOptions = ["书名", "作者", "最近添加"] as const;
const viewOptions: { value: LibraryViewMode; label: string }[] = [
  { value: "grid", label: "网格视图" },
  { value: "list", label: "列表视图" },
];

type SortOption = (typeof sortOptions)[number];

type LibraryScreenProps = {
  libraryId?: string;
};

/** Returns the display label for a persisted library view mode. */
function getViewModeLabel(mode: LibraryViewMode) {
  return viewOptions.find((option) => option.value === mode)?.label ?? "网格视图";
}

export default function LibraryScreen({ libraryId: libraryIdProp }: LibraryScreenProps) {
  const palette = useThemePalette();
  const { width } = useWindowDimensions();
  const gridColumns = width >= 768 ? 4 : 2;
  const GRID_GAP = 12;
  const GRID_PADDING_H = 16;
  const GRID_HALF_GAP = GRID_GAP / 2;
  const LIST_PADDING_H = GRID_PADDING_H;
  const cardWidth = (width - GRID_PADDING_H * 2 - GRID_GAP * (gridColumns - 1)) / gridColumns;
  const { activeLibraryId, libraries, books, loadingBooks, loadingLibraries, setActiveLibrary, error } =
    useLibraryStore();
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>(sortOptions[0]);
  const viewMode = useAppStore((state) => state.libraryViewMode);
  const setViewMode = useAppStore((state) => state.setLibraryViewMode);
  const debouncedQuery = useDebouncedValue(query, 180);
  const isGridView = viewMode === "grid";

  function openLibraryPicker() {
    router.push("/library/picker");
  }

  const effectiveLibraryId = libraryIdProp ?? activeLibraryId ?? undefined;

  const selectedLibrary = useMemo(
    () => (effectiveLibraryId ? libraries.find((library) => library.id === effectiveLibraryId) ?? null : null),
    [libraries, effectiveLibraryId]
  );

  useEffect(() => {
    if (!libraryIdProp || !selectedLibrary || libraryIdProp === activeLibraryId) {
      return;
    }

    void setActiveLibrary(libraryIdProp);
  }, [activeLibraryId, libraryIdProp, selectedLibrary, setActiveLibrary]);

  const visibleBooks = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase();
    const filteredBooks = !needle
      ? books
      : books.filter((book) => {
          const authorMatches = book.authors?.some((author) => author.toLowerCase().includes(needle));
          return (
            book.title.toLowerCase().includes(needle) ||
            book.author.toLowerCase().includes(needle) ||
            Boolean(authorMatches)
          );
        });

    return [...filteredBooks].sort((left, right) => {
      switch (sortBy) {
        case "作者":
          return left.author.localeCompare(right.author, "zh-CN");
        case "最近添加":
          return right.id.localeCompare(left.id, "zh-CN", { numeric: true });
        case "书名":
        default:
          return left.title.localeCompare(right.title, "zh-CN");
      }
    });
  }, [books, debouncedQuery, sortBy]);

  function openBookDetail(bookId: string) {
    router.push({ pathname: "/book/[id]", params: { id: bookId } });
  }

  function applySort(option: SortOption) {
    setSortBy(option);
  }

  function applyView(option: LibraryViewMode) {
    setViewMode(option);
  }

  function openSortViewMenu() {
    showAlertWithStatusBarRestore(
      "排序与视图",
      `当前排序：${sortBy}\n当前视图：${getViewModeLabel(viewMode)}`,
      [
        ...sortOptions.map((option) => ({
          text: `${sortBy === option ? "✓ " : ""}排序：${option}`,
          onPress: () => applySort(option),
        })),
        ...viewOptions.map((option) => ({
          text: `${viewMode === option.value ? "✓ " : ""}视图：${option.label}`,
          onPress: () => applyView(option.value),
        })),
        { text: "关闭", style: "cancel" },
      ]
    );
  }

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
      onPress: openLibraryPicker,
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

  const selectedLibraryToolbarLeft: HeaderToolbarAction[] = [
    {
      label: "切换书库",
      onPress: openLibraryPicker,
      icon: <SymbolView name="arrow.left.arrow.right" size={18} tintColor={palette.text} />,
      iosSfSymbol: "arrow.left.arrow.right",
      iconOnly: true,
    },
  ];

  const selectedLibraryToolbarRight: HeaderToolbarAction[] = [
    {
      label: "排序与视图",
      onPress: openSortViewMenu,
      icon: <MaterialIcons name="tune" size={22} color={palette.text} />,
      iosSfSymbol: "slider.horizontal.3",
      iconOnly: true,
    },
  ];

  if (loadingLibraries && typeof effectiveLibraryId === "string" && !selectedLibrary) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "书库",
            headerLargeTitle: true,
          }}
        />
        <Screen>
          <EmptyState title="正在加载书库" detail="正在读取本地与 WebDAV 书库配置。" />
        </Screen>
      </>
    );
  }

  const showInvalidLibrary =
    typeof effectiveLibraryId === "string" &&
    !selectedLibrary &&
    !loadingLibraries &&
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
          <EmptyState title="没有找到这个书库" detail="它可能已被移除，或链接参数已经失效。" />
        </Screen>
      </>
    );
  }

  if (!loadingLibraries && libraries.length === 0) {
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
          />
        </Screen>
      </>
    );
  }

  if (loadingLibraries && libraries.length === 0) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "书库",
            headerLargeTitle: true,
          }}
        />
        <Screen>
          <EmptyState title="正在加载书库" detail="正在读取本地与 WebDAV 书库配置。" />
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
                onPress={openLibraryPicker}
                icon={<MaterialIcons name="swap-horiz" size={22} color={palette.text} />}
              />
            }
          />
        </Screen>
      </>
    );
  }

  const listHeader = (
    <View style={{ gap: 20, marginBottom: isGridView ? 8 : 0, paddingHorizontal: isGridView ? 0 : LIST_PADDING_H }}>
      <SearchField placeholder="搜索书名、作者、标签" value={query} onChangeText={setQuery} />
      <FlatList
        horizontal
        data={libraryFilters}
        keyExtractor={(item) => item}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
        renderItem={({ item }) => <FilterChip label={item} active={item === libraryFilters[0]} />}
      />
      <SectionHeading title="全部书籍" detail={`${visibleBooks.length} / ${books.length} 本`} />
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: selectedLibrary.name,
          headerLargeTitle: true,
        }}
      />
      <HeaderToolbar left={selectedLibraryToolbarLeft} right={Platform.OS === "ios" ? undefined : selectedLibraryToolbarRight} />
      {Platform.OS === "ios" ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Menu icon="line.3.horizontal.decrease.circle">
            {sortOptions.map((option) => (
              <Stack.Toolbar.MenuAction key={`sort-${option}`} isOn={sortBy === option} onPress={() => applySort(option)}>
                {`排序: ${option}`}
              </Stack.Toolbar.MenuAction>
            ))}
            <Stack.Toolbar.Menu inline title="视图">
              {viewOptions.map((option) => (
                <Stack.Toolbar.MenuAction
                  key={`view-${option.value}`}
                  isOn={viewMode === option.value}
                  onPress={() => applyView(option.value)}
                >
                  {option.label}
                </Stack.Toolbar.MenuAction>
              ))}
            </Stack.Toolbar.Menu>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      ) : null}
      <FlashList
        key={`${viewMode}-${gridColumns}`}
        data={loadingBooks ? [] : visibleBooks}
        numColumns={isGridView ? gridColumns : 1}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: palette.background }}
        contentContainerStyle={{
          paddingHorizontal: isGridView ? GRID_PADDING_H - GRID_HALF_GAP : 0,
          paddingTop: 16,
          paddingBottom: 40,
        }}
        ItemSeparatorComponent={() => <View style={{ height: isGridView ? GRID_GAP : 0 }} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          loadingBooks
            ? <EmptyState title="正在读取书库" detail="正在解析 metadata.db 并读取图书列表。" />
            : <EmptyState title={error ? "读取失败" : "没有匹配的图书"} detail={error ?? "请调整搜索词，或确认书库中存在图书。"} />
        }
        renderItem={({ item, index }) =>
          isGridView ? (
            <View style={{ paddingHorizontal: GRID_HALF_GAP }}>
              <BookCard book={item} width={cardWidth} onPress={() => openBookDetail(item.id)} />
            </View>
          ) : (
            <BookRow book={item} onPress={() => openBookDetail(item.id)} horizontalPadding={LIST_PADDING_H} />
          )
        }
      />
    </>
  );
}
