import { useMemo } from "react";

import { Stack, router } from "expo-router";
import { Platform, View } from "react-native";

import { useThemePalette } from "@/src/design/tokens";

import {
  EmptyState,
  Screen,
  ScreenAndroidFabPrimary,
  SectionCard,
  SettingsRow
} from "../components";
import { useDataSourceStore } from "../store/data-source-store";

export default function WebDavSourcesScreen() {
  const palette = useThemePalette();
  const { dataSources } = useDataSourceStore();

  const webdavSources = useMemo(() => dataSources.filter((source) => source.type === "webdav"), [dataSources]);

  function handleAdd() {
    router.push("/settings/webdav/add");
  }

  function openSourceDetail(sourceId: string) {
    router.push({ pathname: "/settings/webdav/[dataSourceId]", params: { dataSourceId: sourceId } });
  }

  return (
    <>
      {Platform.OS === "ios" ? (
        <Stack.Toolbar placement="bottom">
          <Stack.Toolbar.Spacer />
          <Stack.Toolbar.Button tintColor={palette.primary} onPress={handleAdd}>
            <Stack.Toolbar.Icon sf="plus" />
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}

      <View className="flex-1" style={{ backgroundColor: palette.background }}>
        <Screen contentContainerClassName="pb-28">
          <View className="gap-3">
            {webdavSources.length === 0 ? (
              <EmptyState
                title="还没有 WebDAV 数据源"
                detail="通过「添加 WebDAV」连接服务器后，即可浏览远程目录并选择 Calibre 书库。"
              />
            ) : (
              <SectionCard>
                {webdavSources.map((source, index) => (
                  <SettingsRow
                    key={source.id}
                    title={source.name}
                    detail={`${source.endpoint}${source.rootPath ?? ""}`}
                    onPress={() => openSourceDetail(source.id)}
                    isLast={index === webdavSources.length - 1}
                  />
                ))}
              </SectionCard>
            )}
          </View>
        </Screen>

        <ScreenAndroidFabPrimary
          icon="add"
          accessibilityLabel="添加 WebDAV 数据源"
          onPress={handleAdd}
        />
      </View>
    </>
  );
}
