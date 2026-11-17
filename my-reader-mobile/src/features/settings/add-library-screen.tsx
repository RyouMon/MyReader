import { appendErrorDetail } from "@my-reader/i18n/mobile"
import { coreErrorKind } from "@/src/services/core/error"
import { appendRemotePathSegment } from "@my-reader/tools/remote-path"
import { router, Stack, useLocalSearchParams } from "expo-router"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Platform } from "react-native"

import {
  FormTextField,
  HelpSection,
  ListRow,
  Screen,
  SectionCard,
  SectionLabel,
} from "@/src/components"
import { ENTITY_LIST_ROW_ICONS } from "@/src/components/ui/entity-list-row-icons"
import { showErrorAlert } from "@/src/constants/alert-with-status-bar"
import { useThemePalette } from "@/src/design/tokens"
import {
  createAppInternalMyReaderLibrary,
  createFolderMyReaderLibrary,
  createRemoteMyReaderLibrary,
  nextMyReaderLibraryName,
  openExistingLocalLibraryFromPicker,
} from "@/src/domain/library/hooks/library-actions"
import { pickLocalLibraryDirectory } from "@/src/domain/library/local-library-picker"
import type { DataSource } from "@/src/domain/types"
import {
  cloudSourceIcon,
  type CloudProvider,
} from "@/src/features/cloud/cloud-data-source"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"
import { createSaveAction } from "@/src/navigation/toolbar-action-helpers"
import { useAppStore } from "@/src/store/app-store"
import { View } from "@/tw"
import { useAddLibraryFlow } from "./add-library-flow-context"

export type LibraryOperation = "create" | "open"

function libraryOperation(value: string | undefined): LibraryOperation {
  return value === "create" ? "create" : "open"
}

function remoteSources(dataSources: DataSource[]): DataSource[] {
  return dataSources.filter(
    (source) =>
      source.type === "webdav" ||
      source.type === "onedrive" ||
      source.type === "gdrive" ||
      source.type === "dropbox" ||
      source.type === "s3",
  )
}

function sourceBrowserPath(source: DataSource, operation: LibraryOperation) {
  return {
    pathname: "/settings/add-library/browser" as const,
    params: {
      dataSourceId: source.id,
      sourceType: source.type,
      currentPath: "/",
      libraryAction: operation,
    },
  }
}

function showOperationError(t: (key: string) => string, error: unknown): void {
  const kind = coreErrorKind(error)
  if (kind === "LibraryFolderAlreadyExists" || kind === "LibraryRootNotEmpty") {
    showErrorAlert(
      t("addLibrary.folderExists.title"),
      appendErrorDetail(t("addLibrary.folderExists.detail"), error),
    )
    return
  }
  if (kind === "LibraryAlreadyExists") {
    showErrorAlert(
      t("sync.cannotAddDuplicate"),
      appendErrorDetail(t("sync.alreadyAdded"), error),
    )
    return
  }
  if (kind === "MetadataDbNotFound" || kind === "LibraryMarkerNotFound") {
    showErrorAlert(
      t("addLibrary.unrecognized.title"),
      appendErrorDetail(t("addLibrary.unrecognized.detail"), error),
    )
    return
  }
  showErrorAlert(
    t("addLibrary.operationFailed"),
    appendErrorDetail(t("addLibrary.operationFailedDetail"), error),
  )
}

export default function AddLibraryScreen() {
  const { t } = useTranslation()
  const { dismiss } = useAddLibraryFlow()
  const { options, toolbar } = useScreenHeader({
    back: "hidden",
    left: [
      {
        label: t("common.close"),
        onPress: dismiss,
        iosSfSymbol: "xmark",
        iconOnly: true,
      },
    ],
  })

  return (
    <>
      <Stack.Screen options={options} />
      {toolbar}
      <Screen>
        <SectionCard>
          <ListRow
            testID="add-library-create"
            title={t("addLibraryFlow.create.title")}
            detail={t("addLibraryFlow.create.description")}
            onPress={() =>
              router.push({
                pathname: "/settings/add-library/location",
                params: { libraryAction: "create" },
              })
            }
          />
          <ListRow
            testID="add-library-open"
            title={t("addLibraryFlow.open.title")}
            detail={t("addLibraryFlow.open.description")}
            onPress={() =>
              router.push({
                pathname: "/settings/add-library/location",
                params: { libraryAction: "open" },
              })
            }
            isLast
          />
        </SectionCard>
        <HelpSection
          title={t("addLibraryFlow.help.label")}
          items={[
            {
              title: t("addLibraryFlow.help.myreader.title"),
              body: t("addLibraryFlow.help.myreader.body"),
            },
            {
              title: t("addLibraryFlow.help.calibre.title"),
              body: t("addLibraryFlow.help.calibre.body"),
            },
            {
              title: t("addLibraryFlow.help.sync.title"),
              body: t("addLibraryFlow.help.sync.body"),
            },
            {
              title: t("addLibraryFlow.help.choice.title"),
              body: t("addLibraryFlow.help.choice.body"),
            },
          ]}
        />
      </Screen>
    </>
  )
}

export function AddLibraryLocationScreen() {
  const { t } = useTranslation()
  const {
    libraryAction: libraryActionParam,
    pendingShareName,
    pendingShareUri,
  } = useLocalSearchParams<{
    libraryAction?: string
    pendingShareName?: string
    pendingShareUri?: string
  }>()
  const operation = libraryOperation(libraryActionParam)
  const sources = remoteSources(useAppStore((state) => state.dataSources))
  const { finishAddingLibrary, setLocalFolder, setPendingImport } =
    useAddLibraryFlow()
  useEffect(() => {
    if (!pendingShareUri) return
    setPendingImport({
      uri: pendingShareUri,
      ...(pendingShareName ? { originalName: pendingShareName } : {}),
    })
  }, [pendingShareName, pendingShareUri, setPendingImport])

  function handleAppInternalStorage() {
    setLocalFolder(null)
    router.push("/settings/add-library/create")
  }

  async function handleLocalStorage() {
    try {
      const picked = await pickLocalLibraryDirectory()
      if (!picked) return
      if (operation === "create") {
        setLocalFolder(picked)
        router.push("/settings/add-library/create")
        return
      }
      const library = await openExistingLocalLibraryFromPicker(picked)
      if (library) finishAddingLibrary(library)
    } catch (error) {
      showOperationError(t, error)
    }
  }

  function handleAddCloud(provider: CloudProvider) {
    router.push({
      pathname: `/settings/add-library/${provider}` as never,
      params: {
        from: "add-library",
        libraryAction: operation,
      } as never,
    })
  }

  const { options, toolbar } = useScreenHeader({
    title:
      operation === "create"
        ? t("addLibrary.selectSaveLocation")
        : t("addLibrary.selectLibraryLocation"),
    backTitle: t("back"),
  })

  return (
    <>
      <Stack.Screen options={options} />
      {toolbar}
      <Screen>
        {operation === "create" ||
        Platform.OS === "ios" ||
        sources.length > 0 ? (
          <View className="gap-3">
            <SectionLabel>{t("addLibraryFlow.storageLocations")}</SectionLabel>
            <SectionCard>
              {operation === "create" ? (
                <ListRow
                  testID="add-library-app-internal-storage"
                  title={t("common.appInternalStorage")}
                  icon={ENTITY_LIST_ROW_ICONS.appStorage}
                  onPress={handleAppInternalStorage}
                  isLast={Platform.OS !== "ios" && sources.length === 0}
                />
              ) : null}
              {Platform.OS === "ios" ? (
                <ListRow
                  testID="add-library-local-storage"
                  title={t("common.localStorage")}
                  icon={ENTITY_LIST_ROW_ICONS.localDataSource}
                  onPress={() => void handleLocalStorage()}
                  isLast={sources.length === 0}
                />
              ) : null}
              {sources.map((source, index) => (
                <ListRow
                  key={source.id}
                  testID={`add-library-data-source-${source.id}`}
                  title={
                    source.type === "onedrive" ||
                    source.type === "gdrive" ||
                    source.type === "dropbox"
                      ? source.displayName || source.name
                      : source.name
                  }
                  detail={
                    source.type === "onedrive" ||
                    source.type === "gdrive" ||
                    source.type === "dropbox"
                      ? (source.email ?? undefined)
                      : source.type === "webdav"
                        ? source.endpoint
                        : source.type === "s3"
                          ? `${source.endpoint}/${source.bucket}`
                          : undefined
                  }
                  icon={
                    source.type === "webdav"
                      ? ENTITY_LIST_ROW_ICONS.webdavDataSource
                      : source.type === "onedrive"
                        ? ENTITY_LIST_ROW_ICONS.onedriveDataSource
                        : ENTITY_LIST_ROW_ICONS[cloudSourceIcon(source.type)]
                  }
                  onPress={() =>
                    router.push(sourceBrowserPath(source, operation))
                  }
                  isLast={index === sources.length - 1}
                />
              ))}
            </SectionCard>
          </View>
        ) : null}
        <View className="gap-3">
          <SectionLabel>{t("addLibraryFlow.addStorage")}</SectionLabel>
          <SectionCard>
            <ListRow
              testID="add-library-add-webdav"
              title={t("addLibraryFlow.addWebdav.title")}
              icon={ENTITY_LIST_ROW_ICONS.webdavDataSource}
              onPress={() =>
                router.push({
                  pathname: "/settings/add-library/webdav",
                  params: {
                    from: "add-library",
                    libraryAction: operation,
                  },
                })
              }
            />
            <ListRow
              testID="add-library-add-onedrive"
              title={t("addLibraryFlow.addOnedrive.title")}
              icon={ENTITY_LIST_ROW_ICONS.onedriveDataSource}
              onPress={() =>
                router.push({
                  pathname: "/settings/add-library/onedrive",
                  params: {
                    from: "add-library",
                    libraryAction: operation,
                  },
                })
              }
            />
            <ListRow
              testID="add-library-add-gdrive"
              title={t("addLibraryFlow.addGdrive.title")}
              icon={ENTITY_LIST_ROW_ICONS.gdriveDataSource}
              onPress={() => handleAddCloud("gdrive")}
            />
            <ListRow
              testID="add-library-add-dropbox"
              title={t("addLibraryFlow.addDropbox.title")}
              icon={ENTITY_LIST_ROW_ICONS.dropboxDataSource}
              onPress={() => handleAddCloud("dropbox")}
            />
            <ListRow
              testID="add-library-add-s3"
              title={t("addLibraryFlow.addS3.title")}
              icon={ENTITY_LIST_ROW_ICONS.s3DataSource}
              onPress={() => handleAddCloud("s3")}
              isLast
            />
          </SectionCard>
        </View>
      </Screen>
    </>
  )
}

export function CreateLibraryScreen() {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const { dataSourceId, sourcePath } = useLocalSearchParams<{
    dataSourceId?: string
    sourcePath?: string
  }>()
  const {
    finishAddingLibrary,
    localFolder,
    setLocalFolder,
    takePendingImport,
  } = useAddLibraryFlow()
  const source = useAppStore((state) =>
    state.dataSources.find((candidate) => candidate.id === dataSourceId),
  )
  const [name, setName] = useState(() => nextMyReaderLibraryName())
  const [saving, setSaving] = useState(false)
  const trimmedName = name.trim()
  const folderNameValid = appendRemotePathSegment("/", trimmedName) !== null
  const remotePath = source
    ? appendRemotePathSegment(sourcePath ?? "/", trimmedName)
    : undefined
  const nameInvalid =
    !folderNameValid || (source !== undefined && remotePath === null)

  async function handleCreate() {
    if (nameInvalid || saving) return

    setSaving(true)
    try {
      if (dataSourceId && !source) {
        throw new Error("DATASOURCE_NOT_FOUND")
      }
      const library = source
        ? await createRemoteMyReaderLibrary(source, remotePath!, trimmedName)
        : localFolder
          ? await createFolderMyReaderLibrary(localFolder, trimmedName)
          : await createAppInternalMyReaderLibrary(trimmedName)
      if (!library) return
      setLocalFolder(null)
      const pendingImport = takePendingImport()
      if (pendingImport) {
        router.replace({
          pathname: "/handle-share",
          params: {
            contentUri: pendingImport.uri,
            libraryId: library.id,
            ...(pendingImport.originalName
              ? { originalName: pendingImport.originalName }
              : {}),
          },
        })
        return
      }
      finishAddingLibrary(library)
    } catch (error) {
      showOperationError(t, error)
    } finally {
      setSaving(false)
    }
  }

  const { options, toolbar } = useScreenHeader({
    title: t("addLibraryFlow.create.title"),
    back: "hidden",
    left: [
      {
        label: t("back"),
        onPress: () => router.back(),
        iosSfSymbol: "chevron.left",
        iconOnly: true,
      },
    ],
    right: [
      createSaveAction({
        label: saving ? t("addLibrary.creating") : t("addLibrary.create"),
        onPress: () => void handleCreate(),
        loading: saving,
        color: palette.primary,
        disabled: nameInvalid,
      }),
    ],
  })

  return (
    <>
      <Stack.Screen options={options} />
      {toolbar}
      <Screen>
        <View className="gap-3">
          <FormTextField
            label={t("addLibrary.name")}
            error={
              trimmedName.length > 0 && !folderNameValid
                ? t("addLibrary.invalidName")
                : undefined
            }
            required
            value={name}
            onChangeText={setName}
            placeholder={t("common.myLibrary")}
            autoFocus
            autoCapitalize="sentences"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => void handleCreate()}
            testID="new-library-name"
          />
        </View>
      </Screen>
    </>
  )
}
