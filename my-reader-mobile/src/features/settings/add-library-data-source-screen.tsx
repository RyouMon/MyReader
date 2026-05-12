import { Link, router } from "expo-router";

import { LOCAL_LIBRARY_DATA_SOURCE_NAME } from "@/src/constants/local-library-data-source";
import { View } from "@/tw";

import { Screen, SectionCard, SettingsRow, SettingsSectionLabel } from "@/src/components";
import { useDataSourceStore } from "@/src/store/data-source-store";
import { useLibraryStore } from "@/src/store/library-store";

export default function AddLibraryDataSourceScreen() {
  const { addLibrary } = useLibraryStore();
  const { dataSources } = useDataSourceStore();

  return (
    <Screen>
      <View className="gap-3">
        <SettingsSectionLabel>已有数据源</SettingsSectionLabel>
        <SectionCard>
          <SettingsRow
            title={LOCAL_LIBRARY_DATA_SOURCE_NAME}
            detail="直接从本机存储中选择书库"
            onPress={() => {
              void (async () => {
                const added = await addLibrary();
                if (added != null) {
                  router.dismissTo("/settings");
                }
              })();
            }}
            isLast={dataSources.length === 0}
          />
          {dataSources.map((source, index) => (
            <Link
              key={source.id}
              href={{
                pathname: "/settings/webdav/browser",
                params: { dataSourceId: source.id, currentPath: "/" },
              }}
              asChild
            >
              <SettingsRow
                title={source.name}
                detail={`${source.endpoint}${source.rootPath ?? ""}`}
                isLast={index === dataSources.length - 1}
              />
            </Link>
          ))}
        </SectionCard>
      </View>

      <View className="gap-3">
        <SettingsSectionLabel>添加数据源</SettingsSectionLabel>
        <SectionCard>
          <Link href="/settings/webdav/add" asChild>
            <SettingsRow title="WebDAV" detail="通过 WebDAV 浏览远程文件并选择 Calibre 书库" isLast />
          </Link>
        </SectionCard>
      </View>
    </Screen>
  );
}
