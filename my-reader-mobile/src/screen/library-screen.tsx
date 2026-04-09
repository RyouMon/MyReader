import { useEffect, useMemo, useState } from "react";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Stack, router } from "expo-router";
import { ActionSheetIOS, Alert, FlatList, Platform, View } from "react-native";

import { useThemePalette } from "@/src/design/tokens";

import { EmptyState, FilterChip, LibraryGrid, RoundIconButton, Screen, SearchField, SectionHeading } from "../components";
import { useDebouncedValue } from "../hooks/use-debounced-value";
import { useLibraryStore } from "../store/library-store";

const libraryFilters = ["全部", "已加入"];
const sortOptions = ["书名", "作者", "最近添加"];
const viewOptions = ["网格视图"];

type LibraryScreenProps = {
  /** 若省略则使用 store 中的当前书库（根路由默认如此）。 */
  libraryId?: string;
};

export default function LibraryScreen({ libraryId: libraryIdProp }: LibraryScreenProps) {
  const palette = useThemePalette();
  const { activeLibraryId, libraries, books, loadingBooks, loadingLibraries, setActiveLibrary, addLibrary, error } =
    useLibraryStore();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 180);

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
    router.push({ pathname: "/book/[id]", params: { id: bookId } });
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

  /** 书库列表或元数据仍在拉取，当前 id 暂时解析不到：不要当成「找不到书库」。 */
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

  /** 仅在书库列表已就绪且其中不包含当前 id 时视为失效（避免持久化 id 已恢复但 libraries 仍在加载时误判）。 */
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
            headerRight: () => (
              <RoundIconButton
                label="添加书库"
                onPress={() => void addLibrary()}
                icon={<MaterialIcons name="add" size={22} color={palette.text} />}
              />
            ),
          }}
        />
        <Screen>
          <EmptyState
            title="还没有添加书库"
            detail="先添加一个 Calibre 书库，之后即可在书库标签中浏览图书。"
            action={<RoundIconButton label="添加书库" onPress={() => void addLibrary()} />}
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
            headerRight: () => (
              <View className="flex-row items-center gap-2">
                <RoundIconButton
                  label="切换书库"
                  onPress={openLibraryPicker}
                  icon={<MaterialIcons name="swap-horiz" size={22} color={palette.text} />}
                />
                <RoundIconButton
                  label="添加书库"
                  onPress={() => void addLibrary()}
                  icon={<MaterialIcons name="add" size={22} color={palette.text} />}
                />
              </View>
            ),
          }}
        />
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

  return (
    <>
      <Stack.Screen
        options={{
          title: selectedLibrary.name,
          headerLargeTitle: true,
          headerLeft: () => (
            <RoundIconButton
              label="切换书库"
              onPress={openLibraryPicker}
              icon={<MaterialIcons name="swap-horiz" size={22} color={palette.text} />}
            />
          ),
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
