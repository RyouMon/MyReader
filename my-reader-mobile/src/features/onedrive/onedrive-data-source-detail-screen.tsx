import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Platform } from "react-native";

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar";
import { DataSourceInUseError } from "@/src/errors";
import type { DataSourceOnedrive } from "@/src/data/types";
import { useThemePalette } from "@/src/design/tokens";
import { Text, View } from "@/tw";

import { HeaderToolbar, Screen, SectionCard, SettingsRow, type HeaderToolbarAction } from "@/src/components";
import { useAppStore } from "@/src/store/app-store";
import { useDataSourceActions } from "@/src/hooks/use-data-source-actions";

function formatDate(timestamp?: number) {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function OneDriveDetailHero({ source, accent }: { source: DataSourceOnedrive; accent: string }) {
  const { t } = useTranslation();
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
          accessibilityLabel={t("onedrive.sourcesTitle")}
          fallback={<MaterialIcons accessibilityLabel={t("onedrive.sourcesTitle")} name="cloud" size={80} color={accent} />}
          name={{ ios: "cloud.fill", android: "cloud" }}
          resizeMode="scaleAspectFit"
          size={80}
          tintColor={accent}
          weight="medium"
        />
      </View>

      <View className="items-center gap-2">
        <Text
          className="text-center text-[32px] leading-[38px]"
          style={{ color: palette.text, fontFamily: undefined, fontWeight: "700", letterSpacing: -0.4 }}
        >
          {source.name}
        </Text>
        <Text className="px-4 text-center text-sm font-medium" style={{ color: palette.textMuted }} numberOfLines={2}>
          {source.email ?? source.displayName ?? ""}
        </Text>
      </View>
    </View>
  );
}

export default function OneDriveDataSourceDetailScreen() {
  const { t } = useTranslation();
  const { dataSourceId } = useLocalSearchParams<{ dataSourceId?: string }>();
  const palette = useThemePalette();
  const dataSources = useAppStore((state) => state.dataSources);
  const { deleteDataSource } = useDataSourceActions();

  const sourceIndex = useMemo(
    () => dataSources.findIndex((item) => item.id === dataSourceId && item.type === "onedrive"),
    [dataSources, dataSourceId],
  );
  const raw = sourceIndex >= 0 ? dataSources[sourceIndex] : undefined;
  const onedriveSource: DataSourceOnedrive | null = raw?.type === "onedrive" ? raw : null;
  const accent = palette.primary;

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/settings/onedrive");
  }

  function confirmDelete() {
    if (!onedriveSource) return;

    showAlertWithStatusBarRestore(t("onedrive.delete.title"), t("onedrive.delete.confirm", { name: onedriveSource.name }), [
      { text: t("onedrive.delete.cancel"), style: "cancel" },
      {
        text: t("onedrive.delete.confirmButton"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteDataSource(onedriveSource.id);
              handleBack();
            } catch (caught) {
              if (caught instanceof DataSourceInUseError) {
                showAlertWithStatusBarRestore(
                  t("dataSource.deleteInUse.title"),
                  t("dataSource.deleteInUse.message", { names: caught.libraryNames.join("、") }),
                );
              } else {
                showAlertWithStatusBarRestore(
                  t("onedrive.deleteFailed.title"),
                  caught instanceof Error ? caught.message : t("onedrive.deleteFailed.message"),
                );
              }
            }
          })();
        },
      },
    ]);
  }

  const rightToolbar: HeaderToolbarAction[] = onedriveSource
    ? [
        {
          label: t("onedrive.deleteSource"),
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

  if (!onedriveSource) {
    return (
      <Screen>
        <View className="flex-1">
          <HeaderToolbar />
          <View className="flex-1 items-center justify-center">
            <Text className="text-[24px] font-bold" style={{ color: palette.text }}>
              {t("onedrive.notFound.title")}
            </Text>
            <Text className="mt-3 text-center text-sm leading-6" style={{ color: palette.textMuted }}>
              {t("onedrive.notFound.detail")}
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
          <OneDriveDetailHero source={onedriveSource} accent={accent} />
          <SectionCard>
            <SettingsRow title={t("onedrive.type")} detail="OneDrive" />
            <SettingsRow title={t("onedrive.displayName")} detail={onedriveSource.displayName ?? ""} />
            <SettingsRow title={t("onedrive.email")} detail={onedriveSource.email ?? ""} />
            <SettingsRow title={t("onedrive.basePath")} detail={onedriveSource.rootPath?.trim() ? onedriveSource.rootPath : "/"} />
            <SettingsRow title={t("onedrive.authStatus")} detail={onedriveSource.hasRefreshToken ? t("onedrive.authenticated") : t("onedrive.notAuthenticated")} />
            <SettingsRow title={t("onedrive.addedAt")} detail={formatDate(onedriveSource.createdAt)} isLast />
          </SectionCard>
        </View>
      </View>
    </Screen>
  );
}