import { Link } from "expo-router";

import { useThemePalette } from "@/src/design/tokens";
import { Text, View } from "@/tw";

import { Screen, SectionCard, SettingsRow } from "../components";
import { useDataSourceStore } from "../store/data-source-store";
import { useLibraryStore } from "../store/library-store";

export default function AddLibraryDataSourceScreen() {
  const palette = useThemePalette();
  const { addLibrary } = useLibraryStore();
  const { dataSources } = useDataSourceStore();

  return (
    <Screen>
      <View className="gap-3">
        <Text className="px-1 text-xs font-semibold uppercase tracking-[0.4px]" style={{ color: palette.textMuted }}>
          已有数据源
        </Text>
        <SectionCard>
          {dataSources.map((source, index) => {
            const isLocal = source.type === "local";

            return isLocal ? (
              <SettingsRow
                key={source.id}
                title={source.name}
                detail="直接从手机中选择 Calibre 书库，不需要配置。"
                onPress={() => void addLibrary()}
                isLast={index === dataSources.length - 1}
              />
            ) : (
                <Link
                  key={source.id}
                  href={{ pathname: "/settings/add-library/webdav-browser", params: { dataSourceId: source.id } }}
                  asChild
                >
                <SettingsRow
                  title={source.name}
                  detail={`${source.serverUrl}${source.basePath}`}
                  isLast={index === dataSources.length - 1}
                />
              </Link>
            );
          })}
        </SectionCard>
      </View>

      <View className="gap-3">
        <Text className="px-1 text-xs font-semibold uppercase tracking-[0.4px]" style={{ color: palette.textMuted }}>
          添加数据源
        </Text>
        <SectionCard>
          <Link href="/settings/add-library/webdav" asChild>
            <SettingsRow title="WebDAV" detail="通过 WebDAV 浏览远程文件并选择 Calibre 书库" isLast />
          </Link>
        </SectionCard>
      </View>
    </Screen>
  );
}
