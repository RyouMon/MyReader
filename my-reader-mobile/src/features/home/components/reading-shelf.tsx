import { FlatList, useWindowDimensions } from "react-native";

import type { BookItem } from "@/src/domain/types";
import type { BookDownloadStatus } from "@/src/features/library/components/books/book-cover";
import { ReadingListCard } from "./reading-list-card";

function getCardWidth(screenWidth: number): number {
  if (screenWidth <= 480) return Math.round(screenWidth * 0.62);
  if (screenWidth <= 768) return Math.round(screenWidth * 0.45);
  return Math.round(screenWidth * 0.32);
}

export type ReadingShelfProps = {
  data: (BookItem & { readingProgress: number; readingFormat: string })[];
  onSelectBook?: (book: BookItem & { readingProgress: number; readingFormat: string }) => void;
  downloadStatusById?: Record<string, BookDownloadStatus>;
  libraryId?: string;
  bookFormatsById?: Record<string, string[]>;
  selectedFormatById?: Record<string, string>;
  menuIsRemote?: boolean;
  onMenuAction?: (bookId: string, actionId: string) => void;
  onMenuOpen?: (bookId: string) => void;
  onMenuClose?: () => void;
  isAnyMenuOpen?: boolean;
};

export function ReadingShelf({
  data,
  onSelectBook,
  downloadStatusById,
  libraryId,
  bookFormatsById,
  selectedFormatById,
  menuIsRemote,
  onMenuAction,
  onMenuOpen,
  onMenuClose,
  isAnyMenuOpen,
}: ReadingShelfProps) {
  const { width } = useWindowDimensions();
  const cardWidth = getCardWidth(width);

  return (
    <FlatList
      horizontal
      data={data}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12, paddingHorizontal: 4, paddingVertical: 8 }}
      renderItem={({ item }) => (
        <ReadingListCard
          book={item}
          width={cardWidth}
          progress={item.readingProgress}
          downloadStatus={downloadStatusById?.[item.id]}
          libraryId={libraryId}
          menuIsRemote={menuIsRemote}
          menuFormats={bookFormatsById?.[item.id]}
          menuSelectedFormat={selectedFormatById?.[item.id]}
          onPress={onSelectBook ? () => onSelectBook(item) : undefined}
          onMenuAction={onMenuAction}
          onMenuOpen={onMenuOpen}
          onMenuClose={onMenuClose}
          isAnyMenuOpen={isAnyMenuOpen}
        />
      )}
    />
  );
}
