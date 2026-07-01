import { useCallback, useMemo } from "react"
import { FlatList } from "react-native"
import { useTranslation } from "react-i18next"

import { useThemePalette } from "@/src/design/tokens"
import type { BookItem } from "@/src/domain/types"

import { BookCard, type BookCardChrome } from "./book-card"

export function HorizontalBookShelf({
  data,
  onSelectBook,
}: {
  data: BookItem[]
  onSelectBook?: (book: BookItem) => void
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const bookById = useMemo(
    () => new Map(data.map((book) => [book.id, book])),
    [data],
  )
  const chrome = useMemo<BookCardChrome>(
    () => ({
      coverBackgroundColor: palette.backgroundSecondary,
      coverShadowColor: palette.text,
      progressColors: {
        primary: palette.primary,
        success: palette.success,
        successSoft: palette.successSoft,
        surface: palette.surface,
        textMuted: palette.textMuted,
      },
      progressLabels: {
        finished: t("bookRow.finished"),
        unread: t("bookRow.unread"),
      },
      surfaceColor: palette.surface,
      textColor: palette.text,
      textMutedColor: palette.textMuted,
    }),
    [
      palette.backgroundSecondary,
      palette.primary,
      palette.success,
      palette.successSoft,
      palette.surface,
      palette.text,
      palette.textMuted,
      t,
    ],
  )
  const handleBookPress = useCallback(
    (bookId: string) => {
      const book = bookById.get(bookId)
      if (book) {
        onSelectBook?.(book)
      }
    },
    [bookById, onSelectBook],
  )

  return (
    <FlatList
      horizontal
      data={data}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        gap: 12,
        paddingHorizontal: 4,
        alignItems: "flex-start",
      }}
      renderItem={({ item }) => (
        <BookCard
          book={item}
          width={156}
          onPress={onSelectBook ? handleBookPress : undefined}
          chrome={chrome}
          moreActionsLabel={t("bookDetail.moreActions", {
            title: item.title,
          })}
          openBookLabel={t("bookDetail.openBook", { title: item.title })}
        />
      )}
    />
  )
}
