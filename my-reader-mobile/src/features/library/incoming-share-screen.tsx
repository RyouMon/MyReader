import { type Library, libraryTypeOf } from "@my-reader/tools/types/library"
import { File } from "expo-file-system"
import { type Href, router, useLocalSearchParams } from "expo-router"
import { useIncomingShare } from "expo-sharing"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ActivityIndicator, Platform } from "react-native"

import { Button, EmptyState } from "@/src/components"
import { useThemePalette } from "@/src/design/tokens"
import {
  importBookFromFile,
  supportedBookExtension,
} from "@/src/domain/library/hooks/library-actions"
import {
  deleteStagedBookImport,
  stageBookImport,
} from "@/src/services/fs/staged-book-import"
import { useAppStore, useAppStoreReady } from "@/src/store/app-store"
import { View } from "@/tw"

function deleteResolvedShareFile(contentUri: string | null): void {
  if (Platform.OS !== "ios" || !contentUri) return

  try {
    const file = new File(contentUri)
    if (file.exists) file.delete()
  } catch {
    // The import result is still valid when best-effort share cleanup fails.
  }
}

function myReaderLibraryForImport(
  libraries: Library[],
  activeLibraryId: string | null,
  requestedLibraryId?: string,
): Library | null {
  if (requestedLibraryId) {
    return (
      libraries.find(
        (library) =>
          library.id === requestedLibraryId &&
          libraryTypeOf(library) === "myreader",
      ) ?? null
    )
  }

  const active = libraries.find((library) => library.id === activeLibraryId)
  if (active && libraryTypeOf(active) === "myreader") return active
  return (
    libraries.find((library) => libraryTypeOf(library) === "myreader") ?? null
  )
}

function sharedBookExtension(
  contentUri: string | null,
  originalName?: string | null,
): string | null {
  if (!contentUri) return null
  try {
    return supportedBookExtension(new File(contentUri), originalName)
  } catch {
    return null
  }
}

export default function IncomingShareScreen() {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const storeReady = useAppStoreReady()
  const libraries = useAppStore((state) => state.libraries)
  const activeLibraryId = useAppStore((state) => state.activeLibraryId)
  const {
    contentUri: routeContentUri,
    libraryId: requestedLibraryId,
    originalName: routeOriginalName,
  } = useLocalSearchParams<{
    contentUri?: string
    libraryId?: string
    originalName?: string
  }>()
  const [importFailed, setImportFailed] = useState(false)
  const handlingRef = useRef(false)
  const {
    clearSharedPayloads,
    error,
    isResolving,
    resolvedSharedPayloads,
    sharedPayloads,
  } = useIncomingShare()
  const payload = resolvedSharedPayloads[0]
  const resolvedContentUri =
    resolvedSharedPayloads.length === 1 &&
    payload &&
    "contentUri" in payload &&
    typeof payload.contentUri === "string"
      ? payload.contentUri
      : null
  const contentUri = routeContentUri ?? resolvedContentUri
  const originalName = routeContentUri
    ? routeOriginalName
    : payload?.originalName
  const extension = sharedBookExtension(contentUri, originalName)
  const supportedPayload = extension !== null
  const resolvingPayload = !routeContentUri && isResolving
  const invalidShare =
    Boolean(error) ||
    (!resolvingPayload &&
      Boolean(routeContentUri || sharedPayloads.length > 0) &&
      !supportedPayload)

  useEffect(() => {
    if (
      !storeReady ||
      resolvingPayload ||
      handlingRef.current ||
      !supportedPayload ||
      !contentUri ||
      !extension
    )
      return

    handlingRef.current = true
    const targetLibrary = myReaderLibraryForImport(
      libraries,
      activeLibraryId,
      requestedLibraryId,
    )

    void (async () => {
      try {
        const sourceFile = new File(contentUri)
        if (!targetLibrary) {
          if (routeContentUri) throw new Error("MYREADER_LIBRARY_REQUIRED")

          const pendingImport = await stageBookImport(
            sourceFile,
            extension,
            originalName,
          )
          router.replace({
            pathname: "/settings/add-library/location",
            params: {
              libraryAction: "create",
              pendingShareUri: pendingImport.uri,
              ...(pendingImport.originalName
                ? { pendingShareName: pendingImport.originalName }
                : {}),
            },
          })
          return
        }

        const result = await importBookFromFile(
          sourceFile,
          targetLibrary,
          originalName,
        )
        if (!result) throw new Error("UNSUPPORTED_BOOK_FORMAT")
        router.replace("/library" as Href)
      } catch {
        setImportFailed(true)
      } finally {
        clearSharedPayloads()
        if (routeContentUri) {
          deleteStagedBookImport(contentUri)
        } else {
          deleteResolvedShareFile(contentUri)
        }
      }
    })()
  }, [
    activeLibraryId,
    clearSharedPayloads,
    contentUri,
    extension,
    libraries,
    originalName,
    requestedLibraryId,
    resolvingPayload,
    routeContentUri,
    storeReady,
    supportedPayload,
  ])

  const failed = importFailed || invalidShare
  const handleOpenLibrary = () => {
    clearSharedPayloads()
    if (routeContentUri && contentUri) {
      deleteStagedBookImport(contentUri)
    } else {
      deleteResolvedShareFile(contentUri)
    }
    router.replace("/library" as Href)
  }

  return (
    <View
      className="flex-1"
      style={{ backgroundColor: palette.background }}
      testID="incoming-share-screen"
    >
      <EmptyState
        title={t(
          failed ? "incomingShare.failedTitle" : "incomingShare.importingTitle",
        )}
        detail={t(
          failed
            ? "incomingShare.failedDetail"
            : "incomingShare.importingDetail",
        )}
        icon={{ ios: "square.and.arrow.down", android: "move-to-inbox" }}
        action={
          failed ? (
            <Button
              onPress={handleOpenLibrary}
              title={t("incomingShare.openLibrary")}
            />
          ) : (
            <ActivityIndicator color={palette.primary} />
          )
        }
      />
    </View>
  )
}
