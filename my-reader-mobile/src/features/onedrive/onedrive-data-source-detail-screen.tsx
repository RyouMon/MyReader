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
import type { DataSourceOnedrive } from "@/src/domain/types"
import { DataSourceInUseError } from "@/src/errors"
import { useAddOneDriveDataSource } from "@/src/features/onedrive/hooks/use-add-onedrive-data-source"
import { useDataSourceActions } from "@/src/hooks/use-data-source-actions"
import {
  type ScreenHeaderAction,
  useScreenHeader,
} from "@/src/navigation/hooks/use-screen-header"
import { useAppStore } from "@/src/store/app-store"
import { Text, View } from "@/tw"

function formatDate(timestamp?: number) {
  if (!timestamp) return "—"
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function OneDriveDetailHero({
  source,
  accent,
}: {
  source: DataSourceOnedrive
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
        <SymbolView
          accessibilityLabel={t("onedrive.sourcesTitle")}
          fallback={
            <MaterialIcons
              accessibilityLabel={t("onedrive.sourcesTitle")}
              name="cloud"
              size={80}
              color={accent}
            />
          }
          name={{
            ios: ENTITY_LIST_ROW_ICONS.onedriveDataSource.ios,
            android: "cloud",
          }}
          resizeMode="scaleAspectFit"
          size={80}
          tintColor={accent}
          weight="medium"
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
          {source.email ?? source.displayName ?? ""}
        </Text>
      </View>
    </View>
  )
}

export default function OneDriveDataSourceDetailScreen() {
  const { t } = useTranslation()
  const { dataSourceId } = useLocalSearchParams<{ dataSourceId?: string }>()
  const palette = useThemePalette()
  const dataSources = useAppStore((state) => state.dataSources)
  const { deleteDataSource } = useDataSourceActions()
  const { busy: authenticating, reauthenticateOneDriveDataSource } =
    useAddOneDriveDataSource()

  const sourceIndex = useMemo(
    () =>
      dataSources.findIndex(
        (item) => item.id === dataSourceId && item.type === "onedrive",
      ),
    [dataSources, dataSourceId],
  )
  const raw = sourceIndex >= 0 ? dataSources[sourceIndex] : undefined
  const storedOnedriveSource: DataSourceOnedrive | null =
    raw?.type === "onedrive" ? raw : null
  const [deletingSourceSnapshot, setDeletingSourceSnapshot] =
    useState<DataSourceOnedrive | null>(null)
  const onedriveSource = storedOnedriveSource ?? deletingSourceSnapshot
  const accent = palette.brandOnedrive

  function handleBack() {
    if (router.canGoBack()) {
      router.back()
      return
    }
    router.replace("/settings/onedrive")
  }

  function confirmDelete() {
    if (!onedriveSource) return

    showAlertWithStatusBarRestore(
      t("onedrive.delete.title"),
      t("onedrive.delete.confirm", { name: onedriveSource.name }),
      [
        { text: t("onedrive.delete.cancel"), style: "cancel" },
        {
          text: t("onedrive.delete.confirmButton"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDeletingSourceSnapshot(onedriveSource)
              try {
                await deleteDataSource(onedriveSource.id)
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
                    t("onedrive.deleteFailed.title"),
                    caught instanceof Error
                      ? caught.message
                      : t("onedrive.deleteFailed.message"),
                  )
                }
              }
            })()
          },
        },
      ],
    )
  }

  const deleteAction: ScreenHeaderAction | undefined = onedriveSource
    ? {
        label: t("onedrive.deleteSource"),
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

  const reauthenticateAction: ScreenHeaderAction | undefined =
    storedOnedriveSource
      ? {
          label: t("onedrive.reauthenticate"),
          onPress: () => {
            void reauthenticateOneDriveDataSource(storedOnedriveSource)
          },
          icon:
            Platform.OS === "ios" ? (
              <SymbolView
                name="arrow.clockwise"
                size={16}
                tintColor={palette.text}
              />
            ) : (
              <MaterialIcons name="login" size={22} color={palette.text} />
            ),
          iosSfSymbol: "arrow.clockwise",
          iconOnly: true,
          loading: authenticating,
          disabled: authenticating,
        }
      : undefined

  const { options, toolbar } = useScreenHeader({
    backTitle: t("back"),
    right: [reauthenticateAction, deleteAction].filter(
      (action): action is ScreenHeaderAction => action !== undefined,
    ),
  })

  if (!onedriveSource) {
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
              onPress={() => router.replace("/settings/onedrive")}
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
          <OneDriveDetailHero source={onedriveSource} accent={accent} />
          <SectionCard>
            <ListRow title={t("onedrive.type")} detail="OneDrive" />
            <ListRow
              title={t("onedrive.displayName")}
              detail={onedriveSource.displayName ?? ""}
            />
            <ListRow
              title={t("onedrive.email")}
              detail={onedriveSource.email ?? ""}
            />
            <ListRow
              title={t("onedrive.basePath")}
              detail={
                onedriveSource.rootPath?.trim() ? onedriveSource.rootPath : "/"
              }
            />
            <ListRow
              title={t("onedrive.authStatus")}
              detail={
                onedriveSource.hasRefreshToken
                  ? t("onedrive.authenticated")
                  : t("onedrive.notAuthenticated")
              }
            />
            <ListRow
              title={t("onedrive.addedAt")}
              detail={formatDate(onedriveSource.createdAt)}
              isLast
            />
          </SectionCard>
        </View>
      </View>
    </Screen>
  )
}
