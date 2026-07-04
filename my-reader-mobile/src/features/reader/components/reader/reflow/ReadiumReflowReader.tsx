import {
  forwardRef,
  useCallback,
  useEffect,
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

import type {
  ReaderState,
  ReaderTocItem,
} from "@/src/features/reader/components/reader/types"
import type {
  ReaderTheme,
  TextAlignment,
  ColumnCount,
  FontFamilyKey,
} from "@/src/store/app-store.types"
import {
  chapterTitleForLocator,
  findLocatorForLinkHref,
  hrefRoughlyMatches,
  linksToTocItems,
  positionIndexForLocator,
  resolveNativeLocator,
} from "./reader-reflow-navigation"
import { buildPreferences } from "./reader-reflow-preferences"

const PROGRESS_PERCENT_MULTIPLIER = 100

export type ReadiumReflowReaderRef = {
  goTo: (locator: Locator) => void
}

export type ReadiumReflowReaderProps = {
  /** Native filesystem path to the EPUB archive（`toNativeFilesystemPath(fileUri)`）。 */
  epubPath: string
  /** 自 DB 恢复的 Readium Locator，作为 `ReadiumFile.initialLocation` 传给原生层。 */
  initialLocator?: Locator
  onStateChange: (state: ReaderState) => void
  onTocReady: (items: ReaderTocItem[]) => void
  onRequestClose: () => void
  onToggleChrome?: () => void
  /** 与 {@link ReaderTocItem.pageIndex} 一致，由目录 sheet 选择触发。 */
  gotoTocIndex?: number
  theme?: ReaderTheme
  fontFamily?: FontFamilyKey
  fontSize?: number
  lineHeight?: number
  paddingX?: number
  textAlign?: TextAlignment
  columnCount?: ColumnCount
}

const ReadiumReflowReader = forwardRef<
  ReadiumReflowReaderRef,
  ReadiumReflowReaderProps
>(function ReadiumReflowReader(
  {
    epubPath,
    initialLocator,
    onStateChange,
    onTocReady,
    onToggleChrome,
    gotoTocIndex,
    theme = "paper",
    fontFamily = "serif",
    fontSize = 18,
    lineHeight = 1.85,
    paddingX = 20,
    textAlign = "auto",
    columnCount = "auto",
  },
  ref,
) {
  const readiumRef = useRef<ReadiumViewRef>(null)
  const tocItemsRef = useRef<ReaderTocItem[]>([])
  const positionsRef = useRef<Locator[]>([])
  const currentLocatorRef = useRef<Locator | null>(null)
  const chapterTitleRef = useRef("")

  useImperativeHandle(ref, () => ({
    goTo: (locator: Locator) => readiumRef.current?.goTo(locator),
  }))

  // Don't pass initialLocator as initialLocation — its href may not match
  // the native publication format. Instead, navigate after publicationReady.
  const file = useMemo<ReadiumFile>(
    () => ({
      url: epubPath,
    }),
    [epubPath],
  )

  const preferences = useMemo(
    () =>
      buildPreferences(
        theme,
        fontFamily,
        fontSize,
        lineHeight,
        paddingX,
        textAlign,
        columnCount,
      ),
    [theme, fontFamily, fontSize, lineHeight, paddingX, textAlign, columnCount],
  )

  const handlePublicationReady = useCallback(
    (event: PublicationReadyEvent) => {
      positionsRef.current = event.positions
      const tocItems = linksToTocItems(event.tableOfContents, event.positions)
      tocItemsRef.current = tocItems
      onTocReady(tocItems)

      const totalPages = Math.max(1, event.positions.length)

      // Resolve initial position using position/progression from stored locator,
      // then find the matching native locator from positions list.
      let startLocator: Locator | undefined = event.positions[0]
      if (initialLocator) {
        const resolved = resolveNativeLocator(event.positions, initialLocator)
        if (resolved) startLocator = resolved
      } else if (currentLocatorRef.current) {
        const resolved = resolveNativeLocator(
          event.positions,
          currentLocatorRef.current,
        )
        if (resolved) startLocator = resolved
      }
      currentLocatorRef.current = startLocator ?? null

      const currentPage = startLocator
        ? positionIndexForLocator(event.positions, startLocator)
        : 0
      const progression =
        startLocator?.locations?.totalProgression ??
        startLocator?.locations?.progression ??
        0
      const progress = Math.round(progression * PROGRESS_PERCENT_MULTIPLIER)
      const chapterTitle =
        (startLocator
          ? chapterTitleForLocator(tocItems, event.positions, startLocator)
          : undefined) ??
        (chapterTitleRef.current || event.metadata.title)
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

      // Navigate to the resolved position after the view is ready
      if (startLocator && startLocator !== event.positions[0]) {
        readiumRef.current?.goTo(startLocator)
      }
    },
    [initialLocator, onTocReady, onStateChange],
  )

  const handleLocationChange = useCallback(
    (locator: Locator) => {
      currentLocatorRef.current = locator

      const positions = positionsRef.current
      const totalPages = Math.max(1, positions.length)
      const progression =
        locator.locations?.totalProgression ??
        locator.locations?.progression ??
        0
      const progress = Math.round(progression * PROGRESS_PERCENT_MULTIPLIER)

      const currentPage = positionIndexForLocator(positions, locator)

      const href = locator.href
      const tocItems = tocItemsRef.current
      const matchedToc = tocItems.find(
        (item) => item.href && hrefRoughlyMatches(href, item.href),
      )
      const chapterTitle =
        locator.title ??
        chapterTitleForLocator(tocItems, positions, locator) ??
        matchedToc?.label ??
        chapterTitleRef.current
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
    [onStateChange],
  )

  useEffect(() => {
    if (gotoTocIndex == null || gotoTocIndex < 0) return

    const tocItem = tocItemsRef.current[gotoTocIndex]
    if (!tocItem) return

    const target =
      tocItem.locator ??
      (tocItem.href
        ? findLocatorForLinkHref(positionsRef.current, tocItem.href)
        : undefined)
    if (target) {
      readiumRef.current?.goTo(target)
    }
  }, [gotoTocIndex])

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
      />
    </View>
  )
})

export default ReadiumReflowReader

const styles = StyleSheet.create({
  reader: {
    flex: 1,
  },
})
