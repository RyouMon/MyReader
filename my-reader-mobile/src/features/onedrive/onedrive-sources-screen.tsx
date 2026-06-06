import { useMemo } from "react";
import { useTranslation } from "react-i18next";

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
} from "@/src/components";
import { useSettingsScreenHeaderLeft } from "@/src/navigation/hooks/use-settings-screen-header";
import { useAppStore } from "@/src/store/app-store";
import { useAddOneDriveDataSource } from "@/src/hooks/use-add-onedrive-data-source";

export default function OneDriveSourcesScreen() {
  const { t } = useTranslation();
  const palette = useThemePalette();
  const dataSources = useAppStore((state) => state.dataSources);
  const { addOneDriveDataSource, busy } = useAddOneDriveDataSource();

  const onedriveSources = useMemo(() => dataSources.filter((source) => source.type === "onedrive"), [dataSources]);

  function handleAdd() {
    void addOneDriveDataSource();
  }

  function openSourceDetail(sourceId: string) {
    router.push({ pathname: "/settings/onedrive/[dataSourceId]", params: { dataSourceId: sourceId } });
  }

  const leftToolbar = useSettingsScreenHeaderLeft({ routeId: "onedrive.sources" });
  const rightToolbar: HeaderToolbarAction[] = [
    {
      label: t("onedrive.addSource"),
      onPress: handleAdd,
      icon: <MaterialIcons name="add" size={18} color={palette.primary} />,
      iosSfSymbol: "plus",
      iconOnly: true,
      color: palette.primary,
      variant: "prominent",
    },
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: t("onedrive.sourcesTitle"),
          headerShadowVisible: false,
        }}
      />
      <HeaderToolbar left={leftToolbar} right={rightToolbar} />

      <View className="flex-1" style={{ backgroundColor: palette.background }}>
        <Screen contentContainerClassName="pb-10">
          <View className="gap-3">
            {onedriveSources.length === 0 ? (
              <EmptyState
                title={t("onedrive.noSources.title")}
                detail={t("onedrive.noSources.detail")}
                action={<PrimaryButton title={t("onedrive.addSource")} onPress={handleAdd} disabled={busy} />}
                icon={{ ios: "externaldrive.fill", android: "storage" }}
              />
            ) : (
              <SectionCard>
                {onedriveSources.map((source, index) => (
                  <SettingsRow
                    key={source.id}
                    title={source.displayName ?? source.name}
                    detail={source.email ?? source.rootPath ?? ""}
                    onPress={() => openSourceDetail(source.id)}
                    isLast={index === onedriveSources.length - 1}
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