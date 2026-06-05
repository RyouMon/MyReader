import { Link, type RelativePathString, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { LOCAL_LIBRARY_DATA_SOURCE_NAME } from "@/src/constants/local-library-data-source";
import type { DataSource } from "@/src/domain/types";
import { View } from "@/tw";

import { Screen, SectionCard, SettingsRow, SettingsSectionLabel } from "@/src/components";
import { useAppStore } from "@/src/store/app-store";
import { pickCalibreLibrary } from "@/src/domain/library/calibre";
import { addLibraryFromPicker } from "@/src/domain/library/hooks/library-actions";
import { notifyLibraryAdded } from "@/src/domain/notifications/library-notifications";
import { useAddOneDriveDataSource } from "@/src/hooks/use-add-onedrive-data-source";

function sourceBrowserPath(source: DataSource) {
  const sharedParams = { currentPath: "/", from: "add-library" as const };
  if (source.type === "onedrive") {
    return {
      pathname: "/settings/onedrive/browser" as RelativePathString,
      params: { dataSourceId: source.id, ...sharedParams },
    };
  }
  return {
    pathname: "/settings/webdav/browser" as RelativePathString,
    params: { dataSourceId: source.id, ...sharedParams },
  };
}

function dataSourceTypeLabel(t: (key: string) => string, source: DataSource) {
  if (source.type === "onedrive") {
    return t("libraryDetail.typeOnedrive");
  }
  return t("libraryDetail.typeWebdav");
}

function dataSourceHelpText(source: DataSource) {
  if (source.type === "onedrive") {
    return source.email ?? "";
  }
  return `${source.endpoint}${source.rootPath ?? ""}`;
}

export default function AddLibraryDataSourceScreen() {
  const { t } = useTranslation();
  const dataSources = useAppStore((s) => s.dataSources);
  const { addOneDriveDataSource } = useAddOneDriveDataSource();

  async function handleAddLocalLibrary() {
    const picked = await pickCalibreLibrary();
    const added = await addLibraryFromPicker(picked);
    if (added != null) {
      router.dismissTo("/settings");
      notifyLibraryAdded(added.name);
    }
  }

  async function handleAddOneDrive() {
    const created = await addOneDriveDataSource();
    if (created) {
      router.push({
        pathname: "/settings/onedrive/browser" as RelativePathString,
        params: { dataSourceId: created.id, currentPath: "/", from: "add-library" },
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
            onPress={() => {
              void handleAddLocalLibrary();
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
                detail={dataSourceHelpText(source)}
                value={dataSourceTypeLabel(t, source)}
                isLast={index === dataSources.length - 1}
              />
            </Link>
          ))}
        </SectionCard>
      </View>

      <View className="gap-3">
        <SettingsSectionLabel>{t("addLibrary.addSources")}</SettingsSectionLabel>
        <SectionCard>
          <Link href={{ pathname: "/settings/webdav/add", params: { from: "add-library" } }} asChild>
            <SettingsRow title="WebDAV" />
          </Link>
          <SettingsRow
            title="OneDrive"
            onPress={() => void handleAddOneDrive()}
            isLast
          />
        </SectionCard>
      </View>
    </Screen>
  );
}