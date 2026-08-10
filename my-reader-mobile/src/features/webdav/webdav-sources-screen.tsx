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
import { ENTITY_LIST_ROW_ICONS } from "@/src/components/ui/entity-list-row-icons"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"
import { createAddAction } from "@/src/navigation/toolbar-action-helpers"
import { useAppStore } from "@/src/store/app-store"

export default function WebDavSourcesScreen() {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const dataSources = useAppStore((state) => state.dataSources)

  function handleAdd() {
    router.push("/settings/webdav/add")
  }

  function openSourceDetail(sourceId: string) {
    router.push({
      pathname: "/settings/webdav/[dataSourceId]",
      params: { dataSourceId: sourceId },
    })
  }

  const webdavSources = useMemo(
    () => dataSources.filter((source) => source.type === "webdav"),
    [dataSources],
  )

  const { options, toolbar } = useScreenHeader({
    title: t("webdav.sourcesTitle"),
    headerShadowVisible: false,
    backTitle: t("reader.back"),
    close: { target: "/settings", dismissTo: true, variant: "layout" },
    right: [
      createAddAction({
        label: t("webdav.addSource"),
        onPress: handleAdd,
        color: palette.primary,
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
            {webdavSources.length === 0 ? (
              <EmptyState
                title={t("webdav.noSources.title")}
                detail={t("webdav.noSources.detail")}
                action={
                  <PrimaryButton
                    title={t("webdav.addSource")}
                    onPress={handleAdd}
                  />
                }
                icon={ENTITY_LIST_ROW_ICONS.webdavDataSource}
              />
            ) : (
              <SectionCard>
                {webdavSources.map((source, index) => (
                  <ListRow
                    key={source.id}
                    testID={`data-source-row-${source.id}`}
                    title={source.name}
                    detail={`${source.endpoint}${source.rootPath ?? ""}`}
                    icon={ENTITY_LIST_ROW_ICONS.webdavDataSource}
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
  )
}
