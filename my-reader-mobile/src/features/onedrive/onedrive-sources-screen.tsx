import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { Stack, router } from "expo-router"
import { View } from "react-native"

import { useThemePalette } from "@/src/design/tokens"

import {
  EmptyState,
  PrimaryButton,
  Screen,
  SectionCard,
  ListRow,
} from "@/src/components"
import { useAddOneDriveDataSource } from "@/src/features/onedrive/hooks/use-add-onedrive-data-source"
import { OneDriveAddingEmptyState } from "@/src/features/onedrive/onedrive-adding-empty-state"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"
import { createAddAction } from "@/src/navigation/toolbar-action-helpers"
import { useAppStore } from "@/src/store/app-store"

export default function OneDriveSourcesScreen() {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const dataSources = useAppStore((state) => state.dataSources)
  const { addOneDriveDataSource, busy } = useAddOneDriveDataSource()

  function handleAdd() {
    void addOneDriveDataSource()
  }

  function openSourceDetail(sourceId: string) {
    router.push({
      pathname: "/settings/onedrive/[dataSourceId]",
      params: { dataSourceId: sourceId },
    })
  }

  const onedriveSources = useMemo(
    () => dataSources.filter((source) => source.type === "onedrive"),
    [dataSources],
  )

  const { options, toolbar } = useScreenHeader({
    title: t("onedrive.sourcesTitle"),
    headerShadowVisible: false,
    backTitle: t("reader.back"),
    close: { target: "/settings", dismissTo: true, variant: "layout" },
    right: [
      createAddAction({
        label: t("onedrive.addSource"),
        onPress: handleAdd,
        color: palette.primary,
        disabled: busy,
      }),
    ],
  })

  return (
    <>
      <Stack.Screen options={options} />
      {toolbar}

      <View className="flex-1" style={{ backgroundColor: palette.background }}>
        <Screen contentContainerClassName="pb-10">
          <View className="gap-3">
            {busy ? (
              <OneDriveAddingEmptyState />
            ) : onedriveSources.length === 0 ? (
              <EmptyState
                title={t("onedrive.noSources.title")}
                detail={t("onedrive.noSources.detail")}
                action={
                  <PrimaryButton
                    title={t("onedrive.addSource")}
                    onPress={handleAdd}
                  />
                }
                icon={{ ios: "externaldrive.fill", android: "storage" }}
              />
            ) : (
              <SectionCard>
                {onedriveSources.map((source, index) => (
                  <ListRow
                    key={source.id}
                    testID={`data-source-row-${source.id}`}
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
  )
}
