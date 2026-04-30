import { useMemo, useState } from "react";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar";
import type { DataSource, Library } from "@/src/data/types";
import { useThemePalette } from "@/src/design/tokens";
import { notifyLibraryRefresh } from "@/src/notifications/download-notifications";
import { useAppStore } from "../store/app-store";
import { Text, View } from "@/tw";

import { Screen } from "@/src/components/ui/screen";
import { Button } from "@/src/components/ui/button";
import { HeaderToolbar, SectionCard, SettingsRow, type HeaderToolbarAction } from "../components";
import { useLibraryStore } from "../store/library-store";

function formatBookCount(count: number) {
  return `${count.toLocaleString("zh-CN")} 本`;
}

function formatDate(timestamp?: number) {
  if (!timestamp) {
    return "—";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getSourceTypeLabel(library: Library) {
  return library.sourceType === "webdav" ? "WebDAV" : "本地";
}

function getLibraryTypeLabel(_library: Library) {
  return "Calibre 书库";
}

function getSourcePathDetail(library: Library, dataSource?: DataSource | null) {
  if (library.sourceType === "webdav" && dataSource?.type === "webdav") {
    return `${dataSource.endpoint}${library.sourcePath ?? (dataSource.rootPath ?? "")}`;
  }

  return library.path;
}

function DetailHero({ library, accent, isActive }: { library: Library; accent: string; isActive: boolean }) {
  const palette = useThemePalette();

  return (
    <View className="items-center gap-5 pb-1 pt-2">
      <View
        className="size-36 items-center justify-center rounded-[32px] border"
        style={{
          backgroundColor: palette.surface,
          borderColor: palette.border,
          shadowColor: accent,
          shadowOpacity: Platform.OS === "ios" ? 0.12 : 0,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: Platform.OS === "android" ? 2 : 0,
        }}
      >
        <SymbolView
          accessibilityLabel="书库"
          fallback={
            <MaterialIcons accessibilityLabel="书库" name="auto-stories" size={80} color={accent} />
          }
          name={{
            ios: "books.vertical.fill",
            android: "library_books",
          }}
          resizeMode="scaleAspectFit"
          size={80}
          tintColor={accent}
          weight="medium"
        />
      </View>

      <View className="items-center gap-2">
        <Text
          className="text-center text-[32px] leading-[38px]"
          style={{
            color: palette.text,
            fontFamily: undefined,
            fontWeight: "700",
            letterSpacing: -0.4,
          }}
        >
          {library.name}
        </Text>
        <Text className="text-sm font-medium" style={{ color: palette.textMuted }}>
          {formatBookCount(library.bookCount)}
          {isActive ? " · 当前使用" : ""}
        </Text>
      </View>
    </View>
  );
}

export default function LibraryDetailScreen() {
  const { libraryId } = useLocalSearchParams<{ libraryId?: string }>();
  const palette = useThemePalette();
  const { libraries, activeLibraryId, removeLibrary, refreshLibrary, switchLibrary } = useLibraryStore();
  const dataSources = useAppStore((state) => state.dataSources);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const libraryIndex = useMemo(
    () => libraries.findIndex((item) => item.id === libraryId),
    [libraries, libraryId]
  );
  const library = libraryIndex >= 0 ? libraries[libraryIndex] ?? null : null;
  const linkedDataSource = useMemo(
    () => dataSources.find((source) => source.id === library?.dataSourceId) ?? null,
    [dataSources, library?.dataSourceId]
  );
  const isActive = library?.id === activeLibraryId;
  const accent = palette.primary;

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/settings");
  }

  function confirmDelete() {
    if (!library) {
      return;
    }

    showAlertWithStatusBarRestore(
      "删除这个书库？",
      "将从应用中移除该书库，但原始书库文件仍保留在原位置，如不再需要请手工删除。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: () => {
            void (async () => {
              await removeLibrary(library.id);
              handleBack();
            })();
          },
        },
      ]
    );
  }

  const rightToolbar: HeaderToolbarAction[] = library
    ? [
        {
          label: "删除书库",
          onPress: confirmDelete,
          icon:
            Platform.OS === "ios" ? (
              <SymbolView name="trash" size={16} tintColor={palette.destructive} />
            ) : (
              <MaterialIcons name="delete-outline" size={22} color={palette.destructive} />
            ),
          iosSfSymbol: "trash",
          color: palette.destructive,
          iconOnly: true,
          variant: "prominent",
        },
      ]
    : [];

  if (!library) {
    return (
      <Screen>
        <View className="flex-1">
          <HeaderToolbar />
          <View className="flex-1 items-center justify-center">
            <Text className="text-[24px] font-bold" style={{ color: palette.text }}>
              没有找到这个书库
            </Text>
            <Text className="mt-3 text-center text-sm leading-6" style={{ color: palette.textMuted }}>
              它可能已经被移除，或者当前链接参数已经失效。
            </Text>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="flex-1" style={{ backgroundColor: palette.background }}>
        <HeaderToolbar right={rightToolbar} />
          <View className="flex-1 gap-8">
            <DetailHero library={library} accent={accent} isActive={Boolean(isActive)} />
            <View className="items-center">
              <View className="w-full flex-row gap-3 px-4" style={{ maxWidth: 400 }}>
                <Button
                  className="flex-1"
                  disabled={Boolean(isActive)}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    void switchLibrary(library.id);
                  }}
                  title="使用该书库"
                  variant="primary"
                />
                <Button
                  className="flex-1"
                  disabled={isRefreshing}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    void (async () => {
                      setIsRefreshing(true);
                      await refreshLibrary(library.id);
                      setIsRefreshing(false);
                      const storeError = useAppStore.getState().error;
                      if (!storeError) {
                        notifyLibraryRefresh("done");
                      }
                    })();
                  }}
                  title={isRefreshing ? "更新中..." : "更新书库"}
                  variant="secondary"
                />
              </View>
            </View>
            <SectionCard>
              <SettingsRow title="书库类型" detail={getLibraryTypeLabel(library)} />
              <SettingsRow title="数据源类型" detail={getSourceTypeLabel(library)} />
              <SettingsRow title="书库路径" detail={getSourcePathDetail(library, linkedDataSource)} />
              <SettingsRow title="收录图书数量" detail={formatBookCount(library.bookCount)} />
              <SettingsRow title="添加时间" detail={formatDate(library.addedAt)} isLast />
            </SectionCard>
          </View>
      </View>
    </Screen>
  );
}
