import { router } from "expo-router"
import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Dimensions, PixelRatio, useWindowDimensions } from "react-native"

import type { MenuAction } from "@react-native-menu/menu"
import { libraryTypeOf } from "@my-reader/tools/types/library"

import { View } from "@/tw"

import {
  EmptyState,
  PrimaryButton,
  Screen,
  SectionLabel,
} from "@/src/components"
import { useBookReadingFormat } from "@/src/domain/library/hooks/use-book-reading-format"
import { useFavoriteBooks } from "@/src/domain/library/hooks/use-favorite-books"
import { isRemoteSourceType } from "@/src/domain/types"
import {
  ContinueReadingCard,
  ReadingShelf,
  ReadingStatisticsCard,
} from "@/src/features/home/components"
import { NoLibraryEmptyState } from "@/src/features/library/components/no-library-empty-state"
import { useBookActions } from "@/src/features/library/hooks/use-book-actions"
import { useCoverThumbnails } from "@/src/features/library/hooks/use-cover-thumbnails"
import { useBookReadingProgress } from "@/src/domain/library/hooks/use-book-reading-progress"
import { useRecentlyReadBooks } from "@/src/domain/library/hooks/use-recently-read-books"
import { useBooks } from "@/src/features/library/hooks/useLibraryQuery"
import { buildBookMenuActions } from "@/src/features/library/utils/book-menu"
import { resolveFullscreenGridCoverThumbnailSizes } from "@/src/features/library/utils/cover-thumbnail-profiles"
import { useLibraryBookMeta } from "@/src/hooks/use-library-book-meta"
import { useAppStore } from "@/src/store/app-store"

import type { BookItem } from "@/src/domain/types"
import type { BookDownloadStatus } from "@/src/features/library/components/books/book-cover"

export default function HomeScreen() {
  const { t } = useTranslation()
  const { height, width } = useWindowDimensions()
  const screenBounds = Dimensions.get("screen")
  const pixelRatio = PixelRatio.get()
  const coverThumbnailGridSizes = useMemo(
    () =>
      resolveFullscreenGridCoverThumbnailSizes({
        pixelRatio,
        screenHeight: Math.max(screenBounds.height, height),
        screenWidth: Math.max(screenBounds.width, width),
      }),
    [height, pixelRatio, screenBounds.height, screenBounds.width, width],
  )
  const libraries = useAppStore((s) => s.libraries)
  const activeLibraryId = useAppStore((s) => s.activeLibraryId)
  const homeCardStyle = useAppStore((s) => s.settings.homeCardStyle)
  const { data: books = [] } = useBooks(activeLibraryId)
  const activeLibrary = useMemo(
    () => libraries.find((library) => library.id === activeLibraryId) ?? null,
    [activeLibraryId, libraries],
  )

  const readingBooks = useRecentlyReadBooks(activeLibrary, books)
  const { data: progressByBookId = {} } = useBookReadingProgress(activeLibrary)

  const { selectedFormatById, setBookReadingFormat } =
    useBookReadingFormat(activeLibrary)
  const { favoriteSet, toggleFavorite } = useFavoriteBooks(activeLibrary, books)
  const {
    bookFormatsById,
    bookFormatMetaById,
    fileStateBundle,
    bookCanUploadById = {},
    bookCanDeleteDownloadById = {},
    bookDownloadStatusById,
    bookTransferStatusById,
  } = useLibraryBookMeta(activeLibrary, books, selectedFormatById)

  const readingBooksWithMeta = useMemo(() => {
    return readingBooks.map((book) => {
      const effectiveFormat = bookFormatMetaById.get(book.id)?.effectiveFormat
      const readingProgress = effectiveFormat
        ? (progressByBookId[book.id]?.[effectiveFormat] ?? 0)
        : 0
      return { ...book, readingProgress, readingFormat: effectiveFormat ?? "" }
    })
  }, [readingBooks, bookFormatMetaById, progressByBookId])
  const coverThumbnailScopeKey = useCoverThumbnails({
    enabled: !!activeLibrary,
    generateMissing: false,
    library: activeLibrary,
    books: readingBooksWithMeta,
    thumbnailSizes: coverThumbnailGridSizes,
    width: 112,
    height: 168,
  })

  const currentBook = readingBooksWithMeta[0]

  const [openMenuBookId, setOpenMenuBookId] = useState<string | null>(null)
  const [isInspectingReadingDay, setIsInspectingReadingDay] = useState(false)

  const isRemote = isRemoteSourceType(activeLibrary?.sourceType)
  const isManaged =
    activeLibrary !== null && libraryTypeOf(activeLibrary) === "myreader"
  const isMenuOpen = openMenuBookId !== null

  const { handleBookMenuAction, handleBookPress } = useBookActions(
    books,
    bookDownloadStatusById,
    bookFormatMetaById,
    fileStateBundle,
    openMenuBookId,
    selectedFormatById,
    activeLibrary,
    setBookReadingFormat,
    toggleFavorite,
  )

  const handleSelectBook = useCallback(
    (book: BookItem & { readingProgress: number; readingFormat: string }) => {
      handleBookPress(book.id)
    },
    [handleBookPress],
  )

  const handleMenuOpen = useCallback((bookId: string) => {
    setOpenMenuBookId(bookId)
  }, [])

  const handleMenuClose = useCallback(() => {
    setOpenMenuBookId(null)
  }, [])

  const currentBookStatus = (bookDownloadStatusById[currentBook?.id ?? ""] ??
    "notDownloaded") as BookDownloadStatus
  const currentBookTransferStatus =
    bookTransferStatusById[currentBook?.id ?? ""] ?? currentBookStatus
  const currentBookMenuActions = useMemo<MenuAction[]>(() => {
    if (!currentBook) return []
    return buildBookMenuActions(currentBookStatus, {
      isManaged,
      isRemote,
      canUpload: bookCanUploadById[currentBook.id],
      canDeleteDownload: bookCanDeleteDownloadById[currentBook.id],
      isFavorite: favoriteSet.has(currentBook.id),
      formats: bookFormatsById[currentBook.id],
      selectedFormat: selectedFormatById[currentBook.id],
    })
  }, [
    currentBook,
    currentBookStatus,
    isManaged,
    isRemote,
    bookCanUploadById,
    bookCanDeleteDownloadById,
    bookFormatsById,
    selectedFormatById,
    favoriteSet,
  ])

  const handleCurrentBookMenuAction = useCallback(
    (actionId: string) => {
      if (!currentBook) return
      handleBookMenuAction(currentBook.id, actionId)
    },
    [currentBook, handleBookMenuAction],
  )

  return (
    <Screen scrollEnabled={!isInspectingReadingDay}>
      <View testID="home-screen" className="flex-1 gap-5">
        {!activeLibrary ? (
          <NoLibraryEmptyState />
        ) : currentBook ? (
          <>
            <View className="gap-3">
              <SectionLabel>{t("home.continueReading")}</SectionLabel>
              <ContinueReadingCard
                book={currentBook}
                downloadStatus={currentBookStatus}
                transferStatus={currentBookTransferStatus}
                libraryId={activeLibrary?.id}
                menuActions={currentBookMenuActions}
                homeCardStyle={homeCardStyle}
                isAnyMenuOpen={isMenuOpen}
                onPress={() => handleBookPress(currentBook.id)}
                onMenuAction={handleCurrentBookMenuAction}
                onMenuOpen={() => handleMenuOpen(currentBook.id)}
                onMenuClose={handleMenuClose}
                thumbnailScopeKey={coverThumbnailScopeKey}
              />
            </View>

            <View className="gap-3">
              <SectionLabel>{t("home.recentReading")}</SectionLabel>
              <ReadingShelf
                data={readingBooksWithMeta.slice(1)}
                onSelectBook={handleSelectBook}
                downloadStatusById={bookDownloadStatusById}
                transferStatusById={bookTransferStatusById}
                libraryId={activeLibrary?.id}
                bookFormatsById={bookFormatsById}
                bookCanUploadById={bookCanUploadById}
                bookCanDeleteDownloadById={bookCanDeleteDownloadById}
                selectedFormatById={selectedFormatById}
                menuIsManaged={isManaged}
                menuIsRemote={isRemote}
                onMenuAction={handleBookMenuAction}
                onMenuOpen={handleMenuOpen}
                onMenuClose={handleMenuClose}
                isAnyMenuOpen={isMenuOpen}
                homeCardStyle={homeCardStyle}
                favoriteBookIds={favoriteSet}
                thumbnailScopeKey={coverThumbnailScopeKey}
              />
            </View>

            <View className="gap-3">
              <SectionLabel>{t("home.readingStats.title")}</SectionLabel>
              <ReadingStatisticsCard
                library={activeLibrary}
                onInspectingChange={setIsInspectingReadingDay}
              />
            </View>
          </>
        ) : (
          <EmptyState
            title={t("home.noReadingHistory.title")}
            detail={t("home.noReadingHistory.detail")}
            action={
              <PrimaryButton
                title={t("home.noReadingHistory.action")}
                onPress={() => router.push("/library")}
              />
            }
            icon={{ ios: "book", android: "book" }}
          />
        )}
      </View>
    </Screen>
  )
}
