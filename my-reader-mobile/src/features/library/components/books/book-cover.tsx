import { memo, useState } from "react"
import { Image as ExpoImage } from "expo-image"
import {
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from "react-native"

import { LIBRARY_COVER_PROFILING_MODE } from "@/src/constants/developer-tools"
import { useThemePalette } from "@/src/design/tokens"
import type { BookCoverUri, BookItem } from "@/src/domain/types"

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

const fallbackCoverThemes: FallbackCoverTheme[] = [
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

const COVER_IMAGE_TRANSITION_MS = 140

function getTitleHash(title: string) {
  let hash = 0
  for (let index = 0; index < title.length; index += 1) {
    hash = ((hash << 5) - hash + title.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

function getFallbackCoverTheme(title: string): FallbackCoverTheme {
  return (
    fallbackCoverThemes[getTitleHash(title) % fallbackCoverThemes.length] ??
    fallbackCoverThemes[0]!
  )
}

/**
 * Returns a stable fallback color for books without cover art.
 */
export function getFallbackCoverColor(title: string) {
  return getFallbackCoverTheme(title).base
}

function getCoverStateKey(coverUri: BookCoverUri | undefined) {
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
  displayCoverUri?: BookCoverUri
  deferCoverUntilDisplayUri?: boolean
}

type BookCoverBaseProps = BookCoverProps & {
  backgroundColor: string
  shadowColor: string
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
  const rootStyle: ViewStyle = { backgroundColor: fallbackTheme.base }
  const spineStyle: ViewStyle = {
    width: spineWidth,
    backgroundColor: fallbackTheme.spine,
  }
  const spineShadowStyle: ViewStyle = {
    left: spineWidth,
    backgroundColor: fallbackTheme.shadow,
  }
  const contentStyle: ViewStyle = {
    left: contentInset,
    right: contentInset,
    top: Math.max(16, height * 0.2),
    bottom: Math.max(16, height * 0.2),
  }
  const titleStyle: TextStyle = {
    color: fallbackTheme.foreground,
    fontSize: titleFontSize,
    lineHeight: titleLineHeight,
  }
  const authorStyle: TextStyle = {
    color: fallbackTheme.secondaryForeground,
    fontSize: authorFontSize,
    lineHeight: Math.round(authorFontSize * 1.25),
  }

  return (
    <View style={[styles.fallbackRoot, rootStyle]}>
      <View style={[styles.fallbackSpine, spineStyle]} />
      <View style={[styles.fallbackSpineShadow, spineShadowStyle]} />
      <View style={[styles.fallbackContent, contentStyle]}>
        <Text
          style={[styles.fallbackTitle, titleStyle]}
          numberOfLines={3}
          allowFontScaling={false}
        >
          {title}
        </Text>
        {author ? (
          <Text
            style={[styles.fallbackAuthor, authorStyle]}
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

function BookCoverBaseImpl({
  book,
  width,
  height,
  backgroundColor,
  borderRadius = 10,
  displayCoverUri,
  deferCoverUntilDisplayUri = false,
  shadowColor,
}: BookCoverBaseProps) {
  // Cover rendering is the hottest part of the grid. Keep the Base variant on
  // RN primitives + StyleSheet and receive colors from the parent so cells avoid
  // NativeWind class resolution and theme context subscriptions.
  const effectiveCoverUri =
    displayCoverUri ?? (deferCoverUntilDisplayUri ? undefined : book.coverUri)
  const coverKey = getCoverStateKey(effectiveCoverUri)
  const [failedCoverKey, setFailedCoverKey] = useState<string>()
  const coverFrameStyle: ViewStyle = {
    width,
    height,
    borderRadius,
    backgroundColor,
    shadowColor,
  }
  const imageStyle: ImageStyle = {
    width,
    height,
  }

  const shouldRenderImage =
    LIBRARY_COVER_PROFILING_MODE !== "fallback-only" &&
    !!effectiveCoverUri &&
    !!coverKey &&
    failedCoverKey !== coverKey
  // Profiling modes are env-only developer tools. They isolate native image
  // resize work from fallback text drawing without adding per-cell display
  // state to the scroll path.
  const shouldRenderFallback =
    LIBRARY_COVER_PROFILING_MODE !== "image-only" || !shouldRenderImage

  return (
    <View style={[styles.coverFrame, coverFrameStyle]}>
      {shouldRenderFallback ? (
        <DefaultBookCover
          author={book.author}
          title={book.title}
          width={width}
          height={height}
        />
      ) : null}
      {shouldRenderImage ? (
        <ExpoImage
          source={effectiveCoverUri}
          style={[styles.coverImage, imageStyle]}
          recyclingKey={`${book.id}:${coverKey}`}
          testID={`book-cover-image-${book.id}`}
          cachePolicy="memory-disk"
          transition={COVER_IMAGE_TRANSITION_MS}
          onError={() => setFailedCoverKey(coverKey)}
        />
      ) : null}
    </View>
  )
}

export const BookCoverBase = memo(BookCoverBaseImpl)

function BookCoverImpl(props: BookCoverProps) {
  const palette = useThemePalette()
  return (
    <BookCoverBase
      {...props}
      backgroundColor={palette.backgroundSecondary}
      shadowColor={palette.text}
    />
  )
}

const styles = StyleSheet.create({
  coverFrame: {
    overflow: "hidden",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 1, height: 3 },
    elevation: 3,
  },
  coverImage: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  fallbackRoot: {
    height: "100%",
    width: "100%",
    overflow: "hidden",
  },
  fallbackSpine: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
  fallbackSpineShadow: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
  },
  fallbackContent: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackTitle: {
    textAlign: "center",
    fontWeight: "600",
    textShadowColor: "rgba(0, 0, 0, 0.34)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  fallbackAuthor: {
    marginTop: 8,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.28)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
})

/**
 * Renders a compact mobile book cover with fallback title art.
 *
 * Memoized so FlashList row recycling does not re-mount the cover when only
 * sibling cells change. The fallback cover stays behind the real image so image
 * display does not trigger a per-cell JS state update during fast scrolling.
 * `recyclingKey` ensures the image refreshes when the cell is reused for a
 * different book.
 */
export const BookCover = memo(BookCoverImpl)
