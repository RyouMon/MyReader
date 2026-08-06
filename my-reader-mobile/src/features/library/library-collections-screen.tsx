import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import type { BuiltInBookCollectionId } from "@my-reader/tools/types/book-collection"
import { libraryTypeOf } from "@my-reader/tools/types/library"
import { router, Stack } from "expo-router"
import { SymbolView } from "expo-symbols"
import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Platform } from "react-native"

import {
  EmptyState,
  ListRow,
  PrimaryButton,
  Screen,
  SectionCard,
  SectionLabel,
} from "@/src/components"
import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import { useThemePalette } from "@/src/design/tokens"
import {
  importBookFromPicker,
  switchActiveLibrary,
} from "@/src/domain/library/hooks/library-actions"
import { useBookReadingFormat } from "@/src/domain/library/hooks/use-book-reading-format"
import { useFavoriteBooks } from "@/src/domain/library/hooks/use-favorite-books"
import { useRecentlyReadBooks } from "@/src/domain/library/hooks/use-recently-read-books"
import { notifyLibraryRefresh } from "@/src/domain/notifications/download-notifications"
import { useSyncLibrary } from "@/src/domain/sync/hooks/use-sync-library"
import { isRemoteSourceType } from "@/src/domain/types"
import {
  type BookCollectionDefinition,
  getActiveStorageBookCollections,
  getActiveTransferBookCollections,
  PRIMARY_BOOK_COLLECTIONS,
} from "@/src/features/library/book-collection-definitions"
import { NoLibraryEmptyState } from "@/src/features/library/components/no-library-empty-state"
import { useLibraryCollectionsHeader } from "@/src/features/library/hooks/use-library-collections-header"
import {
  useBooks,
  usePendingBookImports,
} from "@/src/features/library/hooks/useLibraryQuery"
import { resolveLibraryScreenVariant } from "@/src/features/library/utils/resolve-library-screen-variant"
import { useLibraryBookMeta } from "@/src/hooks/use-library-book-meta"
import { useAppStore } from "@/src/store/app-store"
import { Text, View } from "@/tw"

function CollectionAccessory({ count }: { count: number }) {
  const { t } = useTranslation()
  const palette = useThemePalette()

  return (
    <View className="flex-row items-center gap-2">
      <Text
        selectable
        className="text-base"
        style={{ color: palette.textMuted, fontVariant: ["tabular-nums"] }}
      >
        {t("library.collections.bookCount", { count })}
      </Text>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Platform.OS === "ios" ? (
          <SymbolView
            name="chevron.right"
            size={15}
            weight="semibold"
            tintColor={palette.textMuted}
          />
        ) : (
          <MaterialIcons
            name="chevron-right"
            size={22}
            color={palette.textMuted}
          />
        )}
      </View>
    </View>
  )
}

function CollectionRows({
  collections,
  counts,
}: {
  collections: BookCollectionDefinition[]
  counts: Record<BuiltInBookCollectionId, number>
}) {
  const { t } = useTranslation()

  return collections.map((collection, index) => {
    const title = t(collection.titleKey)
    const count = counts[collection.id]
    return (
      <ListRow
        key={collection.id}
        testID={`library-collection-${collection.id}`}
        title={title}
        label={`${title}, ${t("library.collections.bookCount", { count })}`}
        icon={collection.icon}
        accessory={<CollectionAccessory count={count} />}
        isLast={index === collections.length - 1}
        onPress={() =>
          router.push({
            pathname: "/library/collection/[collectionId]",
            params: { collectionId: collection.id },
          })
        }
      />
    )
  })
}

export default function LibraryCollectionsScreen() {
  const { t } = useTranslation()
  const libraries = useAppStore((state) => state.libraries)
  const activeLibraryId = useAppStore((state) => state.activeLibraryId)
  const storeReady = useAppStore((state) => state.storeReady)
  const selectedLibrary = useMemo(
    () =>
      activeLibraryId
        ? (libraries.find((library) => library.id === activeLibraryId) ?? null)
        : null,
    [activeLibraryId, libraries],
  )
  const { data: books = [] } = useBooks(activeLibraryId)
  const { data: pendingBookImports = [] } =
    usePendingBookImports(activeLibraryId)
  const { selectedFormatById } = useBookReadingFormat(selectedLibrary)
  const { favoriteSet } = useFavoriteBooks(selectedLibrary, books)
  const recentlyReadBooks = useRecentlyReadBooks(selectedLibrary, books)
  const {
    bookActiveFormatsById,
    bookDownloadStatusById,
    bookLocalOnlyById,
    bookUploadStatusById,
  } = useLibraryBookMeta(selectedLibrary, books, selectedFormatById)
  const { syncNow } = useSyncLibrary()
  const variant = resolveLibraryScreenVariant({
    storeReady,
    effectiveLibraryId: activeLibraryId ?? undefined,
    hasSelectedLibrary: selectedLibrary !== null,
    librariesCount: libraries.length,
  })
  const isManagedLibrary =
    selectedLibrary !== null && libraryTypeOf(selectedLibrary) === "myreader"

  const counts = useMemo<Record<BuiltInBookCollectionId, number>>(
    () => ({
      all: books.length + pendingBookImports.length,
      recentlyRead: recentlyReadBooks.length,
      favorites: books.filter((book) => favoriteSet.has(book.id)).length,
      downloaded: books.filter(
        (book) => bookDownloadStatusById[book.id] === "downloaded",
      ).length,
      downloading: books.filter((book) => bookActiveFormatsById.has(book.id))
        .length,
      uploading: books.filter((book) => bookUploadStatusById[book.id]).length,
      localOnly: books.filter((book) => bookLocalOnlyById[book.id]).length,
    }),
    [
      bookActiveFormatsById,
      bookDownloadStatusById,
      bookLocalOnlyById,
      bookUploadStatusById,
      books,
      favoriteSet,
      pendingBookImports.length,
      recentlyReadBooks.length,
    ],
  )
  const activeTransferCollections = useMemo(
    () => getActiveTransferBookCollections(counts),
    [counts],
  )
  const activeStorageCollections = useMemo(
    () => getActiveStorageBookCollections(counts),
    [counts],
  )
  const showStorageCollections =
    isManagedLibrary &&
    isRemoteSourceType(selectedLibrary?.sourceType) &&
    activeStorageCollections.length > 0

  const applyLibrarySelection = useCallback(
    (nextLibraryId: string) => {
      if (nextLibraryId === activeLibraryId) return
      void switchActiveLibrary(nextLibraryId)
    },
    [activeLibraryId],
  )
  const openLibrarySwitchMenu = useCallback(() => {
    showAlertWithStatusBarRestore(
      t("library.switchLibrary"),
      t("library.switchLibraryAlert.message", {
        name:
          selectedLibrary?.name ?? t("library.switchLibraryAlert.unselected"),
      }),
      [
        ...libraries.map((library) => ({
          text: `${activeLibraryId === library.id ? "✓ " : ""}${library.name}`,
          onPress: () => applyLibrarySelection(library.id),
        })),
        { text: t("library.switchLibraryAlert.close"), style: "cancel" },
      ],
    )
  }, [activeLibraryId, applyLibrarySelection, libraries, selectedLibrary, t])
  const handleSyncCurrentLibrary = useCallback(() => {
    if (!selectedLibrary) return
    void (async () => {
      try {
        await syncNow(selectedLibrary.id)
        notifyLibraryRefresh("done")
      } catch (error) {
        console.error("[library-collections] sync library failed:", error)
        notifyLibraryRefresh(
          "error",
          error instanceof Error ? error.message : undefined,
        )
      }
    })()
  }, [selectedLibrary, syncNow])
  const handleImportBook = useCallback(() => {
    void importBookFromPicker(isManagedLibrary ? selectedLibrary : null).catch(
      (error) => {
        showAlertWithStatusBarRestore(
          t("library.importFailed.title"),
          error instanceof Error ? error.message : String(error),
        )
      },
    )
  }, [isManagedLibrary, selectedLibrary, t])
  const { options, toolbar } = useLibraryCollectionsHeader({
    selectedLibraryName: selectedLibrary?.name,
    hasSelectedLibrary: selectedLibrary !== null,
    canImportBook: isManagedLibrary,
    onImportBook: handleImportBook,
    onSyncCurrentLibrary: handleSyncCurrentLibrary,
  })
  const header = (
    <>
      <Stack.Screen options={options} />
      {toolbar}
    </>
  )

  if (variant === "loading") {
    return (
      <>
        {header}
        <Screen>
          <EmptyState
            title={t("library.loading.title")}
            detail={t("library.loading.detail")}
            icon={{ ios: "hourglass", android: "hourglass-empty" }}
          />
        </Screen>
      </>
    )
  }

  if (variant === "invalid") {
    return (
      <>
        {header}
        <Screen>
          <EmptyState
            title={t("library.notFound.title")}
            detail={t("library.notFound.detail")}
            icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }}
          />
        </Screen>
      </>
    )
  }

  if (variant === "empty") {
    return (
      <>
        {header}
        <Screen>
          <NoLibraryEmptyState />
        </Screen>
      </>
    )
  }

  if (variant === "unselected") {
    return (
      <>
        {header}
        <Screen>
          <EmptyState
            title={t("library.unselected.title")}
            detail={t("library.unselected.detail")}
            action={
              <PrimaryButton
                title={t("library.switchLibrary")}
                onPress={openLibrarySwitchMenu}
              />
            }
            icon={{ ios: "list.bullet.rectangle", android: "list" }}
          />
        </Screen>
      </>
    )
  }

  return (
    <>
      {header}
      <Screen>
        <SectionCard>
          <CollectionRows
            collections={PRIMARY_BOOK_COLLECTIONS}
            counts={counts}
          />
        </SectionCard>
        {activeTransferCollections.length > 0 ? (
          <View className="gap-3">
            <SectionLabel>
              {t("library.collections.transferSection")}
            </SectionLabel>
            <SectionCard>
              <CollectionRows
                collections={activeTransferCollections}
                counts={counts}
              />
            </SectionCard>
          </View>
        ) : null}
        {showStorageCollections ? (
          <View className="gap-3">
            <SectionLabel>
              {t("library.collections.storageSection")}
            </SectionLabel>
            <SectionCard>
              <CollectionRows
                collections={activeStorageCollections}
                counts={counts}
              />
            </SectionCard>
          </View>
        ) : null}
      </Screen>
    </>
  )
}
