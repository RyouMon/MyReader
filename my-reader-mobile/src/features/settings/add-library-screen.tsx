import { appendRemotePathSegment } from "@my-reader/tools/remote-path"
import { router, Stack, useLocalSearchParams } from "expo-router"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Platform } from "react-native"

import {
  FormLabeledFieldRow,
  HelpSection,
  ListRow,
  Screen,
  SectionCard,
  SectionLabel,
} from "@/src/components"
import { ENTITY_LIST_ROW_ICONS } from "@/src/components/ui/entity-list-row-icons"
import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
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
import { useAddOneDriveDataSource } from "@/src/features/onedrive/hooks/use-add-onedrive-data-source"
import { OneDriveAddingEmptyState } from "@/src/features/onedrive/onedrive-adding-empty-state"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"
import { createSaveAction } from "@/src/navigation/toolbar-action-helpers"
import { useAppStore } from "@/src/store/app-store"
import { TextInput, View } from "@/tw"
import { useAddLibraryFlow } from "./add-library-flow-context"

export type LibraryOperation = "create" | "open"

function libraryOperation(value: string | undefined): LibraryOperation {
  return value === "create" ? "create" : "open"
}

function remoteSources(dataSources: DataSource[]): DataSource[] {
  return dataSources.filter(
    (source) => source.type === "webdav" || source.type === "onedrive",
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
  const message = String(error)
  if (
    message.includes("LIBRARY_FOLDER_ALREADY_EXISTS") ||
    message.includes("LIBRARY_ROOT_NOT_EMPTY") ||
    message.includes("REMOTE_LIBRARY_ROOT_NOT_EMPTY")
  ) {
    showAlertWithStatusBarRestore(
      t("addLibrary.folderExists.title"),
      t("addLibrary.folderExists.detail"),
    )
    return
  }
  if (message.includes("LIBRARY_ALREADY_EXISTS")) {
    showAlertWithStatusBarRestore(
      t("sync.cannotAddDuplicate"),
      t("sync.alreadyAdded"),
    )
    return
  }
  if (
    message.includes("LIBRARY_TYPE_NOT_RECOGNIZED") ||
    message.includes("METADATA_DB_NOT_FOUND") ||
    message.includes("MYREADER_LIBRARY_MARKER_NOT_FOUND")
  ) {
    showAlertWithStatusBarRestore(
      t("addLibrary.unrecognized.title"),
      t("addLibrary.unrecognized.detail"),
    )
    return
  }
  showAlertWithStatusBarRestore(
    t("addLibrary.operationFailed"),
    t("addLibrary.operationFailedDetail"),
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
  const { addOneDriveDataSource, busy: addingOneDrive } =
    useAddOneDriveDataSource()

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

  async function handleAddOneDrive() {
    const source = await addOneDriveDataSource()
    if (source) router.push(sourceBrowserPath(source, operation))
  }

  const { options, toolbar } = useScreenHeader({
    title:
      operation === "create"
        ? t("addLibrary.selectSaveLocation")
        : t("addLibrary.selectLibraryLocation"),
    backTitle: t("back"),
  })

  if (addingOneDrive) {
    return (
      <>
        <Stack.Screen options={options} />
        {toolbar}
        <Screen>
          <OneDriveAddingEmptyState />
        </Screen>
      </>
    )
  }

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
                  title={source.name}
                  icon={
                    ENTITY_LIST_ROW_ICONS[
                      source.type === "onedrive"
                        ? "onedriveDataSource"
                        : "webdavDataSource"
                    ]
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
              onPress={() => void handleAddOneDrive()}
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
        <View
          className="rounded-3xl px-4 py-4"
          style={{
            backgroundColor: palette.surface,
            borderColor: palette.border,
            borderWidth: 1,
          }}
        >
          <FormLabeledFieldRow
            label={t("addLibrary.name")}
            error={
              trimmedName.length > 0 && !folderNameValid
                ? t("addLibrary.invalidName")
                : undefined
            }
            required
          >
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t("common.myLibrary")}
              placeholderTextColor={palette.textMuted}
              autoFocus
              autoCapitalize="sentences"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => void handleCreate()}
              className="min-h-10 border-0 bg-transparent py-1 text-base"
              style={{ color: palette.text }}
              testID="new-library-name"
            />
          </FormLabeledFieldRow>
        </View>
      </Screen>
    </>
  )
}
