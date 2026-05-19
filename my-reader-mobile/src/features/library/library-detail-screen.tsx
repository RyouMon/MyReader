import { useMemo, useState } from "react";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar";
import type { DataSource, Library } from "@/src/data/types";
import { useThemePalette } from "@/src/design/tokens";
import { notifyLibraryRefresh } from "@/src/notifications/download-notifications";
import { useAppStore } from "@/src/store/app-store";
import { Text, View } from "@/tw";

import { Screen } from "@/src/components/ui/screen";
import { Button } from "@/src/components/ui/button";
import { HeaderToolbar, SectionCard, SettingsRow, type HeaderToolbarAction } from "@/src/components";
import { useLibraryStore } from "@/src/store/library-store";

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

function getSourceTypeLabel(t: (key: string) => string, library: Library) {
  return library.sourceType === "webdav" ? t("libraryDetail.typeWebdav") : t("libraryDetail.typeLocal");
}

function getLibraryTypeLabel(t: (key: string) => string) {
  return t("libraryDetail.calibreLibrary");
}

function getSourcePathDetail(library: Library, dataSource?: DataSource | null) {
  if (library.sourceType === "webdav" && dataSource?.type === "webdav") {
    return `${dataSource.endpoint}${library.sourcePath ?? (dataSource.rootPath ?? "")}`;
  }

  return library.path;
}

function DetailHero({ library, accent, isActive, t }: { library: Library; accent: string; isActive: boolean; t: (key: string, options?: Record<string, unknown>) => string }) {
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
          accessibilityLabel={t("libraryDetail.libraryLabel")}
          fallback={
            <MaterialIcons accessibilityLabel={t("libraryDetail.libraryLabel")} name="auto-stories" size={80} color={accent} />
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
          {t("libraryDetail.bookCount", { count: library.bookCount })}
          {isActive ? t("libraryDetail.currentlyUsed") : ""}
        </Text>
      </View>
    </View>
  );
}

export default function LibraryDetailScreen() {
  const { t } = useTranslation();
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
      t("libraryDetail.delete.title"),
      t("libraryDetail.delete.message"),
      [
        { text: t("libraryDetail.delete.cancel"), style: "cancel" },
        {
          text: t("libraryDetail.delete.confirm"),
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
          label: t("libraryDetail.deleteLibrary"),
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
              {t("libraryDetail.notFound.title")}
            </Text>
            <Text className="mt-3 text-center text-sm leading-6" style={{ color: palette.textMuted }}>
              {t("libraryDetail.notFound.detail")}
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
            <DetailHero library={library} accent={accent} isActive={Boolean(isActive)} t={t} />
            <View className="items-center">
              <View className="w-full flex-row gap-3 px-4" style={{ maxWidth: 400 }}>
                <Button
                  className="flex-1"
                  disabled={Boolean(isActive)}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    void switchLibrary(library.id);
                  }}
                  title={t("libraryDetail.useLibrary")}
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
                  title={isRefreshing ? t("libraryDetail.refreshing") : t("libraryDetail.refresh")}
                  variant="secondary"
                />
              </View>
            </View>
            <SectionCard>
              <SettingsRow title={t("libraryDetail.libraryType")} detail={getLibraryTypeLabel(t)} />
              <SettingsRow title={t("libraryDetail.sourceType")} detail={getSourceTypeLabel(t, library)} />
              <SettingsRow title={t("libraryDetail.libraryPath")} detail={getSourcePathDetail(library, linkedDataSource)} />
              <SettingsRow title={t("libraryDetail.bookCountLabel")} detail={t("libraryDetail.bookCount", { count: library.bookCount })} />
              <SettingsRow title={t("libraryDetail.addedAt")} detail={formatDate(library.addedAt)} isLast />
            </SectionCard>
          </View>
      </View>
    </Screen>
  );
}
