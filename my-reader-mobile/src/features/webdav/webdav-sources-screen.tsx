import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Stack, router } from "expo-router";
import { Platform, View } from "react-native";

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
import { modalCloseToolbarAction } from "@/src/components/ui/modal-close-toolbar-action";
import { resolveRemoteSourcesListHeaderLead } from "@/src/navigation/settings-modal-header";
import { useAppStore } from "@/src/store/app-store";

export default function WebDavSourcesScreen() {
  const { t } = useTranslation();
  const palette = useThemePalette();
  const dataSources = useAppStore((state) => state.dataSources);

  const webdavSources = useMemo(() => dataSources.filter((source) => source.type === "webdav"), [dataSources]);
  const leftToolbar =
    resolveRemoteSourcesListHeaderLead({
      platform: Platform.OS === "ios" ? "ios" : "android",
    }) === "toolbar-close"
      ? [modalCloseToolbarAction(t("common.close"))]
      : undefined;
  const rightToolbar: HeaderToolbarAction[] = [
    {
      label: t("webdav.addSource"),
      onPress: handleAdd,
      icon: <MaterialIcons name="add" size={18} color={palette.primary} />,
      iosSfSymbol: "plus",
      iconOnly: true,
      color: palette.primary,
      variant: "prominent",
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
          title: t("webdav.sourcesTitle"),
          headerShadowVisible: false,
        }}
      />
      <HeaderToolbar left={leftToolbar} right={rightToolbar} />

      <View className="flex-1" style={{ backgroundColor: palette.background }}>
        <Screen contentContainerClassName="pb-10">
          <View className="gap-3">
            {webdavSources.length === 0 ? (
              <EmptyState
                title={t("webdav.noSources.title")}
                detail={t("webdav.noSources.detail")}
                action={<PrimaryButton title={t("webdav.addSource")} onPress={handleAdd} />}
                icon={{ ios: "externaldrive.fill", android: "storage" }}
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
