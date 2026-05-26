import { Link, type RelativePathString, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { LOCAL_LIBRARY_DATA_SOURCE_NAME } from "@/src/constants/local-library-data-source";
import type { DataSource } from "@/src/data/types";
import { View } from "@/tw";

import { Screen, SectionCard, SettingsRow, SettingsSectionLabel } from "@/src/components";
import { useDataSourceStore } from "@/src/store/data-source-store";
import { useLibraryStore } from "@/src/store/library-store";
import { useAddOneDriveDataSource } from "@/src/hooks/use-add-onedrive-data-source";

function sourceBrowserPath(source: DataSource) {
  if (source.type === "onedrive") {
    return {
      pathname: "/settings/onedrive/browser" as RelativePathString,
      params: { dataSourceId: source.id, currentPath: "/" },
    };
  }
  return {
    pathname: "/settings/webdav/browser" as RelativePathString,
    params: { dataSourceId: source.id, currentPath: "/" },
  };
}

function sourceDetailText(source: DataSource) {
  if (source.type === "onedrive") {
    return source.email ?? source.rootPath ?? "";
  }
  return `${source.endpoint}${source.rootPath ?? ""}`;
}

export default function AddLibraryDataSourceScreen() {
  const { t } = useTranslation();
  const { addLibrary } = useLibraryStore();
  const { dataSources } = useDataSourceStore();
  const { addOneDriveDataSource } = useAddOneDriveDataSource();

  async function handleAddOneDrive() {
    const created = await addOneDriveDataSource();
    if (created) {
      router.push({
        pathname: "/settings/onedrive/browser" as RelativePathString,
        params: { dataSourceId: created.id, currentPath: "/" },
      });
    }
  }

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
              href={sourceBrowserPath(source)}
              asChild
            >
              <SettingsRow
                title={source.name}
                detail={sourceDetailText(source)}
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
            <SettingsRow title="WebDAV" detail={t("addLibrary.webdavDetail")} />
          </Link>
          <SettingsRow
            title="OneDrive"
            detail={t("addLibrary.onedriveDetail")}
            onPress={() => void handleAddOneDrive()}
            isLast
          />
        </SectionCard>
      </View>
    </Screen>
  );
}