import type { ReaderImageBook } from "@my-reader/tools/reader-image-export"
import { useReaderImageActions } from "../use-reader-image-actions"
import {
  resolveReaderStart,
  readerProgress,
  logReaderStart,
} from "../reader-publication-state"
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react"
import { StyleSheet, View } from "react-native"
import { ReadiumView } from "@my-reader/readium"
import type {
  Locator,
  PublicationReadyEvent,
  ReadiumFile,
  ReadiumViewRef,
} from "@my-reader/readium"
import i18n from "@/src/i18n"

import type {
  ReaderState,
  ReaderTocItem,
} from "@/src/features/reader/components/reader/types"
import type {
  FixedNavigationMode,
  ReadingProgression,
  Spread,
} from "@/src/store/app-store.types"
import {
  chapterTitleForFixedLocator,
  hasTocTitle,
  linksToFixedTocItems,
  positionIndexForLocator,
  resolveNativeLocator,
} from "./fixed-reader-navigation"

const PROGRESS_PERCENT_MULTIPLIER = 100

export type ReadiumFixedReaderRef = {
  sharePage: () => Promise<void>
  goTo: (locator: Locator) => void
}

export type ReadiumFixedReaderProps = {
  imageBook?: ReaderImageBook
  /** Native filesystem path to the CBZ archive. */
  filePath: string
  /** Restored Readium Locator used as `ReadiumFile.initialLocation`. */
  initialLocator?: Locator
  onStateChange: (state: ReaderState) => void
  onPositionsReady?: (positions: Locator[]) => void
  onUserLocationChange?: (
    locator: Locator,
    navigationId: string,
    navigationKind: "pageTurn" | "programmatic",
  ) => void
  onTocReady: (items: ReaderTocItem[]) => void
  onRequestClose: () => void
  onToggleChrome?: () => void
  showChapterTitle?: boolean
  backgroundColor: string
  navigationMode: FixedNavigationMode
  readingProgression: ReadingProgression
  spread: Spread
}

function positionsToTocItems(positions: Locator[]): ReaderTocItem[] {
  const items: ReaderTocItem[] = []
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]!
    items.push({
      id: `fixed-page-${i}`,
      label: p.title ?? i18n.t("reader.pageLabel", { page: i + 1 }),
      pageIndex: i,
      chapterIndex: i,
      href: p.href,
      locator: p,
    })
  }
  return items
}

const ReadiumFixedReader = forwardRef<
  ReadiumFixedReaderRef,
  ReadiumFixedReaderProps
>(function ReadiumFixedReader(
  {
    filePath,
    imageBook,
    initialLocator,
    onStateChange,
    onPositionsReady,
    onUserLocationChange,
    onTocReady,
    onToggleChrome,
    showChapterTitle = true,
    backgroundColor,
    navigationMode,
    readingProgression,
    spread,
  },
  ref,
) {
  const readiumRef = useRef<ReadiumViewRef>(null)
  const imageActions = useReaderImageActions(readiumRef, imageBook)
  const tocItemsRef = useRef<ReaderTocItem[]>([])
  const positionsRef = useRef<Locator[]>([])
  const currentLocatorRef = useRef<Locator | null>(null)
  const hasPublicationTocRef = useRef(false)
  const chapterTitleRef = useRef("")

  useImperativeHandle(
    ref,
    () => ({
      sharePage: imageActions.sharePage,
      goTo: (locator: Locator) => readiumRef.current?.goTo(locator),
    }),
    [imageActions.sharePage],
  )

  const file = useMemo<ReadiumFile>(
    () => ({
      url: filePath,
      initialLocation: initialLocator,
    }),
    [filePath, initialLocator],
  )

  const preferences = useMemo(
    () => ({
      backgroundColor,
      scroll: navigationMode === "vertical",
      readingProgression,
      spread,
    }),
    [backgroundColor, navigationMode, readingProgression, spread],
  )

  const handlePublicationReady = useCallback(
    (event: PublicationReadyEvent) => {
      positionsRef.current = event.positions
      onPositionsReady?.(event.positions)
      hasPublicationTocRef.current = hasTocTitle(event.tableOfContents)
      const tocItems = hasPublicationTocRef.current
        ? linksToFixedTocItems(
            event.tableOfContents,
            event.positions,
            (index) => i18n.t("reader.pageLabel", { page: index + 1 }),
          )
        : positionsToTocItems(event.positions)
      tocItemsRef.current = tocItems
      onTocReady(tocItems)

      const totalPages = Math.max(1, event.positions.length)

      // Resolve initial position using position/progression from stored locator,
      // then find the matching native locator from positions list.
      // This ensures the href matches the platform-native format.
      const { locator: startLocator, source: startSource } = resolveReaderStart(
        event.positions,
        initialLocator,
        currentLocatorRef.current,
        resolveNativeLocator,
      )
      currentLocatorRef.current = startLocator ?? null
      logReaderStart({
        format: "FIXED",
        source: startSource,
        positions: event.positions.length,
        stored: initialLocator,
        resolved: startLocator,
      })

      const currentPage = startLocator
        ? positionIndexForLocator(event.positions, startLocator)
        : 0
      const progress = readerProgress(startLocator)
      const chapterTitle =
        showChapterTitle && hasPublicationTocRef.current && startLocator
          ? (startLocator.title ??
            chapterTitleForFixedLocator(
              tocItems,
              event.positions,
              startLocator,
            ) ??
            chapterTitleRef.current)
          : ""
      chapterTitleRef.current = chapterTitle

      onStateChange({
        ready: true,
        currentPage,
        totalPages,
        progress,
        chapterTitle,
        loading: false,
        error: null,
        locator: startLocator,
      })
    },
    [
      initialLocator,
      onPositionsReady,
      onTocReady,
      onStateChange,
      showChapterTitle,
    ],
  )

  const handleLocationChange = useCallback(
    (
      locator: Locator,
      source?: "tts" | "user",
      navigationId?: string,
      navigationKind?: "pageTurn" | "programmatic",
    ) => {
      if (source === "user" && navigationId) {
        onUserLocationChange?.(
          locator,
          navigationId,
          navigationKind ?? "pageTurn",
        )
      }
      currentLocatorRef.current = locator

      const positions = positionsRef.current
      const totalPages = Math.max(1, positions.length)
      const progression =
        locator.locations?.totalProgression ??
        locator.locations?.progression ??
        0
      const progress = Math.round(progression * PROGRESS_PERCENT_MULTIPLIER)

      const currentPage = positionIndexForLocator(positions, locator)
      const chapterTitle =
        showChapterTitle && hasPublicationTocRef.current
          ? (locator.title ??
            chapterTitleForFixedLocator(
              tocItemsRef.current,
              positions,
              locator,
            ) ??
            chapterTitleRef.current)
          : ""
      chapterTitleRef.current = chapterTitle

      onStateChange({
        ready: true,
        currentPage,
        totalPages,
        progress,
        chapterTitle,
        loading: false,
        error: null,
        locator,
      })
    },
    [onStateChange, onUserLocationChange, showChapterTitle],
  )

  return (
    <View style={styles.reader}>
      <ReadiumView
        ref={readiumRef}
        file={file}
        preferences={preferences}
        style={styles.reader}
        onPublicationReady={handlePublicationReady}
        onLocationChange={handleLocationChange}
        // onTap is emitted by the native navigator; the wrapping View's
        // touch handlers don't receive events on Android because the native
        // reader view consumes them.
        onTap={onToggleChrome}
        onImagePress={imageActions.onImagePress}
      />
    </View>
  )
})

export default ReadiumFixedReader

const styles = StyleSheet.create({
  reader: {
    flex: 1,
  },
})
