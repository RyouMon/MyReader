import { router } from "expo-router"
import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import type { MenuAction } from "@react-native-menu/menu"

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
import { useBookActions } from "@/src/features/library/hooks/use-book-actions"
import { useBookReadingProgress } from "@/src/domain/library/hooks/use-book-reading-progress"
import { useBooks } from "@/src/features/library/hooks/useLibraryQuery"
import { buildBookMenuActions } from "@/src/features/library/utils/book-menu"
import { useLibraryBookMeta } from "@/src/hooks/use-library-book-meta"
import { useAppStore } from "@/src/store/app-store"

import type { BookItem } from "@/src/domain/types"
import type { BookDownloadStatus } from "@/src/features/library/components/books/book-cover"
import { useRecentlyReadBooks } from "./hooks/use-recently-read-books"

export default function HomeScreen() {
  const { t } = useTranslation()
  const libraries = useAppStore((s) => s.libraries)
  const activeLibraryId = useAppStore((s) => s.activeLibraryId)
  const homeCardStyle = useAppStore((s) => s.settings.homeCardStyle)
  const { data: books = [] } = useBooks(activeLibraryId)
  const activeLibrary = useMemo(
    () => libraries.find((library) => library.id === activeLibraryId) ?? null,
    [activeLibraryId, libraries],
  )

  const readingBooks = useRecentlyReadBooks(activeLibrary)
  const { data: progressByBookId = {} } = useBookReadingProgress(activeLibrary)

  const { selectedFormatById, setBookReadingFormat } =
    useBookReadingFormat(activeLibrary)
  const { favoriteSet, toggleFavorite } = useFavoriteBooks(activeLibrary, books)
  const {
    bookFormatsById,
    bookFormatMetaById,
    fileStateBundle,
    bookDownloadStatusById,
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

  const currentBook = readingBooksWithMeta[0]

  const [openMenuBookId, setOpenMenuBookId] = useState<string | null>(null)
  const [isInspectingReadingDay, setIsInspectingReadingDay] = useState(false)

  const isRemote = isRemoteSourceType(activeLibrary?.sourceType)
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
  const currentBookMenuActions = useMemo<MenuAction[]>(() => {
    if (!currentBook) return []
    return buildBookMenuActions(currentBookStatus, {
      isRemote,
      isFavorite: favoriteSet.has(currentBook.id),
      formats: bookFormatsById[currentBook.id],
      selectedFormat: selectedFormatById[currentBook.id],
    })
  }, [
    currentBook,
    currentBookStatus,
    isRemote,
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
          <EmptyState
            title={t("home.noLibrary.title")}
            detail={t("home.noLibrary.detail")}
            action={
              <PrimaryButton
                title={t("library.addLibrary")}
                onPress={() => router.push("/settings/add-library")}
              />
            }
            icon={{ ios: "books.vertical.fill", android: "library-books" }}
          />
        ) : currentBook ? (
          <>
            <View className="gap-3">
              <SectionLabel>{t("home.continueReading")}</SectionLabel>
              <ContinueReadingCard
                book={currentBook}
                downloadStatus={currentBookStatus}
                libraryId={activeLibrary?.id}
                menuActions={currentBookMenuActions}
                homeCardStyle={homeCardStyle}
                isAnyMenuOpen={isMenuOpen}
                onPress={() => handleBookPress(currentBook.id)}
                onMenuAction={handleCurrentBookMenuAction}
                onMenuOpen={() => handleMenuOpen(currentBook.id)}
                onMenuClose={handleMenuClose}
              />
            </View>

            <View className="gap-3">
              <SectionLabel>{t("home.recentReading")}</SectionLabel>
              <ReadingShelf
                data={readingBooksWithMeta.slice(1)}
                onSelectBook={handleSelectBook}
                downloadStatusById={bookDownloadStatusById}
                libraryId={activeLibrary?.id}
                bookFormatsById={bookFormatsById}
                selectedFormatById={selectedFormatById}
                menuIsRemote={isRemote}
                onMenuAction={handleBookMenuAction}
                onMenuOpen={handleMenuOpen}
                onMenuClose={handleMenuClose}
                isAnyMenuOpen={isMenuOpen}
                homeCardStyle={homeCardStyle}
                favoriteBookIds={favoriteSet}
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
