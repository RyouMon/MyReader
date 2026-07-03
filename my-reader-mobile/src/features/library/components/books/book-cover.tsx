import { memo, useCallback, useState, useSyncExternalStore } from "react"
import { Image as ExpoImage } from "expo-image"
import {
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native"

import {
  COVER_IMAGE_DISPLAYED_CACHE_LIMIT,
  COVER_IMAGE_TRANSITION_MS,
  COVER_STYLE_CACHE_LIMIT,
} from "@/src/config/library-list-performance"
import { Skeleton } from "@/src/components/ui/skeleton"
import {
  LIBRARY_COVER_PROFILING_MODE,
  type LibraryCoverProfilingMode,
} from "@/src/constants/developer-tools"
import { useThemePalette } from "@/src/design/tokens"
import type { BookCoverUri, BookItem } from "@/src/domain/types"
import { useCoverThumbnailSessionUri } from "../../cover-thumbnail-session-store"

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

type FallbackCoverStyleSet = {
  root: StyleProp<ViewStyle>
  spine: StyleProp<ViewStyle>
  spineShadow: StyleProp<ViewStyle>
  content: StyleProp<ViewStyle>
  title: StyleProp<TextStyle>
  author: StyleProp<TextStyle>
}

type CoverFrameStyleSet = {
  frame: StyleProp<ViewStyle>
  image: StyleProp<ImageStyle>
  loadingSkeleton: StyleProp<ViewStyle>
}

export type BookCoverMode = "loading" | "loaded" | "fallback"

const fallbackThemeByTitle = new Map<string, FallbackCoverTheme>()
const fallbackStyleByKey = new Map<string, FallbackCoverStyleSet>()
const coverFrameStyleByKey = new Map<string, CoverFrameStyleSet>()
const displayedCoverKeys = new Set<string>()
const displayedCoverListenersByKey = new Map<string, Set<() => void>>()

function cachedValue<T>(
  cache: Map<string, T>,
  key: string,
  create: () => T,
): T {
  const cached = cache.get(key)
  if (cached) return cached

  if (cache.size >= COVER_STYLE_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value
    if (oldestKey !== undefined) cache.delete(oldestKey)
  }

  const value = create()
  cache.set(key, value)
  return value
}

function getTitleHash(title: string) {
  let hash = 0
  for (let index = 0; index < title.length; index += 1) {
    hash = ((hash << 5) - hash + title.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

function getFallbackCoverTheme(title: string): FallbackCoverTheme {
  return cachedValue(
    fallbackThemeByTitle,
    title,
    () =>
      fallbackCoverThemes[getTitleHash(title) % fallbackCoverThemes.length] ??
      fallbackCoverThemes[0]!,
  )
}

/**
 * Returns a stable fallback color for books without cover art.
 */
export function getFallbackCoverColor(title: string) {
  return getFallbackCoverTheme(title).base
}

function getFallbackCoverStyles(
  title: string,
  width: number,
  height: number,
): FallbackCoverStyleSet {
  // Fallback covers can be the whole first screen on a cold library. Cache the
  // small dynamic style sets so recycled FlashList cells do not allocate new
  // arrays/objects for every title during scroll.
  return cachedValue(fallbackStyleByKey, `${title}:${width}:${height}`, () => {
    const fallbackTheme = getFallbackCoverTheme(title)
    const spineWidth = Math.max(6, Math.min(14, width * 0.13))
    const contentInset = Math.max(12, width * 0.16)
    const titleFontSize = Math.max(12, Math.min(18, width * 0.14))
    const authorFontSize = Math.max(10, Math.min(13, width * 0.1))

    return {
      root: [styles.fallbackRoot, { backgroundColor: fallbackTheme.base }],
      spine: [
        styles.fallbackSpine,
        {
          width: spineWidth,
          backgroundColor: fallbackTheme.spine,
        },
      ],
      spineShadow: [
        styles.fallbackSpineShadow,
        {
          left: spineWidth,
          backgroundColor: fallbackTheme.shadow,
        },
      ],
      content: [
        styles.fallbackContent,
        {
          left: contentInset,
          right: contentInset,
          top: Math.max(16, height * 0.2),
          bottom: Math.max(16, height * 0.2),
        },
      ],
      title: [
        styles.fallbackTitle,
        {
          color: fallbackTheme.foreground,
          fontSize: titleFontSize,
          lineHeight: Math.round(titleFontSize * 1.32),
        },
      ],
      author: [
        styles.fallbackAuthor,
        {
          color: fallbackTheme.secondaryForeground,
          fontSize: authorFontSize,
          lineHeight: Math.round(authorFontSize * 1.25),
        },
      ],
    }
  })
}

function getCoverFrameStyles({
  backgroundColor,
  borderRadius,
  height,
  skeletonColor,
  shadowEnabled,
  shadowColor,
  width,
}: {
  backgroundColor: string
  borderRadius: number
  height: number
  skeletonColor: string
  shadowEnabled: boolean
  shadowColor: string
  width: number
}): CoverFrameStyleSet {
  return cachedValue(
    coverFrameStyleByKey,
    `${width}:${height}:${borderRadius}:${backgroundColor}:${skeletonColor}:${shadowColor}:${shadowEnabled}`,
    () => ({
      frame: [
        styles.coverFrame,
        shadowEnabled ? styles.coverFrameShadow : null,
        {
          width,
          height,
          borderRadius,
          backgroundColor,
          shadowColor: shadowEnabled ? shadowColor : undefined,
        },
      ],
      image: [
        styles.coverImage,
        {
          width,
          height,
        },
      ],
      loadingSkeleton: [
        styles.loadingSkeleton,
        {
          backgroundColor: skeletonColor,
        },
      ],
    }),
  )
}

function getCoverStateKey(coverUri: BookCoverUri | undefined) {
  if (!coverUri) {
    return undefined
  }

  return typeof coverUri === "string" ? coverUri : coverUri.uri
}

function subscribeDisplayedCoverKey(
  coverKey: string | undefined,
  listener: () => void,
): () => void {
  if (!coverKey) return () => {}

  let listeners = displayedCoverListenersByKey.get(coverKey)
  if (!listeners) {
    listeners = new Set()
    displayedCoverListenersByKey.set(coverKey, listeners)
  }
  listeners.add(listener)

  return () => {
    listeners?.delete(listener)
    if (listeners?.size === 0) {
      displayedCoverListenersByKey.delete(coverKey)
    }
  }
}

function getDisplayedCoverSnapshot(coverKey: string | undefined) {
  return !!coverKey && displayedCoverKeys.has(coverKey)
}

function markCoverImageDisplayed(coverKey: string | undefined): void {
  if (!coverKey || displayedCoverKeys.has(coverKey)) return

  if (displayedCoverKeys.size >= COVER_IMAGE_DISPLAYED_CACHE_LIMIT) {
    const oldestKey = displayedCoverKeys.values().next().value
    if (oldestKey !== undefined) displayedCoverKeys.delete(oldestKey)
  }

  displayedCoverKeys.add(coverKey)
  const listeners = displayedCoverListenersByKey.get(coverKey)
  if (!listeners) return

  for (const listener of listeners) {
    listener()
  }
}

function useCoverImageDisplayed(coverKey: string | undefined) {
  return useSyncExternalStore(
    (listener) => subscribeDisplayedCoverKey(coverKey, listener),
    () => getDisplayedCoverSnapshot(coverKey),
    () => getDisplayedCoverSnapshot(coverKey),
  )
}

export function resetCoverImageDisplayStoreForTests(): void {
  displayedCoverKeys.clear()
  displayedCoverListenersByKey.clear()
}

export function resolveBookCoverMode({
  hasExpectedCover,
  hasRenderableImage,
  imageDisplayed,
  imageFailed,
  profilingMode = LIBRARY_COVER_PROFILING_MODE,
}: {
  hasExpectedCover: boolean
  hasRenderableImage: boolean
  imageDisplayed: boolean
  imageFailed: boolean
  profilingMode?: LibraryCoverProfilingMode
}): BookCoverMode {
  if (profilingMode === "fallback-only") {
    return "fallback"
  }
  if (!hasExpectedCover || imageFailed) {
    return "fallback"
  }
  if (profilingMode === "image-only") {
    return hasRenderableImage ? "loaded" : "fallback"
  }
  return hasRenderableImage && imageDisplayed ? "loaded" : "loading"
}

type BookCoverProps = {
  book: BookItem
  width: number
  height: number
  borderRadius?: number
  displayCoverUri?: BookCoverUri
  deferCoverUntilDisplayUri?: boolean
  shadowEnabled?: boolean
  thumbnailScopeKey?: string
}

type BookCoverBaseProps = BookCoverProps & {
  backgroundColor: string
  shadowColor: string
  skeletonColor: string
}

function DefaultBookCoverImpl({
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
  const fallbackStyles = getFallbackCoverStyles(title, width, height)

  return (
    <View style={fallbackStyles.root}>
      <View style={fallbackStyles.spine} />
      <View style={fallbackStyles.spineShadow} />
      <View style={fallbackStyles.content}>
        <Text
          style={fallbackStyles.title}
          numberOfLines={3}
          allowFontScaling={false}
        >
          {title}
        </Text>
        {author ? (
          <Text
            style={fallbackStyles.author}
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

const DefaultBookCover = memo(DefaultBookCoverImpl)

function BookCoverBaseImpl({
  book,
  width,
  height,
  backgroundColor,
  borderRadius = 10,
  displayCoverUri,
  deferCoverUntilDisplayUri = false,
  shadowEnabled = true,
  thumbnailScopeKey,
  shadowColor,
  skeletonColor,
}: BookCoverBaseProps) {
  // Cover rendering is the hottest part of the grid. Keep the Base variant on
  // RN primitives + StyleSheet and receive colors from the parent so cells avoid
  // NativeWind class resolution and theme context subscriptions.
  const thumbnailCoverUri = useCoverThumbnailSessionUri(thumbnailScopeKey, book)
  const hasExpectedCover = !!(
    displayCoverUri ??
    thumbnailCoverUri ??
    book.coverUri
  )
  const effectiveCoverUri =
    displayCoverUri ??
    thumbnailCoverUri ??
    (deferCoverUntilDisplayUri ? undefined : book.coverUri)
  const coverKey = getCoverStateKey(effectiveCoverUri)
  const [failedCoverKey, setFailedCoverKey] = useState<string>()
  const coverStyles = getCoverFrameStyles({
    backgroundColor,
    borderRadius,
    height,
    skeletonColor,
    shadowEnabled,
    shadowColor,
    width,
  })

  const shouldRenderImage =
    LIBRARY_COVER_PROFILING_MODE !== "fallback-only" &&
    !!effectiveCoverUri &&
    !!coverKey &&
    failedCoverKey !== coverKey
  const coverImageDisplayed = useCoverImageDisplayed(coverKey)
  const coverMode = resolveBookCoverMode({
    hasExpectedCover,
    hasRenderableImage: shouldRenderImage,
    imageDisplayed: coverImageDisplayed,
    imageFailed: !!coverKey && failedCoverKey === coverKey,
  })
  const handleImageDisplay = useCallback(() => {
    markCoverImageDisplayed(coverKey)
  }, [coverKey])

  return (
    <View style={coverStyles.frame}>
      {coverMode === "fallback" ? (
        <DefaultBookCover
          author={book.author}
          title={book.title}
          width={width}
          height={height}
        />
      ) : null}
      {coverMode === "loading" ? (
        <Skeleton
          style={coverStyles.loadingSkeleton}
          testID={`book-cover-loading-${book.id}`}
        />
      ) : null}
      {shouldRenderImage ? (
        <ExpoImage
          source={effectiveCoverUri}
          style={coverStyles.image}
          recyclingKey={`${book.id}:${coverKey}`}
          testID={`book-cover-image-${book.id}`}
          cachePolicy="memory-disk"
          transition={
            coverImageDisplayed ? undefined : COVER_IMAGE_TRANSITION_MS
          }
          onDisplay={handleImageDisplay}
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
      skeletonColor={palette.surface}
    />
  )
}

const styles = StyleSheet.create({
  coverFrame: {
    overflow: "hidden",
  },
  coverFrameShadow: {
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
  loadingSkeleton: {
    ...StyleSheet.absoluteFill,
    borderRadius: 0,
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
  },
  fallbackAuthor: {
    marginTop: 8,
    textAlign: "center",
  },
})

/**
 * Renders a compact mobile book cover with fallback title art.
 *
 * Memoized so FlashList row recycling does not re-mount the cover when only
 * sibling cells change. Once an image identity has displayed, the fallback
 * subtree is removed through a per-cover external-store notification so later
 * visits do not pay the fallback text/layout cost again.
 */
export const BookCover = memo(BookCoverImpl)
