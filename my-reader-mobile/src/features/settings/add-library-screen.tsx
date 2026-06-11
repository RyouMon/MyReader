import { Link, router, Stack, type RelativePathString } from "expo-router";
import { useTranslation } from "react-i18next";

import { LOCAL_LIBRARY_DATA_SOURCE_NAME } from "@/src/constants/local-library-data-source";
import type { DataSource } from "@/src/domain/types";
import { View } from "@/tw";

import { Screen, SectionCard, SettingsRow, SettingsSectionLabel } from "@/src/components";
import { pickCalibreLibrary } from "@/src/domain/library/calibre";
import { addLibraryFromPicker } from "@/src/domain/library/hooks/library-actions";
import { notifyLibraryAdded } from "@/src/domain/notifications/library-notifications";
import { useAddOneDriveDataSource } from "@/src/features/onedrive/hooks/use-add-onedrive-data-source";
import { OneDriveAddingEmptyState } from "@/src/features/onedrive/onedrive-adding-empty-state";
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header";
import { useAppStore } from "@/src/store/app-store";

const SETTINGS_FLOW_ADD_LIBRARY = "add-library";

function sourceBrowserPath(source: DataSource) {
  const sharedParams = { currentPath: "/", from: SETTINGS_FLOW_ADD_LIBRARY };
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
  const { addOneDriveDataSource, busy: addingOneDrive } = useAddOneDriveDataSource();

  async function handleAddLocalLibrary() {
    const picked = await pickCalibreLibrary();
    const added = await addLibraryFromPicker(picked);
    if (added != null) {
      router.dismissTo("/settings");
      notifyLibraryAdded(added.name);
    }
  }

  async function handleAddOneDrive() {
    await addOneDriveDataSource();
  }

  const { options, toolbar } = useScreenHeader({
    close: { target: "/settings", dismissTo: true, variant: "layout" },
  });

  return (
    <>
      <Stack.Screen options={options} />
      {toolbar}
      <Screen>
      {addingOneDrive ? (
        <OneDriveAddingEmptyState />
      ) : (
      <>
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
                testID={`add-library-source-${source.id}`}
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
            <SettingsRow title="WebDAV" label={t("webdav.addSource")} />
          </Link>
          <SettingsRow
            title="OneDrive"
            label={t("onedrive.addSource")}
            onPress={() => void handleAddOneDrive()}
            isLast
          />
        </SectionCard>
      </View>
      </>
      )}
    </Screen>
  </>
  );
}