import { libraryTypeOf } from "@my-reader/tools/types/library"
import type {
  DataSource,
  DataSourceType,
} from "@my-reader/tools/types/data-source"
import { router, Stack } from "expo-router"
import type { ComponentProps, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  EmptyState,
  ListRow,
  PrimaryButton,
  Screen,
  SectionCard,
} from "@/src/components"
import { ENTITY_LIST_ROW_ICONS } from "@/src/components/ui/entity-list-row-icons"
import { LIBRARY_EMPTY_STATE_ICON } from "@/src/components/ui/library-empty-state-icon"
import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import { useThemePalette } from "@/src/design/tokens"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"
import { createAddAction } from "@/src/navigation/toolbar-action-helpers"
import { useAppStore } from "@/src/store/app-store"

const SOURCE_TYPES = {
  webdav: "WebDAV",
  onedrive: "OneDrive",
  gdrive: "Google Drive",
  dropbox: "Dropbox",
  s3: "S3",
} as const satisfies Record<DataSourceType, string>

function ResourceList({
  title,
  empty,
  children,
}: {
  title: string
  empty?: Pick<ComponentProps<typeof EmptyState>, "title" | "detail" | "icon">
  children: ReactNode
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const addLabel = t("settings.resources.add")
  function chooseResource() {
    showAlertWithStatusBarRestore(
      addLabel,
      undefined,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.addLibrary"),
          onPress: () => router.push("/settings/add-library"),
        },
        {
          text: t("cloud.sources.add"),
          onPress: () =>
            router.push("/settings/source-type", { withAnchor: true }),
        },
      ],
      { cancelable: true },
    )
  }
  const { options, toolbar } = useScreenHeader({
    title,
    close: { target: "/settings", dismissTo: true, variant: "layout" },
    right: empty
      ? []
      : [
          createAddAction({
            label: addLabel,
            onPress: chooseResource,
            color: palette.primary,
          }),
        ],
  })
  return (
    <>
      <Stack.Screen options={options} />
      {toolbar}
      <Screen>
        {empty ? (
          <EmptyState
            {...empty}
            action={<PrimaryButton title={addLabel} onPress={chooseResource} />}
          />
        ) : (
          <SectionCard>{children}</SectionCard>
        )}
      </Screen>
    </>
  )
}

export function LibrariesScreen() {
  const { t } = useTranslation()
  const libraries = useAppStore((state) => state.libraries)
  const activeId = useAppStore((state) => state.activeLibraryId)
  return (
    <ResourceList
      title={t("settings.resources.libraries")}
      empty={
        libraries.length
          ? undefined
          : {
              title: t("addLibraryFlow.noLibrary.title"),
              detail: t("addLibraryFlow.noLibrary.description"),
              icon: LIBRARY_EMPTY_STATE_ICON,
            }
      }
    >
      {libraries.map((library, index) => {
        const myReader = libraryTypeOf(library) === "myreader"
        const type = t(
          myReader
            ? "libraryDetail.myreaderLibrary"
            : "libraryDetail.calibreLibrary",
        )
        const active =
          library.id === activeId ? t("settings.currentInUse") : undefined
        return (
          <ListRow
            key={library.id}
            title={library.name}
            detail={type}
            value={active}
            label={[
              t("settings.manageLibrary", { name: library.name }),
              type,
              active,
            ]
              .filter(Boolean)
              .join(", ")}
            icon={
              ENTITY_LIST_ROW_ICONS[
                myReader ? "myreaderLibrary" : "calibreLibrary"
              ]
            }
            testID={`settings-library-row-${library.id}`}
            isLast={index === libraries.length - 1}
            onPress={() =>
              router.push({
                pathname: "/settings/library/[libraryId]",
                params: { libraryId: library.id },
              })
            }
          />
        )
      })}
    </ResourceList>
  )
}

function sourceRow(source: DataSource) {
  const provider = SOURCE_TYPES[source.type]
  switch (source.type) {
    case "webdav":
      return {
        title: source.name,
        detail: `${provider} · ${source.endpoint}${source.rootPath ?? ""}`,
      }
    case "s3":
      return {
        title: source.name,
        detail: `${provider} · ${source.endpoint}/${source.bucket}`,
      }
    default:
      return {
        title: source.displayName || source.name,
        detail: source.email ? `${provider} · ${source.email}` : provider,
      }
  }
}

export function DataSourcesScreen() {
  const { t } = useTranslation()
  const sources = useAppStore((state) => state.dataSources)
  return (
    <ResourceList
      title={t("settings.resources.dataSources")}
      empty={
        sources.length
          ? undefined
          : {
              title: t("settings.resources.noSources"),
              detail: t("settings.resources.noSourcesDetail"),
              icon: {
                ios: "externaldrive.connected.to.line.below",
                android: "storage",
              },
            }
      }
    >
      {sources.map((source, index) => {
        const { title, detail } = sourceRow(source)
        return (
          <ListRow
            key={source.id}
            title={title}
            detail={detail}
            label={`${title}, ${detail}`}
            icon={ENTITY_LIST_ROW_ICONS[`${source.type}DataSource`]}
            testID={`data-source-row-${source.id}`}
            isLast={index === sources.length - 1}
            onPress={() =>
              router.push({
                pathname: `/settings/${source.type}/[dataSourceId]`,
                params: { dataSourceId: source.id },
              })
            }
          />
        )
      })}
    </ResourceList>
  )
}

export function SourceTypeScreen() {
  const { t } = useTranslation()
  const { options } = useScreenHeader({ title: t("libraryDetail.sourceType") })
  const providers = Object.keys(SOURCE_TYPES) as DataSourceType[]
  return (
    <>
      <Stack.Screen options={options} />
      <Screen>
        <SectionCard>
          {providers.map((type, index) => (
            <ListRow
              key={type}
              title={SOURCE_TYPES[type]}
              testID={`source-type-${type}`}
              icon={ENTITY_LIST_ROW_ICONS[`${type}DataSource`]}
              isLast={index === providers.length - 1}
              onPress={() => router.push(`/settings/${type}/add`)}
            />
          ))}
        </SectionCard>
      </Screen>
    </>
  )
}
