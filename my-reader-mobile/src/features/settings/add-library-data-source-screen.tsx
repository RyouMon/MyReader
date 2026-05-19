import { Link, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { LOCAL_LIBRARY_DATA_SOURCE_NAME } from "@/src/constants/local-library-data-source";
import { View } from "@/tw";

import { Screen, SectionCard, SettingsRow, SettingsSectionLabel } from "@/src/components";
import { useDataSourceStore } from "@/src/store/data-source-store";
import { useLibraryStore } from "@/src/store/library-store";

export default function AddLibraryDataSourceScreen() {
  const { t } = useTranslation();
  const { addLibrary } = useLibraryStore();
  const { dataSources } = useDataSourceStore();

  return (
    <Screen>
      <View className="gap-3">
        <SettingsSectionLabel>{t("addLibrary.existingSources")}</SettingsSectionLabel>
        <SectionCard>
          <SettingsRow
            title={LOCAL_LIBRARY_DATA_SOURCE_NAME}
            detail={t("addLibrary.localDetail")}
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
        <SettingsSectionLabel>{t("addLibrary.addSources")}</SettingsSectionLabel>
        <SectionCard>
          <Link href="/settings/webdav/add" asChild>
            <SettingsRow title="WebDAV" detail={t("addLibrary.webdavDetail")} isLast />
          </Link>
        </SectionCard>
      </View>
    </Screen>
  );
}
