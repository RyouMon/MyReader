import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import { router, Stack, useLocalSearchParams } from "expo-router"
import { SymbolView } from "expo-symbols"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Platform } from "react-native"
import {
  EmptyState,
  ListRow,
  PrimaryButton,
  Screen,
  SectionCard,
} from "@/src/components"
import { ENTITY_LIST_ROW_ICONS } from "@/src/components/ui/entity-list-row-icons"
import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import { useThemePalette } from "@/src/design/tokens"
import type { DataSourceWebdav } from "@/src/domain/types"
import { DataSourceInUseError } from "@/src/errors"
import { useDataSourceActions } from "@/src/hooks/use-data-source-actions"
import {
  type ScreenHeaderAction,
  useScreenHeader,
} from "@/src/navigation/hooks/use-screen-header"
import { useAppStore } from "@/src/store/app-store"
import { Text, View } from "@/tw"

function formatDate(timestamp?: number) {
  if (!timestamp) {
    return "—"
  }

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return "—"
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function WebDavDetailHero({
  source,
  accent,
}: {
  source: DataSourceWebdav
  accent: string
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()

  return (
    <View className="items-center gap-5 pb-1 pt-2">
      <View
        className="size-36 items-center justify-center rounded-3xl border"
        style={{
          backgroundColor: palette.surface,
          borderColor: palette.border,
          shadowColor: accent,
          shadowOpacity: Platform.OS === "ios" ? 0.12 : 0,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: Platform.OS === "android" ? 2 : 0,
        }}
      >
        <MaterialIcons
          accessibilityLabel={t("webdav.sourcesTitle")}
          name={ENTITY_LIST_ROW_ICONS.webdavDataSource.android}
          size={80}
          color={accent}
        />
      </View>

      <View className="items-center gap-2">
        <Text
          className="text-center text-3xl"
          style={{
            color: palette.text,
            fontFamily: undefined,
            fontWeight: "700",
            letterSpacing: -0.4,
          }}
        >
          {source.name}
        </Text>
        <Text
          className="px-4 text-center text-sm font-medium"
          style={{ color: palette.textMuted }}
          numberOfLines={2}
        >
          {source.endpoint}
          {source.rootPath ? source.rootPath : ""}
        </Text>
      </View>
    </View>
  )
}

export default function WebDavDataSourceDetailScreen() {
  const { t } = useTranslation()
  const { dataSourceId } = useLocalSearchParams<{ dataSourceId?: string }>()
  const palette = useThemePalette()
  const dataSources = useAppStore((state) => state.dataSources)
  const { deleteDataSource } = useDataSourceActions()

  const sourceIndex = useMemo(
    () =>
      dataSources.findIndex(
        (item) => item.id === dataSourceId && item.type === "webdav",
      ),
    [dataSources, dataSourceId],
  )
  const raw = sourceIndex >= 0 ? dataSources[sourceIndex] : undefined
  const storedWebdavSource: DataSourceWebdav | null =
    raw?.type === "webdav" ? raw : null
  const [deletingSourceSnapshot, setDeletingSourceSnapshot] =
    useState<DataSourceWebdav | null>(null)
  const webdavSource = storedWebdavSource ?? deletingSourceSnapshot
  const accent = palette.dataSourceWebdav

  function handleBack() {
    if (router.canGoBack()) {
      router.back()
      return
    }

    router.replace("/settings/webdav")
  }

  function confirmDelete() {
    if (!webdavSource) {
      return
    }

    showAlertWithStatusBarRestore(
      t("webdav.delete.title"),
      t("webdav.delete.confirm", { name: webdavSource.name }),
      [
        { text: t("webdav.delete.cancel"), style: "cancel" },
        {
          text: t("webdav.delete.confirmButton"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDeletingSourceSnapshot(webdavSource)
              try {
                await deleteDataSource(webdavSource.id)
                handleBack()
              } catch (caught) {
                if (caught instanceof DataSourceInUseError) {
                  showAlertWithStatusBarRestore(
                    t("dataSource.deleteInUse.title"),
                    t("dataSource.deleteInUse.message", {
                      names: caught.libraryNames.join("、"),
                    }),
                  )
                } else {
                  showAlertWithStatusBarRestore(
                    t("webdav.deleteFailed.title"),
                    caught instanceof Error
                      ? caught.message
                      : t("webdav.deleteFailed.message"),
                  )
                }
              }
            })()
          },
        },
      ],
    )
  }

  const deleteAction: ScreenHeaderAction | undefined = webdavSource
    ? {
        label: t("webdav.deleteSource"),
        onPress: confirmDelete,
        icon:
          Platform.OS === "ios" ? (
            <SymbolView
              name="trash"
              size={16}
              tintColor={palette.destructive}
            />
          ) : (
            <MaterialIcons
              name="delete-outline"
              size={22}
              color={palette.destructive}
            />
          ),
        iosSfSymbol: "trash",
        color: palette.destructive,
        iconOnly: true,
        variant: "prominent" as const,
      }
    : undefined

  const editAction: ScreenHeaderAction | undefined = storedWebdavSource
    ? {
        label: t("webdav.reconfigureSource"),
        onPress: () =>
          router.push({
            pathname: "/settings/webdav/add",
            params: { dataSourceId: storedWebdavSource.id },
          }),
        icon:
          Platform.OS === "ios" ? (
            <SymbolView name="pencil" size={16} tintColor={palette.text} />
          ) : (
            <MaterialIcons name="edit" size={22} color={palette.text} />
          ),
        iosSfSymbol: "pencil",
        iconOnly: true,
      }
    : undefined

  const { options, toolbar } = useScreenHeader({
    backTitle: t("back"),
    right: [editAction, deleteAction].filter(
      (action): action is ScreenHeaderAction => action !== undefined,
    ),
  })

  if (!webdavSource) {
    return (
      <Screen>
        <Stack.Screen options={options} />
        {toolbar}
        <EmptyState
          title={t("dataSource.notFound.title")}
          detail={t("dataSource.notFound.detail")}
          action={
            <PrimaryButton
              title={t("dataSource.backToList")}
              onPress={() => router.replace("/settings/webdav")}
            />
          }
          icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }}
        />
      </Screen>
    )
  }

  return (
    <Screen>
      <Stack.Screen options={options} />
      {toolbar}
      <View className="flex-1" style={{ backgroundColor: palette.background }}>
        <View className="flex-1 gap-8">
          <WebDavDetailHero source={webdavSource} accent={accent} />
          <SectionCard>
            <ListRow title={t("webdav.type")} detail="WebDAV" />
            <ListRow
              title={t("webdav.serverAddress")}
              detail={webdavSource.endpoint}
            />
            <ListRow
              title={t("webdav.username")}
              detail={webdavSource.username}
            />
            <ListRow
              title={t("webdav.password")}
              detail={
                webdavSource.hasPassword
                  ? t("webdav.passwordSaved")
                  : t("webdav.passwordNotSet")
              }
            />
            <ListRow
              title={t("webdav.basePath")}
              detail={
                webdavSource.rootPath?.trim() ? webdavSource.rootPath : "/"
              }
            />
            <ListRow
              title={t("webdav.status")}
              detail={
                webdavSource.enabled
                  ? t("webdav.enabled")
                  : t("webdav.disabled")
              }
            />
            <ListRow
              title={t("webdav.addedAt")}
              detail={formatDate(webdavSource.createdAt)}
              isLast
            />
          </SectionCard>
        </View>
      </View>
    </Screen>
  )
}
