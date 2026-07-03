import { useCallback, useMemo } from "react"
import { FlatList } from "react-native"
import { useTranslation } from "react-i18next"

import { coverLoadingSkeletonColor } from "@/src/design/cover-skeleton"
import { useThemePalette } from "@/src/design/tokens"
import type { BookItem } from "@/src/domain/types"
import { useAppStore } from "@/src/store/app-store"

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
  const coverLoadingSkeletonPulseEnabled = useAppStore(
    (s) => s.settings.coverLoadingSkeletonPulseEnabled,
  )
  const bookById = useMemo(
    () => new Map(data.map((book) => [book.id, book])),
    [data],
  )
  const chrome = useMemo<BookCardChrome>(
    () => ({
      coverBackgroundColor: palette.backgroundSecondary,
      coverShadowColor: palette.text,
      coverSkeletonColor: coverLoadingSkeletonColor(palette),
      coverLoadingSkeletonPulseEnabled,
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
      textColor: palette.text,
      textMutedColor: palette.textMuted,
    }),
    [
      coverLoadingSkeletonPulseEnabled,
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
