import { useMemo, useState } from "react";

import { Link, router } from "expo-router";
import { Alert } from "react-native";

import { useThemePalette } from "@/src/design/tokens";
import { Text, View } from "@/tw";

import { EmptyState, PrimaryButton, Screen, SectionCard, SettingsRow, SettingsSectionLabel } from "../components";
import { useDataSourceStore } from "../store/data-source-store";
import { useLibraryStore } from "../store/library-store";

function TrailingLabel({
  text,
  emphasize = false,
  destructive = false,
}: {
  text: string;
  emphasize?: boolean;
  destructive?: boolean;
}) {
  const palette = useThemePalette();
  const color = destructive ? palette.destructive : emphasize ? palette.primary : palette.textMuted;
  return <Text className="text-sm font-semibold" style={{ color }}>{text}</Text>;
}

export default function WebDavSourcesScreen() {
  const palette = useThemePalette();
  const { dataSources, deleteDataSource } = useDataSourceStore();
  const { libraries } = useLibraryStore();
  const [error, setError] = useState<string | null>(null);

  const webdavSources = useMemo(() => dataSources.filter((source) => source.type === "webdav"), [dataSources]);

  function handleAdd() {
    router.push("/settings/add-library/webdav");
  }

  function handleDelete(id: string, name: string) {
    Alert.alert("删除 WebDAV 数据源", `确认删除“${name}”？`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              setError(null);
              await deleteDataSource(id);
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "删除数据源失败。");
            }
          })();
        },
      },
    ]);
  }

  return (
    <Screen>
      <View className="gap-3">
        <SettingsSectionLabel>已添加的数据源</SettingsSectionLabel>

        {webdavSources.length === 0 ? (
          <EmptyState
            title="还没有 WebDAV 数据源"
            detail="添加一个 WebDAV 连接后，就可以浏览远程目录并选择 Calibre 书库。"
            action={<PrimaryButton title="立即添加" onPress={handleAdd} />}
          />
        ) : (
          <SectionCard>
            {webdavSources.map((source, index) => {
              const linkedLibraryCount = libraries.filter((library) => library.dataSourceId === source.id).length;
              return (
                <SettingsRow
                  key={source.id}
                  title={source.name}
                  detail={`${source.endpoint}${source.rootPath ?? ""}${linkedLibraryCount > 0 ? ` · 已关联 ${linkedLibraryCount} 个书库` : ""}`}
                  trailing={<TrailingLabel text="删除" destructive />}
                  onPress={() => handleDelete(source.id, source.name)}
                  isLast={index === webdavSources.length - 1}
                />
              );
            })}
          </SectionCard>
        )}
      </View>

      {error ? (
        <Text className="px-1 text-sm leading-6" style={{ color: palette.error }}>
          {error}
        </Text>
      ) : null}

      <View className="gap-3">
        <SettingsSectionLabel>添加数据源</SettingsSectionLabel>
        <SectionCard>
          <Link href="/settings/add-library/webdav" asChild>
            <SettingsRow title="添加 WebDAV 数据源" detail="填写服务器地址、账号和路径后即可浏览远程目录。" trailing={<TrailingLabel text="添加" emphasize />} isLast />
          </Link>
        </SectionCard>
      </View>
    </Screen>
  );
}
