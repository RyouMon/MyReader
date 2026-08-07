import type { MobileTranslationKey } from "@my-reader/i18n/mobile"
import { router, Stack, useLocalSearchParams } from "expo-router"
import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import {
  EmptyState,
  ListRow,
  PrimaryButton,
  Screen,
  SectionCard,
} from "@/src/components"
import { ErrorBoundary } from "@/src/components/error-boundary"
import { useThemePalette } from "@/src/design/tokens"
import { normalizeCurrentPath } from "@/src/domain/library/remote-library"
import { useAddLibraryFlow } from "@/src/features/settings/add-library-flow-context"
import { useRemoteDirectoryBrowser } from "@/src/features/settings/hooks/use-remote-directory-browser"
import type { RemoteLibraryAction } from "@/src/features/settings/hooks/use-remote-directory-browser"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"
import { createSaveAction } from "@/src/navigation/toolbar-action-helpers"
import { Text, View } from "@/tw"

type RemoteDirectoryBrowserScreenProps = {
  sourceType: "webdav" | "onedrive"
  browserRoute:
    | "/settings/webdav/browser"
    | "/settings/onedrive/browser"
    | "/settings/add-library/browser"
  translationNamespace: "webdav.browser" | "onedrive.browser"
}

type RemoteBrowserTranslationKey = Extract<
  MobileTranslationKey,
  `${RemoteDirectoryBrowserScreenProps["translationNamespace"]}.${string}`
>

/** Shared directory browser for remote data sources (WebDAV, OneDrive). */
export function RemoteDirectoryBrowserScreen({
  sourceType,
  browserRoute,
  translationNamespace,
}: RemoteDirectoryBrowserScreenProps) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const {
    dataSourceId,
    currentPath: currentPathParam,
    from,
    libraryAction: libraryActionParam,
  } = useLocalSearchParams<{
    dataSourceId?: string
    currentPath?: string
    from?: string
    libraryAction?: RemoteLibraryAction
  }>()
  const libraryAction: RemoteLibraryAction =
    libraryActionParam === "create" ? "create" : "open"
  const isAddLibraryBrowser = browserRoute === "/settings/add-library/browser"
  const { dismiss: dismissAddLibrary } = useAddLibraryFlow()
  const handleLibraryOpened = useCallback(() => {
    if (isAddLibraryBrowser) {
      dismissAddLibrary()
      return
    }
    router.dismissTo("/settings")
  }, [dismissAddLibrary, isAddLibraryBrowser])

  const label = (key: string, options?: Record<string, unknown>) =>
    t(`${translationNamespace}.${key}` as RemoteBrowserTranslationKey, options)

  const {
    notFound,
    resolveFailed,
    candidateId,
    entries,
    loading,
    error,
    saving,
    currentPath,
    retry,
    choosePath,
  } = useRemoteDirectoryBrowser({
    dataSourceId,
    currentPathParam,
    libraryAction,
    onLibraryOpened: handleLibraryOpened,
    sourceType,
  })

  function handleOpenDirectory(path: string) {
    if (!candidateId) return
    router.push({
      pathname: browserRoute,
      params: {
        dataSourceId: candidateId,
        sourceType,
        currentPath: normalizeCurrentPath(path),
        ...(from ? { from } : {}),
        libraryAction,
      },
    })
  }

  function handleChooseCurrentPath() {
    if (!candidateId) return
    if (libraryAction === "create") {
      router.push({
        pathname: "/settings/add-library/create",
        params: {
          dataSourceId: candidateId,
          sourcePath: currentPath,
        },
      })
      return
    }
    void choosePath(currentPath, chooseErrorMessages)
  }

  const isAddLibraryFlow = from === "add-library" && currentPath === "/"
  const closeTarget = isAddLibraryFlow ? "/settings/add-library" : "/settings"
  const isRootBrowser = currentPath === "/"

  const chooseErrorMessages = {
    notValidTitle: t("addLibrary.unrecognized.title"),
    notValidMessage: t("addLibrary.unrecognized.detail"),
    duplicateTitle: t("sync.cannotAddDuplicate"),
    duplicateMessage: t("sync.alreadyAdded"),
    generic: t("addLibrary.operationFailedDetail"),
  }

  const { options, toolbar } = useScreenHeader({
    ...(isRootBrowser && !isAddLibraryBrowser
      ? { close: { target: closeTarget, dismissTo: true, variant: "layout" } }
      : {}),
    ...(isAddLibraryBrowser
      ? {
          title:
            libraryAction === "create"
              ? t("addLibrary.selectSaveLocation")
              : t("addLibrary.selectLibraryLocation"),
          back: "hidden" as const,
          left: [
            {
              label: t("back"),
              onPress: () => router.back(),
              iosSfSymbol: "chevron.left" as const,
              iconOnly: true,
            },
          ],
        }
      : {}),
    backTitle: t("reader.back"),
    right: [
      createSaveAction({
        label: saving
          ? label("validating")
          : libraryAction === "create"
            ? t("addLibrary.continue")
            : t("addLibrary.open"),
        onPress: handleChooseCurrentPath,
        loading: saving,
        color: palette.primary,
      }),
    ],
  })

  if (notFound) {
    return (
      <Screen>
        <EmptyState
          title={label("notFound.title")}
          detail={label("notFound.detail")}
          icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }}
        />
      </Screen>
    )
  }

  return (
    <>
      <Stack.Screen options={options} />
      {toolbar}

      <Screen>
        <ErrorBoundary
          title={label("loadFailed.title")}
          message={label("loadFailed.message")}
          onRetry={retry}
        >
          <View className="gap-3">
            <Text
              className="px-4 text-base text-muted"
              style={{ color: palette.textMuted }}
            >
              {t("addLibrary.path", { path: currentPath })}
            </Text>

            {loading ? (
              <EmptyState
                title={label("reading.title")}
                detail={label("reading.detail")}
                icon={{ ios: "hourglass", android: "hourglass-empty" }}
              />
            ) : resolveFailed ? (
              <EmptyState
                title={label("readFailed.title")}
                detail={label("noCredentials")}
                icon={{
                  ios: "exclamationmark.triangle.fill",
                  android: "warning",
                }}
              />
            ) : error ? (
              <EmptyState
                title={label("readFailed.title")}
                detail={error}
                action={
                  <PrimaryButton
                    title={t("errorBoundary.retry")}
                    onPress={retry}
                  />
                }
                icon={{
                  ios: "exclamationmark.triangle.fill",
                  android: "warning",
                }}
              />
            ) : entries.length === 0 ? (
              <EmptyState
                title={label("empty.title")}
                detail={label("empty.detail")}
                icon={{ ios: "folder", android: "folder-open" }}
              />
            ) : (
              <SectionCard>
                {entries.map((entry, index) => (
                  <ListRow
                    key={entry.path}
                    title={entry.name}
                    icon={{ ios: "folder.fill", android: "folder" }}
                    onPress={() => handleOpenDirectory(entry.path)}
                    isLast={index === entries.length - 1}
                  />
                ))}
              </SectionCard>
            )}
          </View>
        </ErrorBoundary>
      </Screen>
    </>
  )
}
