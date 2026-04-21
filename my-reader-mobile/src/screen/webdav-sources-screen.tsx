import { useMemo } from "react";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Stack, router } from "expo-router";
import { View } from "react-native";

import { useThemePalette } from "@/src/design/tokens";

import {
  EmptyState,
  HeaderToolbar,
  PrimaryButton,
  Screen,
  SectionCard,
  SettingsRow,
  type HeaderToolbarAction,
} from "../components";
import { useDataSourceStore } from "../store/data-source-store";

export default function WebDavSourcesScreen() {
  const palette = useThemePalette();
  const { dataSources } = useDataSourceStore();

  const webdavSources = useMemo(() => dataSources.filter((source) => source.type === "webdav"), [dataSources]);
  const rightToolbar: HeaderToolbarAction[] = [
    {
      label: "添加 WebDAV 数据源",
      onPress: handleAdd,
      icon: <MaterialIcons name="add" size={18} color={palette.primary} />,
      iosSfSymbol: "plus",
      iconOnly: true,
      color: palette.primary,
    },
  ];

  function handleAdd() {
    router.push("/settings/webdav/add");
  }

  function openSourceDetail(sourceId: string) {
    router.push({ pathname: "/settings/webdav/[dataSourceId]", params: { dataSourceId: sourceId } });
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "WebDAV 数据源",
          headerShadowVisible: false,
        }}
      />
      <HeaderToolbar right={rightToolbar} />

      <View className="flex-1" style={{ backgroundColor: palette.background }}>
        <Screen contentContainerClassName="pb-10">
          <View className="gap-3">
            {webdavSources.length === 0 ? (
              <EmptyState
                title="还没有 WebDAV 数据源"
                detail="通过「添加 WebDAV」连接服务器后，即可浏览远程目录并选择 Calibre 书库。"
                action={<PrimaryButton title="添加 WebDAV 数据源" onPress={handleAdd} />}
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
      </View>
    </>
  );
}
