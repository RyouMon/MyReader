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
import {
  DropboxIcon,
  GoogleDriveIcon,
  S3StorageIcon,
} from "@/src/components/ui/provider-icons"
import {
  showAlertWithStatusBarRestore,
  showErrorAlert,
} from "@/src/constants/alert-with-status-bar"
import { useThemePalette } from "@/src/design/tokens"
import { DataSourceInUseError } from "@/src/errors"
import { useCloudDataSource } from "@/src/features/cloud/hooks/use-cloud-data-source"
import { useDataSourceActions } from "@/src/hooks/use-data-source-actions"
import { errorMessage } from "@/src/i18n/error-message"
import {
  type ScreenHeaderAction,
  useScreenHeader,
} from "@/src/navigation/hooks/use-screen-header"
import { useAppStore } from "@/src/store/app-store"
import { Text, View } from "@/tw"
import {
  type CloudDataSource,
  type CloudProvider,
  cloudAddPath,
  cloudSourcePath,
  isOAuthCloudProvider,
  providerTitle,
} from "./cloud-data-source"

function formatDate(timestamp: number | undefined, locale: string) {
  if (!timestamp) return "—"
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function CloudDataSourceSummary({
  source,
  title,
  palette,
  locale,
}: {
  source: CloudDataSource
  title: string
  palette: ReturnType<typeof useThemePalette>
  locale: string
}) {
  const { t } = useTranslation()
  const isOAuthSource = source.type === "gdrive" || source.type === "dropbox"
  const providerIcon =
    source.type === "gdrive" ? (
      <GoogleDriveIcon size={64} />
    ) : source.type === "dropbox" ? (
      <DropboxIcon size={64} />
    ) : (
      <S3StorageIcon size={64} />
    )
  return (
    <Screen>
      <View className="items-center gap-4 pb-2 pt-2">
        <View
          className="size-28 items-center justify-center rounded-3xl border"
          style={{
            backgroundColor: palette.surface,
            borderColor: palette.border,
            shadowColor: palette.primary,
            shadowOpacity: Platform.OS === "ios" ? 0.12 : 0,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
            elevation: Platform.OS === "android" ? 2 : 0,
          }}
        >
          {providerIcon}
        </View>
        <Text
          className="text-center text-2xl font-bold"
          style={{ color: palette.text }}
        >
          {source.name}
        </Text>
      </View>
      <SectionCard>
        <ListRow title={t("cloud.detail.type")} detail={title} />
        {isOAuthSource ? (
          <>
            <ListRow
              title={t("cloud.detail.displayName")}
              detail={source.displayName ?? ""}
            />
            <ListRow
              title={t("cloud.detail.email")}
              detail={source.email ?? ""}
            />
            <ListRow
              title={t("cloud.detail.authStatus")}
              detail={
                source.hasRefreshToken
                  ? t("cloud.detail.authenticated")
                  : t("cloud.detail.notAuthenticated")
              }
            />
          </>
        ) : source.type === "s3" ? (
          <>
            <ListRow
              title={t("cloud.detail.endpoint")}
              detail={source.endpoint}
            />
            <ListRow title={t("cloud.detail.bucket")} detail={source.bucket} />
            <ListRow title={t("cloud.detail.region")} detail={source.region} />
            <ListRow
              title={t("cloud.detail.authStatus")}
              detail={
                source.hasCredentials
                  ? t("cloud.detail.authenticated")
                  : t("cloud.detail.notAuthenticated")
              }
            />
          </>
        ) : null}
        <ListRow
          title={t("cloud.detail.rootPath")}
          detail={source.rootPath?.trim() || "/"}
        />
        <ListRow
          title={t("cloud.detail.addedAt")}
          detail={formatDate(source.createdAt, locale)}
          isLast
        />
      </SectionCard>
    </Screen>
  )
}

export function CloudDataSourceDetailScreen({
  provider,
}: {
  provider: CloudProvider
}) {
  const { t, i18n } = useTranslation()
  const { dataSourceId } = useLocalSearchParams<{ dataSourceId?: string }>()
  const palette = useThemePalette()
  const dataSources = useAppStore((state) => state.dataSources)
  const { deleteDataSource } = useDataSourceActions()
  const { reauthenticate, busy: authenticating } = useCloudDataSource()
  const stored = useMemo<CloudDataSource | undefined>(
    () =>
      dataSources.find(
        (source) => source.id === dataSourceId && source.type === provider,
      ) as CloudDataSource | undefined,
    [dataSourceId, dataSources, provider],
  )
  const [deletingSnapshot, setDeletingSnapshot] =
    useState<CloudDataSource | null>(null)
  const source = stored ?? deletingSnapshot
  const title = providerTitle(provider)

  function goBack() {
    if (router.canGoBack()) router.back()
    else router.replace(cloudSourcePath(provider) as never)
  }

  function confirmDelete() {
    if (!source) return
    showAlertWithStatusBarRestore(
      t("cloud.delete.title", { provider: title }),
      t("cloud.delete.confirm", { name: source.name }),
      [
        { text: t("cloud.delete.cancel"), style: "cancel" },
        {
          text: t("cloud.delete.confirmButton"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDeletingSnapshot(source)
              try {
                await deleteDataSource(source.id)
                goBack()
              } catch (caught) {
                if (caught instanceof DataSourceInUseError) {
                  showAlertWithStatusBarRestore(
                    t("dataSource.deleteInUse.title"),
                    t("dataSource.deleteInUse.message", {
                      names: caught.libraryNames.join("、"),
                    }),
                  )
                } else {
                  showErrorAlert(t("cloud.delete.failed"), errorMessage(caught))
                }
              }
            })()
          },
        },
      ],
    )
  }

  const deleteAction: ScreenHeaderAction | undefined = source
    ? {
        label: t("cloud.delete.action"),
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
        color: Platform.OS === "android" ? palette.danger : palette.destructive,
        iconOnly: true,
        variant: "prominent" as const,
      }
    : undefined
  const editAction: ScreenHeaderAction | undefined = source
    ? {
        label: String(t("cloud.edit" as never)),
        onPress: () =>
          router.push({
            pathname: cloudAddPath(provider) as never,
            params: { dataSourceId: source.id } as never,
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
  const reauthAction: ScreenHeaderAction | undefined =
    source && isOAuthCloudProvider(provider)
      ? {
          label: t("cloud.auth.reauthenticate"),
          onPress: () => {
            if (source.type === "gdrive" || source.type === "dropbox") {
              void reauthenticate(source)
            }
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
    right: [reauthAction, editAction, deleteAction].filter(
      (action): action is ScreenHeaderAction => action !== undefined,
    ),
  })

  if (!source) {
    return (
      <>
        <Stack.Screen options={options} />
        {toolbar}
        <Screen>
          <EmptyState
            title={t("dataSource.notFound.title")}
            detail={t("dataSource.notFound.detail")}
            action={
              <PrimaryButton
                title={t("dataSource.backToList")}
                onPress={() =>
                  router.replace(cloudSourcePath(provider) as never)
                }
              />
            }
            icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }}
          />
        </Screen>
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={options} />
      {toolbar}
      <CloudDataSourceSummary
        source={source}
        title={title}
        palette={palette}
        locale={i18n.resolvedLanguage ?? i18n.language}
      />
    </>
  )
}
