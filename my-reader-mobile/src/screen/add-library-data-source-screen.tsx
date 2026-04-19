import { Link, router } from "expo-router";

import { View } from "@/tw";

import { Screen, SectionCard, SettingsRow, SettingsSectionLabel } from "../components";
import { useDataSourceStore } from "../store/data-source-store";
import { useLibraryStore } from "../store/library-store";

export default function AddLibraryDataSourceScreen() {
  const { addLibrary } = useLibraryStore();
  const { dataSources } = useDataSourceStore();

  return (
    <Screen>
      <View className="gap-3">
        <SettingsSectionLabel>已有数据源</SettingsSectionLabel>
        <SectionCard>
          {dataSources.map((source, index) => {
            const isLocal = source.type === "local";

            return isLocal ? (
              <SettingsRow
                key={source.id}
                title={source.name}
                detail="直接从手机中选择 Calibre 书库，不需要配置。"
                onPress={() => {
                  void (async () => {
                    const added = await addLibrary();
                    if (added) {
                      router.dismissTo("/settings");
                    }
                  })();
                }}
                isLast={index === dataSources.length - 1}
              />
            ) : (
                <Link
                  key={source.id}
                  href={{ pathname: "/webdav/browser", params: { dataSourceId: source.id } }}
                  asChild
                >
                <SettingsRow
                  title={source.name}
                  detail={`${source.endpoint}${source.rootPath ?? ""}`}
                  isLast={index === dataSources.length - 1}
                />
              </Link>
            );
          })}
        </SectionCard>
      </View>

      <View className="gap-3">
        <SettingsSectionLabel>添加数据源</SettingsSectionLabel>
        <SectionCard>
          <Link href="/webdav/add" asChild>
            <SettingsRow title="WebDAV" detail="通过 WebDAV 浏览远程文件并选择 Calibre 书库" isLast />
          </Link>
        </SectionCard>
      </View>
    </Screen>
  );
}
