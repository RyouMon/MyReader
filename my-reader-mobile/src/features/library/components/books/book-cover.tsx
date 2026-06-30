import { memo, useState } from "react"

import { useThemePalette } from "@/src/design/tokens"
import type { BookItem } from "@/src/domain/types"
import { Image, Text, View } from "@/tw"

export type BookDownloadStatus = "downloaded" | "notDownloaded" | "downloading"

export type BookProgressSnapshot = {
  percent?: number
  statusLabel?: string
}

type FallbackCoverTheme = {
  base: string
  spine: string
  shadow: string
  foreground: string
  secondaryForeground: string
}

function getTitleHash(title: string) {
  let hash = 0
  for (let index = 0; index < title.length; index += 1) {
    hash = ((hash << 5) - hash + title.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

function getFallbackCoverTheme(title: string): FallbackCoverTheme {
  const themes = [
    {
      base: "#5A3B2A",
      spine: "#332017",
      shadow: "rgba(24, 14, 8, 0.28)",
      foreground: "#FFF8EA",
      secondaryForeground: "rgba(255, 248, 234, 0.76)",
    },
    {
      base: "#294557",
      spine: "#182C38",
      shadow: "rgba(7, 18, 24, 0.26)",
      foreground: "#F7FBFC",
      secondaryForeground: "rgba(247, 251, 252, 0.74)",
    },
    {
      base: "#66511F",
      spine: "#3D3012",
      shadow: "rgba(29, 22, 8, 0.28)",
      foreground: "#FFF8EA",
      secondaryForeground: "rgba(255, 248, 234, 0.76)",
    },
    {
      base: "#2D4B38",
      spine: "#1A2D21",
      shadow: "rgba(8, 21, 13, 0.26)",
      foreground: "#F2FAF4",
      secondaryForeground: "rgba(242, 250, 244, 0.74)",
    },
    {
      base: "#5B3444",
      spine: "#35202A",
      shadow: "rgba(27, 12, 18, 0.28)",
      foreground: "#FFF5F8",
      secondaryForeground: "rgba(255, 245, 248, 0.74)",
    },
    {
      base: "#343A59",
      spine: "#202438",
      shadow: "rgba(11, 13, 25, 0.26)",
      foreground: "#F7F8FF",
      secondaryForeground: "rgba(247, 248, 255, 0.74)",
    },
  ]
  return themes[getTitleHash(title) % themes.length] ?? themes[0]!
}

/**
 * Returns a stable fallback color for books without cover art.
 */
export function getFallbackCoverColor(title: string) {
  return getFallbackCoverTheme(title).base
}

function getCoverStateKey(coverUri: BookItem["coverUri"]) {
  if (!coverUri) {
    return undefined
  }

  return typeof coverUri === "string" ? coverUri : coverUri.uri
}

type BookCoverProps = {
  book: BookItem
  width: number
  height: number
  borderRadius?: number
}

type ImageDisplayState = {
  coverKey?: string
  status: "idle" | "loaded" | "error"
}

function DefaultBookCover({
  author,
  title,
  width,
  height,
}: {
  author: string
  title: string
  width: number
  height: number
}) {
  const fallbackTheme = getFallbackCoverTheme(title)
  const spineWidth = Math.max(6, Math.min(14, width * 0.13))
  const contentInset = Math.max(12, width * 0.16)
  const titleFontSize = Math.max(12, Math.min(18, width * 0.14))
  const titleLineHeight = Math.round(titleFontSize * 1.32)
  const authorFontSize = Math.max(10, Math.min(13, width * 0.1))

  return (
    <View
      className="h-full w-full overflow-hidden"
      style={{ backgroundColor: fallbackTheme.base }}
    >
      <View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: spineWidth,
          backgroundColor: fallbackTheme.spine,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: spineWidth,
          top: 0,
          bottom: 0,
          width: 1,
          backgroundColor: fallbackTheme.shadow,
        }}
      />
      <View
        className="items-center justify-center"
        style={{
          position: "absolute",
          left: contentInset,
          right: contentInset,
          top: Math.max(16, height * 0.2),
          bottom: Math.max(16, height * 0.2),
        }}
      >
        <Text
          className="text-center font-semibold"
          style={{
            color: fallbackTheme.foreground,
            fontSize: titleFontSize,
            lineHeight: titleLineHeight,
            textShadowColor: "rgba(0, 0, 0, 0.34)",
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 4,
          }}
          numberOfLines={3}
          allowFontScaling={false}
        >
          {title}
        </Text>
        {author ? (
          <Text
            className="mt-2 text-center"
            style={{
              color: fallbackTheme.secondaryForeground,
              fontSize: authorFontSize,
              lineHeight: Math.round(authorFontSize * 1.25),
              textShadowColor: "rgba(0, 0, 0, 0.28)",
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 3,
            }}
            numberOfLines={1}
            allowFontScaling={false}
          >
            {author}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

function BookCoverImpl({
  book,
  width,
  height,
  borderRadius = 10,
}: BookCoverProps) {
  const palette = useThemePalette()
  const coverKey = getCoverStateKey(book.coverUri)
  const [imageDisplayState, setImageDisplayState] = useState<ImageDisplayState>(
    { coverKey, status: "idle" },
  )

  const imageStatus =
    imageDisplayState.coverKey === coverKey ? imageDisplayState.status : "idle"

  const shouldRenderImage =
    !!book.coverUri && !!coverKey && imageStatus !== "error"

  return (
    <View
      className="overflow-hidden"
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: palette.backgroundSecondary,
        shadowColor: palette.text,
        shadowOpacity: 0.18,
        shadowRadius: 8,
        shadowOffset: { width: 1, height: 3 },
        elevation: 3,
      }}
    >
      {!shouldRenderImage || imageStatus !== "loaded" ? (
        <DefaultBookCover
          author={book.author}
          title={book.title}
          width={width}
          height={height}
        />
      ) : null}
      {shouldRenderImage ? (
        <Image
          source={book.coverUri}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width,
            height,
            opacity: imageStatus === "loaded" ? 1 : 0,
          }}
          recyclingKey={`${book.id}:${coverKey}`}
          testID={`book-cover-image-${book.id}`}
          cachePolicy="memory-disk"
          transition={200}
          onDisplay={() => setImageDisplayState({ coverKey, status: "loaded" })}
          onError={() => setImageDisplayState({ coverKey, status: "error" })}
        />
      ) : null}
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
