import { useEffect, useMemo, useState } from "react";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Stack, router } from "expo-router";
import { ActionSheetIOS, Alert, FlatList, Platform } from "react-native";

import { useThemePalette } from "@/src/design/tokens";

import { EmptyState, FilterChip, LibraryGrid, RoundIconButton, Screen, SearchField, SectionHeading } from "../components";
import { useDebouncedValue } from "../hooks/use-debounced-value";
import { useLibraryStore } from "../store/library-store";

const libraryFilters = ["全部", "已加入"];
const sortOptions = ["书名", "作者", "最近添加"];
const viewOptions = ["网格视图"];

export default function LibraryScreen({ libraryId }: { libraryId?: string }) {
  const palette = useThemePalette();
  const { activeLibraryId, libraries, books, loadingBooks, setActiveLibrary, error } = useLibraryStore();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 180);

  const selectedLibrary = useMemo(
    () => libraries.find((library) => library.id === libraryId) ?? null,
    [libraries, libraryId]
  );

  useEffect(() => {
    if (!libraryId || !selectedLibrary || libraryId === activeLibraryId) {
      return;
    }

    void setActiveLibrary(libraryId);
  }, [activeLibraryId, libraryId, selectedLibrary, setActiveLibrary]);

  const visibleBooks = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase();
    if (!needle) return books;
    return books.filter((book) => {
      const authorMatches = book.authors?.some((author) => author.toLowerCase().includes(needle));
      return book.title.toLowerCase().includes(needle) || book.author.toLowerCase().includes(needle) || Boolean(authorMatches);
    });
  }, [books, debouncedQuery]);

  const menuOptions = useMemo(
    () => [
      ...sortOptions.map((option, index) => `${index === 0 ? "排序: 当前 · " : "排序: "}${option}`),
      ...viewOptions.map((option, index) => `${index === 0 ? "视图: 当前 · " : "视图: "}${option}`),
    ],
    []
  );

  function openBookDetail(bookId: string) {
    router.push({ pathname: "/library/book/[id]", params: { id: bookId } });
  }

  function openNativeMenu() {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...menuOptions, "取消"],
          cancelButtonIndex: menuOptions.length,
          userInterfaceStyle: palette.background === "#1C1916" ? "dark" : "light",
        },
        () => {}
      );
      return;
    }
    Alert.alert("排序与视图", menuOptions.join("\n"), [{ text: "关闭", style: "cancel" }]);
  }

  if (!selectedLibrary) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "书库",
          }}
        />
        <Screen>
          <EmptyState title="没有找到这个书库" detail="它可能已被移除，或链接参数已经失效。" />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: selectedLibrary.name,
          headerLargeTitle: false,
          headerRight: () => (
              <RoundIconButton
                label="排序与视图"
                onPress={openNativeMenu}
                icon={<MaterialIcons name="tune" size={30} color={palette.text} />}
              />
          ),
        }}
      />
      <Screen>
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

        {loadingBooks ? (
          <EmptyState title="正在读取书库" detail="正在解析 metadata.db 并读取图书列表。" />
        ) : visibleBooks.length > 0 ? (
          <LibraryGrid data={visibleBooks} onSelectBook={(book) => openBookDetail(book.id)} />
        ) : (
          <EmptyState title={error ? "读取失败" : "没有匹配的图书"} detail={error ?? "请调整搜索词，或确认书库中存在图书。"} />
        )}
      </Screen>
    </>
  );
}
