import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Platform } from "react-native";

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar";
import type { DataSourceWebdav } from "@/src/data/types";
import { useThemePalette } from "@/src/design/tokens";
import { Text, View } from "@/tw";

import { HeaderToolbar, Screen, SectionCard, SettingsRow, type HeaderToolbarAction } from "@/src/components";
import { useAppStore } from "@/src/store/app-store";
import { useDataSourceActions } from "@/src/hooks/use-data-source-actions";

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

function WebDavDetailHero({ source, accent }: { source: DataSourceWebdav; accent: string }) {
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
          accessibilityLabel={t("webdav.sourcesTitle")}
          fallback={
            <MaterialIcons accessibilityLabel={t("webdav.sourcesTitle")} name="cloud" size={80} color={accent} />
          }
          name={{
            ios: "cloud.fill",
            android: "cloud",
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
          {source.name}
        </Text>
        <Text className="px-4 text-center text-sm font-medium" style={{ color: palette.textMuted }} numberOfLines={2}>
          {source.endpoint}
          {source.rootPath ? source.rootPath : ""}
        </Text>
      </View>
    </View>
  );
}

export default function WebDavDataSourceDetailScreen() {
  const { t } = useTranslation();
  const { dataSourceId } = useLocalSearchParams<{ dataSourceId?: string }>();
  const palette = useThemePalette();
  const dataSources = useAppStore((state) => state.dataSources);
  const { deleteDataSource } = useDataSourceActions();

  const sourceIndex = useMemo(
    () => dataSources.findIndex((item) => item.id === dataSourceId && item.type === "webdav"),
    [dataSources, dataSourceId]
  );
  const raw = sourceIndex >= 0 ? dataSources[sourceIndex] : undefined;
  const webdavSource: DataSourceWebdav | null = raw?.type === "webdav" ? raw : null;
  const accent = palette.primary;

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/settings/webdav");
  }

  function confirmDelete() {
    if (!webdavSource) {
      return;
    }

    showAlertWithStatusBarRestore(t("webdav.delete.title"), t("webdav.delete.confirm", { name: webdavSource.name }), [
      { text: t("webdav.delete.cancel"), style: "cancel" },
      {
        text: t("webdav.delete.confirmButton"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteDataSource(webdavSource.id);
              handleBack();
            } catch (caught) {
              showAlertWithStatusBarRestore(
                t("webdav.deleteFailed.title"),
                caught instanceof Error ? caught.message : t("webdav.deleteFailed.message")
              );
            }
          })();
        },
      },
    ]);
  }

  const rightToolbar: HeaderToolbarAction[] = webdavSource
    ? [
        {
          label: t("webdav.deleteSource"),
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

  if (!webdavSource) {
    return (
      <Screen>
        <View className="flex-1">
          <HeaderToolbar />
          <View className="flex-1 items-center justify-center">
            <Text className="text-[24px] font-bold" style={{ color: palette.text }}>
              {t("webdav.notFound.title")}
            </Text>
            <Text className="mt-3 text-center text-sm leading-6" style={{ color: palette.textMuted }}>
              {t("webdav.notFound.detail")}
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
          <WebDavDetailHero source={webdavSource} accent={accent} />
          <SectionCard>
            <SettingsRow title={t("webdav.type")} detail="WebDAV" />
            <SettingsRow title={t("webdav.serverAddress")} detail={webdavSource.endpoint} />
            <SettingsRow title={t("webdav.username")} detail={webdavSource.username} />
            <SettingsRow
              title={t("webdav.password")}
              detail={webdavSource.hasPassword ? t("webdav.passwordSaved") : t("webdav.passwordNotSet")}
            />
            <SettingsRow title={t("webdav.basePath")} detail={webdavSource.rootPath?.trim() ? webdavSource.rootPath : "/"} />
            <SettingsRow title={t("webdav.status")} detail={webdavSource.enabled ? t("webdav.enabled") : t("webdav.disabled")} />
            <SettingsRow title={t("webdav.addedAt")} detail={formatDate(webdavSource.createdAt)} isLast />
          </SectionCard>
        </View>
      </View>
    </Screen>
  );
}
