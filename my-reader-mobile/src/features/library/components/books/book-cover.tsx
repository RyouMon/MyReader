import { memo, useEffect, useState } from "react"

import { useThemePalette } from "@/src/design/tokens"
import type { BookItem } from "@/src/domain/types"
import { primeReaderCoverCache } from "@/src/features/reader/reader-open-transition"
import { Image, Text, View } from "@/tw"

export type BookDownloadStatus = "downloaded" | "notDownloaded" | "downloading"

export type BookProgressSnapshot = {
  percent?: number
  statusLabel?: string
}

/**
 * Returns a stable fallback color for books without cover art.
 */
export function getFallbackCoverColor(title: string) {
  let hash = 0
  for (let index = 0; index < title.length; index += 1) {
    hash = ((hash << 5) - hash + title.charCodeAt(index)) | 0
  }
  const colors = [
    "#4A3728",
    "#1A3A4A",
    "#5C4200",
    "#1E3A2A",
    "#4A2838",
    "#2D2F4A",
  ]
  return colors[Math.abs(hash) % colors.length]
}

type BookCoverProps = {
  book: BookItem
  width: number
  height: number
  borderRadius?: number
  showTitle?: boolean
}

function BookCoverImpl({
  book,
  width,
  height,
  borderRadius = 10,
  showTitle = true,
}: BookCoverProps) {
  const palette = useThemePalette()
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    setImageError(false)
    primeReaderCoverCache(book.coverUri)
  }, [book.coverUri])

  const hasCover = !!book.coverUri && !imageError

  return (
    <View
      className="overflow-hidden"
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: hasCover
          ? palette.backgroundSecondary
          : getFallbackCoverColor(book.title),
        shadowColor: palette.text,
        shadowOpacity: 0.18,
        shadowRadius: 8,
        shadowOffset: { width: 1, height: 3 },
        elevation: 3,
      }}
    >
      {hasCover ? (
        <Image
          source={book.coverUri}
          style={{ width, height }}
          recyclingKey={book.id}
          cachePolicy="memory-disk"
          transition={200}
          onError={() => setImageError(true)}
        />
      ) : (
        <View className="h-full w-full justify-end px-2 py-3">
          {showTitle ? (
            <Text
              className="text-center text-base font-semibold"
              style={{ color: palette.textOnPrimary }}
              numberOfLines={3}
              allowFontScaling={false}
            >
              {book.title}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  )
}

/**
 * Renders a compact mobile book cover with fallback title art.
 *
 * Memoized so FlashList row recycling does not re-mount the cover when only
 * sibling cells change. Uses expo-image's built-in `transition` for fade-in
 * instead of a per-cell reanimated worklet to keep N (cell count) low-overhead.
 * `recyclingKey` ensures the image refreshes when the cell is reused for a
 * different book.
 */
export const BookCover = memo(BookCoverImpl)
