import { FlatList, useWindowDimensions } from "react-native"

import type { BookItem } from "@/src/domain/types"
import type {
  BookDownloadStatus,
  BookTransferStatus,
} from "@/src/features/library/components/books/book-cover"
import type { HomeCardStyle } from "@/src/store/app-store.types"
import { ReadingListCard } from "./reading-list-card"

function getCardWidth(screenWidth: number): number {
  if (screenWidth <= 480) return Math.round(screenWidth * 0.62)
  if (screenWidth <= 768) return Math.round(screenWidth * 0.45)
  return Math.round(screenWidth * 0.32)
}

export type ReadingShelfProps = {
  data: (BookItem & { readingProgress: number; readingFormat: string })[]
  onSelectBook?: (
    book: BookItem & { readingProgress: number; readingFormat: string },
  ) => void
  downloadStatusById?: Record<string, BookDownloadStatus>
  transferStatusById?: Record<string, BookTransferStatus>
  libraryId?: string
  bookFormatsById?: Record<string, string[]>
  bookCanUploadById?: Record<string, boolean>
  bookCanDeleteDownloadById?: Record<string, boolean>
  selectedFormatById?: Record<string, string>
  menuIsManaged?: boolean
  menuIsRemote?: boolean
  onMenuAction?: (bookId: string, actionId: string) => void
  onMenuOpen?: (bookId: string) => void
  onMenuClose?: () => void
  isAnyMenuOpen?: boolean
  homeCardStyle?: HomeCardStyle
  favoriteBookIds?: Set<string>
  thumbnailScopeKey?: string
}

export function ReadingShelf({
  data,
  onSelectBook,
  downloadStatusById,
  transferStatusById,
  libraryId,
  bookFormatsById,
  bookCanUploadById,
  bookCanDeleteDownloadById,
  selectedFormatById,
  menuIsManaged,
  menuIsRemote,
  onMenuAction,
  onMenuOpen,
  onMenuClose,
  isAnyMenuOpen,
  homeCardStyle,
  favoriteBookIds,
  thumbnailScopeKey,
}: ReadingShelfProps) {
  const { width } = useWindowDimensions()
  const cardWidth = getCardWidth(width)

  return (
    <FlatList
      horizontal
      data={data}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        gap: 12,
        paddingHorizontal: 4,
        paddingVertical: 8,
      }}
      renderItem={({ item }) => (
        <ReadingListCard
          book={item}
          width={cardWidth}
          progress={item.readingProgress}
          downloadStatus={downloadStatusById?.[item.id]}
          transferStatus={transferStatusById?.[item.id]}
          libraryId={libraryId}
          menuIsManaged={menuIsManaged}
          menuIsRemote={menuIsRemote}
          menuCanUpload={bookCanUploadById?.[item.id]}
          menuCanDeleteDownload={bookCanDeleteDownloadById?.[item.id]}
          menuFormats={bookFormatsById?.[item.id]}
          menuSelectedFormat={selectedFormatById?.[item.id]}
          isFavorite={favoriteBookIds?.has(item.id)}
          onPress={onSelectBook ? () => onSelectBook(item) : undefined}
          onMenuAction={onMenuAction}
          onMenuOpen={onMenuOpen}
          onMenuClose={onMenuClose}
          isAnyMenuOpen={isAnyMenuOpen}
          homeCardStyle={homeCardStyle}
          thumbnailScopeKey={thumbnailScopeKey}
        />
      )}
    />
  )
}
