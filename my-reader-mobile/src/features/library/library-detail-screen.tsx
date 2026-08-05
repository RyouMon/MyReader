import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import { libraryTypeOf } from "@my-reader/tools/types/library"
import * as Haptics from "expo-haptics"
import { router, Stack, useLocalSearchParams } from "expo-router"
import { SymbolView } from "expo-symbols"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Platform } from "react-native"
import { EmptyState, ListRow, SectionCard } from "@/src/components"
import { Button, ButtonGroup } from "@/src/components/ui"
import { Screen } from "@/src/components/ui/screen"
import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import { useThemePalette } from "@/src/design/tokens"
import {
  removeLibrary,
  switchActiveLibrary,
} from "@/src/domain/library/hooks/library-actions"
import { notifyLibraryRefresh } from "@/src/domain/notifications/download-notifications"
import { useSyncLibrary } from "@/src/domain/sync/hooks/use-sync-library"
import type { DataSource, Library } from "@/src/domain/types"
import { isRemoteSourceType } from "@/src/domain/types"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"
import { localLibraryFolderName } from "@/src/services/fs/library-paths"
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

function getSourceTypeLabel(t: (key: string) => string, library: Library) {
  if (library.sourceType === "onedrive") return t("libraryDetail.typeOnedrive")
  if (isRemoteSourceType(library.sourceType))
    return t("libraryDetail.typeWebdav")
  return t("libraryDetail.typeLocal")
}

function getLibraryTypeLabel(t: (key: string) => string, library: Library) {
  return libraryTypeOf(library) === "myreader"
    ? t("libraryDetail.myreaderLibrary")
    : t("libraryDetail.calibreLibrary")
}

function getStorageLocationLabel(
  t: (key: string) => string,
  library: Library,
  dataSource?: DataSource | null,
) {
  if (!isRemoteSourceType(library.sourceType)) return t("common.localStorage")
  return dataSource?.name ?? getSourceTypeLabel(t, library)
}

function getRemotePathDetail(
  library: Library,
  dataSource?: DataSource | null,
): string | null {
  if (!isRemoteSourceType(library.sourceType)) return null

  return library.sourcePath ?? dataSource?.rootPath ?? "/"
}

function dismissLibraryDetail() {
  if (router.canGoBack()) {
    router.back()
    return
  }

  router.replace("/settings")
}

function DetailHero({
  library,
  accent,
  isActive,
  t,
}: {
  library: Library
  accent: string
  isActive: boolean
  t: (key: string, options?: Record<string, unknown>) => string
}) {
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
          accessibilityLabel={t("libraryDetail.libraryLabel")}
          fallback={
            <MaterialIcons
              accessibilityLabel={t("libraryDetail.libraryLabel")}
              name="auto-stories"
              size={80}
              color={accent}
            />
          }
          name={{
            ios: "books.vertical.fill",
            android: "library_books",
          }}
          resizeMode="scaleAspectFit"
          size={80}
          tintColor={accent}
          weight="medium"
        />
      </View>

      <View className="items-center gap-2">
        <Text
          className="text-center text-2xl"
          style={{
            color: palette.text,
            fontFamily: undefined,
            fontWeight: "700",
            letterSpacing: -0.4,
          }}
        >
          {library.name}
        </Text>
        <Text style={{ color: palette.textMuted }}>
          {t("libraryDetail.bookCount", { count: library.bookCount })}
          {isActive ? t("libraryDetail.currentlyUsed") : ""}
        </Text>
      </View>
    </View>
  )
}

export default function LibraryDetailScreen() {
  const { t } = useTranslation()
  const { libraryId } = useLocalSearchParams<{ libraryId?: string }>()
  const palette = useThemePalette()
  const libraries = useAppStore((state) => state.libraries)
  const activeLibraryId = useAppStore((state) => state.activeLibraryId)
  const dataSources = useAppStore((state) => state.dataSources)
  const { syncNow, isSyncing } = useSyncLibrary()
  const libraryIndex = useMemo(
    () => libraries.findIndex((item) => item.id === libraryId),
    [libraries, libraryId],
  )
  const storedLibrary =
    libraryIndex >= 0 ? (libraries[libraryIndex] ?? null) : null
  const [removingLibrarySnapshot, setRemovingLibrarySnapshot] =
    useState<Library | null>(null)
  const library = storedLibrary ?? removingLibrarySnapshot
  const linkedDataSource = useMemo(
    () =>
      dataSources.find((source) => source.id === library?.dataSourceId) ?? null,
    [dataSources, library?.dataSourceId],
  )
  const isActive = library?.id === activeLibraryId
  const accent = palette.primary

  function confirmRemove() {
    if (!library) {
      return
    }

    showAlertWithStatusBarRestore(
      t("libraryDetail.remove.title"),
      t("libraryDetail.remove.message"),
      [
        {
          text: t("libraryDetail.remove.cancel"),
          style: "cancel",
        },
        {
          text: t("libraryDetail.remove.confirm"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              setRemovingLibrarySnapshot(library)
              await removeLibrary(library.id)
              dismissLibraryDetail()
            })()
          },
        },
      ],
    )
  }

  const { options, toolbar } = useScreenHeader({
    close: { target: "/settings", dismissTo: true, variant: "layout" },
    right: library
      ? [
          {
            label: t("libraryDetail.removeLibrary"),
            onPress: confirmRemove,
            iosSfSymbol: "trash",
            color: palette.destructive,
            iconOnly: true,
            variant: "prominent",
          },
        ]
      : undefined,
  })

  if (!library) {
    return (
      <>
        <Stack.Screen options={options} />
        {toolbar}
        <Screen>
          <EmptyState
            title={t("libraryDetail.notFound.title")}
            detail={t("libraryDetail.notFound.detail")}
            icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }}
          />
        </Screen>
      </>
    )
  }

  const folderName = localLibraryFolderName(library)
  const remotePath = getRemotePathDetail(library, linkedDataSource)

  return (
    <>
      <Stack.Screen options={options} />
      {toolbar}
      <Screen>
        <View
          className="flex-1"
          style={{ backgroundColor: palette.background }}
        >
          <View className="flex-1 gap-8">
            <DetailHero
              library={library}
              accent={accent}
              isActive={Boolean(isActive)}
              t={t}
            />
            <ButtonGroup>
              <Button
                className="flex-1"
                disabled={Boolean(isActive)}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                  void switchActiveLibrary(library.id)
                }}
                title={t("libraryDetail.useLibrary")}
                variant="primary"
              />
              <Button
                className="flex-1"
                disabled={isSyncing}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  void (async () => {
                    try {
                      await syncNow(library.id)
                      notifyLibraryRefresh("done")
                    } catch (e) {
                      notifyLibraryRefresh(
                        "error",
                        e instanceof Error ? e.message : undefined,
                      )
                    }
                  })()
                }}
                title={
                  isSyncing
                    ? t("libraryDetail.refreshing")
                    : t("libraryDetail.refresh")
                }
                variant="secondary"
              />
            </ButtonGroup>
            <SectionCard>
              <ListRow
                title={t("libraryDetail.libraryType")}
                detail={getLibraryTypeLabel(t, library)}
              />
              <ListRow
                title={t("libraryDetail.storageLocation")}
                detail={getStorageLocationLabel(t, library, linkedDataSource)}
              />
              {folderName ? (
                <ListRow
                  title={t("libraryDetail.folderName")}
                  detail={folderName}
                />
              ) : null}
              {remotePath ? (
                <ListRow
                  title={t("libraryDetail.remotePath")}
                  detail={remotePath}
                />
              ) : null}
              <ListRow
                title={t("libraryDetail.bookCountLabel")}
                detail={t("libraryDetail.bookCount", {
                  count: library.bookCount,
                })}
              />
              <ListRow
                title={t("libraryDetail.addedAt")}
                detail={formatDate(library.addedAt)}
                isLast
              />
            </SectionCard>
          </View>
        </View>
      </Screen>
    </>
  )
}
