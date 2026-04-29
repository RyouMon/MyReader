import { useMemo } from "react";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Platform } from "react-native";

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar";
import type { DataSourceWebdav } from "@/src/data/types";
import { useThemePalette } from "@/src/design/tokens";
import { Text, View } from "@/tw";

import { HeaderToolbar, Screen, SectionCard, SettingsRow, type HeaderToolbarAction } from "../components";
import { useDataSourceStore } from "../store/data-source-store";

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

function getWebDavAccent(index: number, palette: ReturnType<typeof useThemePalette>) {
  const accents = [palette.primary, palette.warning, palette.success, palette.textMuted];
  return accents[index % accents.length] ?? palette.primary;
}

function WebDavDetailHero({ source, accent }: { source: DataSourceWebdav; accent: string }) {
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
          accessibilityLabel="WebDAV 数据源"
          fallback={
            <MaterialIcons accessibilityLabel="WebDAV 数据源" name="cloud" size={80} color={accent} />
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
  const { dataSourceId } = useLocalSearchParams<{ dataSourceId?: string }>();
  const palette = useThemePalette();
  const { dataSources, deleteDataSource } = useDataSourceStore();

  const sourceIndex = useMemo(
    () => dataSources.findIndex((item) => item.id === dataSourceId && item.type === "webdav"),
    [dataSources, dataSourceId]
  );
  const raw = sourceIndex >= 0 ? dataSources[sourceIndex] : undefined;
  const webdavSource: DataSourceWebdav | null = raw?.type === "webdav" ? raw : null;
  const accent = getWebDavAccent(Math.max(sourceIndex, 0), palette);

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

    showAlertWithStatusBarRestore("删除 WebDAV 数据源", `确认删除“${webdavSource.name}”？`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteDataSource(webdavSource.id);
              handleBack();
            } catch (caught) {
              showAlertWithStatusBarRestore(
                "无法删除",
                caught instanceof Error ? caught.message : "删除数据源失败。"
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
          label: "删除数据源",
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
              没有找到这个数据源
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
          <WebDavDetailHero source={webdavSource} accent={accent} />
          <SectionCard>
            <SettingsRow title="类型" detail="WebDAV" />
            <SettingsRow title="服务器地址" detail={webdavSource.endpoint} />
            <SettingsRow title="用户名" detail={webdavSource.username} />
            <SettingsRow
              title="密码"
              detail={webdavSource.hasPassword ? "已保存在本机安全存储" : "未设置"}
            />
            <SettingsRow title="基础路径" detail={webdavSource.rootPath?.trim() ? webdavSource.rootPath : "/"} />
            <SettingsRow title="状态" detail={webdavSource.enabled ? "已启用" : "已停用"} />
            <SettingsRow title="添加时间" detail={formatDate(webdavSource.createdAt)} isLast />
          </SectionCard>
        </View>
      </View>
    </Screen>
  );
}
