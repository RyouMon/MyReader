import { useMemo, useState } from "react";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Stack, router } from "expo-router";
import { View } from "react-native";

import { useThemePalette } from "@/src/design/tokens";

import { EmptyState, RoundIconButton, Screen, SearchField, SectionCard, SettingsRow } from "../components";
import { useDebouncedValue } from "../hooks/use-debounced-value";
import { useLibraryStore } from "../store/library-store";

function getLibraryIconName(index: number) {
  const icons: (keyof typeof MaterialIcons.glyphMap)[] = [
    "local-library",
    "menu-book",
    "library-books",
    "collections-bookmark",
  ];

  return icons[index % icons.length] ?? "local-library";
}

/**
 * 书库切换列表：由 `/library/picker` 以 Stack `presentation: 'modal'` 呈现（见 Expo Router modals）。
 */
export default function LibraryPickerScreen() {
  const palette = useThemePalette();
  const { libraries, activeLibraryId, loadingLibraries, refreshBooks, addLibrary, setActiveLibrary } = useLibraryStore();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 180);

  const visibleLibraries = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase();
    if (!needle) return libraries;

    return libraries.filter((library) => library.name.toLowerCase().includes(needle));
  }, [debouncedQuery, libraries]);

  function selectLibrary(libraryId: string) {
    void setActiveLibrary(libraryId);
    if (router.canGoBack()) {
      router.back();
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "切换书库",
          headerLargeTitle: false,
          headerShadowVisible: false,
          headerLeft: () => (
            <RoundIconButton
              label="关闭"
              onPress={() => {
                if (router.canGoBack()) router.back();
              }}
              icon={<MaterialIcons name="close" size={22} color={palette.textMuted} />}
            />
          ),
          headerRight: () => (
            <View className="flex-row items-center gap-2">
              <RoundIconButton
                label="刷新书库"
                onPress={() => void refreshBooks()}
                icon={<MaterialIcons name="refresh" size={20} color={palette.textMuted} />}
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
        <SearchField placeholder="搜索书库名称" value={query} onChangeText={setQuery} />

        {loadingLibraries ? (
          <EmptyState title="正在加载书库" detail="正在读取本地与 WebDAV 书库配置。" />
        ) : visibleLibraries.length > 0 ? (
          <SectionCard>
            {visibleLibraries.map((library, index) => {
              const isActive = library.id === activeLibraryId;

              return (
                <SettingsRow
                  key={library.id}
                  onPress={() => selectLibrary(library.id)}
                  isLast={index === visibleLibraries.length - 1}
                  title={library.name}
                  detail={`${library.bookCount.toLocaleString("zh-CN")} 本${isActive ? " · 当前使用" : ""}`}
                  trailing={
                    <View className="flex-row items-center gap-3">
                      <View
                        className="size-10 items-center justify-center rounded-[16px]"
                        style={{ backgroundColor: isActive ? palette.surfaceMuted : palette.background }}
                      >
                        <MaterialIcons
                          name={getLibraryIconName(index)}
                          size={20}
                          color={isActive ? palette.primary : palette.textMuted}
                        />
                      </View>
                      {isActive ? (
                        <MaterialIcons name="check" size={22} color={palette.primary} />
                      ) : (
                        <MaterialIcons name="chevron-right" size={20} color={palette.textMuted} />
                      )}
                    </View>
                  }
                />
              );
            })}
          </SectionCard>
        ) : libraries.length > 0 ? (
          <EmptyState title="没有匹配的书库" detail="试试其他关键词。" />
        ) : (
          <EmptyState
            title="还没有添加书库"
            detail="先添加一个 Calibre 书库，之后可在这里切换书库。"
            action={<RoundIconButton label="添加书库" onPress={() => void addLibrary()} />}
          />
        )}
      </Screen>
    </>
  );
}
