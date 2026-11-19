import { router, Stack } from "expo-router"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import {
  EmptyState,
  ListRow,
  PrimaryButton,
  Screen,
  SectionCard,
} from "@/src/components"
import { ENTITY_LIST_ROW_ICONS } from "@/src/components/ui/entity-list-row-icons"
import { useThemePalette } from "@/src/design/tokens"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"
import { createAddAction } from "@/src/navigation/toolbar-action-helpers"
import { useAppStore } from "@/src/store/app-store"
import { View } from "@/tw"
import {
  type CloudDataSource,
  type CloudProvider,
  cloudAddPath,
  cloudDetailPath,
  cloudSourceIcon,
  providerTitle,
} from "./cloud-data-source"

export function CloudSourcesScreen({ provider }: { provider: CloudProvider }) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const dataSources = useAppStore((state) => state.dataSources)
  const sources = useMemo<CloudDataSource[]>(
    () =>
      dataSources.filter(
        (source) => source.type === provider,
      ) as CloudDataSource[],
    [dataSources, provider],
  )
  const title = providerTitle(provider)
  const icon = ENTITY_LIST_ROW_ICONS[cloudSourceIcon(provider)]

  function handleAdd() {
    router.push(cloudAddPath(provider) as never)
  }

  const { options, toolbar } = useScreenHeader({
    title: t("cloud.sources.title", { provider: title }),
    headerShadowVisible: false,
    backTitle: t("reader.back"),
    close: { target: "/settings", dismissTo: true, variant: "layout" },
    right: [
      createAddAction({
        label: t("cloud.sources.add"),
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
          {sources.length === 0 ? (
            <EmptyState
              title={t("cloud.sources.emptyTitle", { provider: title })}
              detail={t("cloud.sources.emptyDetail", { provider: title })}
              action={
                <PrimaryButton
                  title={t("cloud.sources.add")}
                  onPress={handleAdd}
                />
              }
              icon={icon}
            />
          ) : (
            <SectionCard>
              {sources.map((source, index) => {
                const detail =
                  (source.type === "gdrive" || source.type === "dropbox") &&
                  source.email
                    ? source.email
                    : source.type === "s3"
                      ? `${source.endpoint}/${source.bucket}`
                      : source.name
                return (
                  <ListRow
                    key={source.id}
                    testID={`data-source-row-${source.id}`}
                    title={
                      source.type === "gdrive" || source.type === "dropbox"
                        ? source.displayName || source.name
                        : source.name
                    }
                    detail={detail}
                    icon={icon}
                    onPress={() =>
                      router.push({
                        pathname: cloudDetailPath(provider) as never,
                        params: { dataSourceId: source.id } as never,
                      })
                    }
                    isLast={index === sources.length - 1}
                  />
                )
              })}
            </SectionCard>
          )}
        </Screen>
      </View>
    </>
  )
}
