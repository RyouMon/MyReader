import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";

import { MenuView, type MenuAction } from "@react-native-menu/menu";

import { androidRippleColor, pressedBackgroundColor } from "@/src/design/press-feedback";
import { useTheme, useThemePalette } from "@/src/design/tokens";
import { TEXT_SIZE } from "@/src/design/typography";
import { Image, Pressable, Text, View } from "@/tw";

import {
  EmptyState,
  HeroCard,
  PrimaryButton,
  ProgressBar,
  Screen,
  SectionHeading,
} from "@/src/components";
import { MoreActionsIcon } from "@/src/components/ui/more-actions-icon";
import { useBookReadingFormat } from "@/src/domain/library/hooks/use-book-reading-format";
import { isRemoteSourceType } from "@/src/domain/types";
import { ReadingShelf } from "@/src/features/home/components";
import { useBookReadingProgress } from "@/src/features/library/hooks/use-book-reading-progress";
import { useBookActions } from "@/src/features/library/hooks/useBookActions";
import { useBooks } from "@/src/features/library/hooks/useLibraryQuery";
import { buildBookMenuActions } from "@/src/features/library/utils/book-menu";
import { useLibraryBookMeta } from "@/src/hooks/use-library-book-meta";
import { useAppStore } from "@/src/store/app-store";

import { BookDownloadStatusIndicator } from "@/src/components/book-download-status-indicator";
import type { BookItem } from "@/src/domain/types";
import type { BookDownloadStatus } from "@/src/features/library/components/books/book-cover";
import { useRecentlyReadBooks } from "./hooks/use-recently-read-books";

export default function HomeScreen() {
  const palette = useThemePalette();
  const { colorScheme } = useTheme();
  const resolvedScheme = colorScheme === "dark" ? "dark" : "light";
  const { t } = useTranslation();
  const libraries = useAppStore((s) => s.libraries);
  const activeLibraryId = useAppStore((s) => s.activeLibraryId);
  const { data: books = [] } = useBooks(activeLibraryId);
  const activeLibrary = useMemo(
    () => libraries.find((library) => library.id === activeLibraryId) ?? null,
    [activeLibraryId, libraries],
  );

  const readingBooks = useRecentlyReadBooks(activeLibrary, books);
  const { data: progressByBookId = {} } = useBookReadingProgress(activeLibrary);

  const { selectedFormatById, setBookReadingFormat } = useBookReadingFormat(activeLibrary, books);
  const { bookFormatsById, bookFormatMetaById, fileStateBundle, bookDownloadStatusById } =
    useLibraryBookMeta(activeLibrary, books, selectedFormatById);

  const readingBooksWithMeta = useMemo(() => {
    return readingBooks.map((book) => {
      const effectiveFormat = bookFormatMetaById.get(book.id)?.effectiveFormat;
      const readingProgress = effectiveFormat ? (progressByBookId[book.id]?.[effectiveFormat] ?? 0) : 0;
      return { ...book, readingProgress, readingFormat: effectiveFormat ?? "" };
    });
  }, [readingBooks, bookFormatMetaById, progressByBookId]);

  const currentBook = readingBooksWithMeta[0];
  const continueProgress = currentBook?.readingProgress ?? 0;

  const [openMenuBookId, setOpenMenuBookId] = useState<string | null>(null);

  const isRemote = isRemoteSourceType(activeLibrary?.sourceType);
  const isMenuOpen = openMenuBookId !== null;

  const { handleBookMenuAction, handleBookPress } = useBookActions(
    books,
    bookDownloadStatusById,
    bookFormatMetaById,
    fileStateBundle,
    openMenuBookId,
    selectedFormatById,
    activeLibrary,
    setBookReadingFormat,
  );

  const handleSelectBook = useCallback(
    (book: BookItem & { readingProgress: number; readingFormat: string }) => {
      handleBookPress(book.id);
    },
    [handleBookPress],
  );

  const handleMenuOpen = useCallback((bookId: string) => {
    setOpenMenuBookId(bookId);
  }, []);

  const handleMenuClose = useCallback(() => {
    setOpenMenuBookId(null);
  }, []);

  const currentBookStatus = (bookDownloadStatusById[currentBook?.id ?? ""] ?? "notDownloaded") as BookDownloadStatus;
  const currentBookMenuActions = useMemo<MenuAction[]>(() => {
    if (!currentBook) return [];
    return buildBookMenuActions(currentBookStatus, {
      isRemote,
      formats: bookFormatsById[currentBook.id],
      selectedFormat: selectedFormatById[currentBook.id],
    });
  }, [currentBook, currentBookStatus, isRemote, bookFormatsById, selectedFormatById]);

  const handleCurrentBookMenuAction = useCallback(
    ({ nativeEvent }: { nativeEvent: { event: string } }) => {
      if (!currentBook) return;
      handleBookMenuAction(currentBook.id, nativeEvent.event);
    },
    [currentBook, handleBookMenuAction],
  );

  const handleCurrentBookPress = useCallback(() => {
    if (isMenuOpen || !currentBook) return;
    handleBookPress(currentBook.id);
  }, [currentBook, handleBookPress, isMenuOpen]);

  const menuTrigger = (
    <View
      accessibilityRole="button"
      accessibilityLabel={t("bookDetail.moreActions", { title: currentBook?.title ?? "" })}
      className="h-8 w-8 items-center justify-center"
    >
      <MoreActionsIcon size={TEXT_SIZE.base} color={palette.textMuted} />
    </View>
  );

  const currentBookCardContent = (
    <View className="flex-row items-start gap-3 p-3">
      {currentBook!.coverUri ? (
        <Image
          source={currentBook!.coverUri}
          className="h-[168px] w-[112px] rounded-[18px]"
          cachePolicy="memory-disk"
          recyclingKey={currentBook!.id}
        />
      ) : (
        <View
          className="h-[168px] w-[112px] items-center justify-center rounded-[18px]"
          style={{ backgroundColor: palette.background }}
        >
          <Text
            className="text-sm"
            style={{ color: palette.textMuted, fontWeight: "600" }}
          >
            {t("home.noCover")}
          </Text>
        </View>
      )}
      <View className="min-w-0 flex-1 justify-center gap-2" style={{ height: 168 }}>
        <Text
          className="text-xl font-bold"
          style={{ color: palette.text }}
          numberOfLines={2}
        >
          {currentBook!.title}
        </Text>
        <Text className="text-base font-semibold" style={{ color: palette.textMuted }}>
          {currentBook!.author}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <Text
            className="text-sm font-semibold"
            style={{ color: palette.textMuted, fontVariant: ["tabular-nums"] }}
          >
            {Math.round(continueProgress)}%
          </Text>
          <BookDownloadStatusIndicator
            status={bookDownloadStatusById[currentBook!.id]}
            libraryId={activeLibrary?.id}
            bookId={currentBook!.id}
            format={currentBook!.readingFormat}
          />
        </View>
        <ProgressBar progress={continueProgress / 100} />
      </View>
      {currentBookMenuActions.length > 0 ? <View className="w-8" /> : null}
    </View>
  );

  return (
    <Screen>
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
              <SectionHeading title={t("home.continueReading")} />
              <HeroCard>
                <View className="relative">
                  {currentBookMenuActions.length > 0 ? (
                    <View className="absolute right-3 top-3 z-10" onStartShouldSetResponder={() => true}>
                      <MenuView
                        actions={currentBookMenuActions}
                        isAnchoredToRight={Platform.OS === "android"}
                        onOpenMenu={() => handleMenuOpen(currentBook.id)}
                        onCloseMenu={handleMenuClose}
                        onPressAction={handleCurrentBookMenuAction}
                      >
                        {menuTrigger}
                      </MenuView>
                    </View>
                  ) : null}

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("bookDetail.openBook", { title: currentBook.title })}
                    onPress={handleCurrentBookPress}
                    android_ripple={{ color: androidRippleColor(resolvedScheme, palette), foreground: true }}
                    style={({ pressed }) => ({
                      borderRadius: 28,
                      overflow: "hidden",
                      backgroundColor: Platform.OS === "ios" && pressed ? pressedBackgroundColor(resolvedScheme, palette) : undefined,
                    })}
                  >
                    {currentBookCardContent}
                  </Pressable>
                </View>
              </HeroCard>
            </View>

            <View className="gap-3">
              <SectionHeading title={t("home.recentReading")} />
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
              />
            </View>
          </>
        ) : (
          <EmptyState
            title={t("home.noBooks.title")}
            detail={t("home.noBooks.detail")}
            icon={{ ios: "book", android: "book" }}
          />
        )}
      </View>
    </Screen>
  );
}
