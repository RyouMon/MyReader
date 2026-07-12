import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react"
import { StyleSheet, View } from "react-native"
import {
  publication as readiumPublication,
  ReadiumView,
} from "@my-reader/readium"
import {
  positionIndexForLocator,
  resolveReaderToc,
} from "@my-reader/tools/reader-toc"
import type {
  ContentResult,
  FontFamilyDeclaration,
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
  enhanceTocItemsWithContentLocators,
  linksToTocItems,
  locatorWithTocSelection,
  resolveNativeLocator,
} from "./reader-reflow-navigation"
import { buildPreferences } from "./reader-reflow-preferences"

const PROGRESS_PERCENT_MULTIPLIER = 100

export type ReadiumReflowReaderRef = {
  goTo: (locator: Locator, tocItem?: ReaderTocItem) => void
}

export type ReadiumReflowReaderProps = {
  /** Native filesystem path to the EPUB archive（`toNativeFilesystemPath(fileUri)`）。 */
  epubPath: string
  /** 自 DB 恢复的 Readium Locator，作为 `ReadiumFile.initialLocation` 传给原生层。 */
  initialLocator?: Locator
  onStateChange: (state: ReaderState) => void
  onPositionsReady?: (positions: Locator[]) => void
  onPublicationLanguagesReady?: (languages: string[]) => void
  onTocReady: (items: ReaderTocItem[]) => void
  onRequestClose: () => void
  onToggleChrome?: () => void
  theme?: ReaderTheme
  fontFamily?: FontFamilyKey
  fontFamilyDeclarations?: FontFamilyDeclaration[]
  fontSize?: number
  lineHeight?: number
  paddingX?: number
  textAlign?: TextAlignment
  columnCount?: ColumnCount
  language?: string
}

const ReadiumReflowReader = forwardRef<
  ReadiumReflowReaderRef,
  ReadiumReflowReaderProps
>(function ReadiumReflowReader(
  {
    epubPath,
    initialLocator,
    onStateChange,
    onPositionsReady,
    onPublicationLanguagesReady,
    onTocReady,
    onToggleChrome,
    theme = "paper",
    fontFamily = "default",
    fontFamilyDeclarations,
    fontSize = 18,
    lineHeight = 1.85,
    paddingX = 20,
    textAlign = "auto",
    columnCount = "auto",
    language,
  },
  ref,
) {
  const readiumRef = useRef<ReadiumViewRef>(null)
  const tocItemsRef = useRef<ReaderTocItem[]>([])
  const selectedTocItemRef = useRef<ReaderTocItem | null>(null)
  const positionsRef = useRef<Locator[]>([])
  const currentLocatorRef = useRef<Locator | null>(null)
  const chapterTitleRef = useRef("")
  const publicationReadySeqRef = useRef(0)

  useImperativeHandle(
    ref,
    () => ({
      goTo: (locator: Locator, tocItem?: ReaderTocItem) => {
        selectedTocItemRef.current = tocItem ?? null
        readiumRef.current?.goTo(locator)
      },
    }),
    [],
  )

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
        language,
      ),
    [
      theme,
      fontFamily,
      fontSize,
      lineHeight,
      paddingX,
      textAlign,
      columnCount,
      language,
    ],
  )

  const handlePublicationReady = useCallback(
    (event: PublicationReadyEvent) => {
      const publicationSeq = publicationReadySeqRef.current + 1
      publicationReadySeqRef.current = publicationSeq

      positionsRef.current = event.positions
      onPositionsReady?.(event.positions)
      const tocItems = linksToTocItems(event.tableOfContents, event.positions)
      tocItemsRef.current = tocItems
      onTocReady(tocItems)
      onPublicationLanguagesReady?.(event.metadata.language ?? [])

      const totalPages = Math.max(1, event.positions.length)

      // Resolve initial position using position/progression from stored locator,
      // then find the matching native locator from positions list.
      let startLocator: Locator | undefined = event.positions[0]
      if (currentLocatorRef.current) {
        const resolved = resolveNativeLocator(
          event.positions,
          currentLocatorRef.current,
        )
        if (resolved) startLocator = resolved
      } else if (initialLocator) {
        const resolved = resolveNativeLocator(event.positions, initialLocator)
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
        ((startLocator
          ? resolveReaderToc({
              toc: tocItems,
              positions: event.positions,
              locator: startLocator,
              fallbackTitle: chapterTitleRef.current || event.metadata.title,
            }).title
          : null) ??
          chapterTitleRef.current) ||
        event.metadata.title
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

      void readiumPublication
        .getContent(event.publicationId)
        .then((contentResult) => {
          if (publicationReadySeqRef.current !== publicationSeq) return

          const result = contentResult as ContentResult & {
            content?: ContentResult["utterances"]
          }
          const utterances = result.utterances ?? result.content ?? []
          const enhancedTocItems = enhanceTocItemsWithContentLocators(
            tocItemsRef.current,
            utterances,
          )
          if (enhancedTocItems === tocItemsRef.current) return

          tocItemsRef.current = enhancedTocItems
          onTocReady(enhancedTocItems)

          const currentLocator = currentLocatorRef.current
          if (!currentLocator) return

          const enhancedTitle =
            resolveReaderToc({
              toc: enhancedTocItems,
              positions: positionsRef.current,
              locator: currentLocator,
              fallbackTitle: chapterTitleRef.current,
            }).title ?? chapterTitleRef.current
          if (enhancedTitle === chapterTitleRef.current) return

          const positions = positionsRef.current
          const totalPages = Math.max(1, positions.length)
          const currentPage = positionIndexForLocator(positions, currentLocator)
          const progression =
            currentLocator.locations?.totalProgression ??
            currentLocator.locations?.progression ??
            0
          chapterTitleRef.current = enhancedTitle
          onStateChange({
            ready: true,
            currentPage,
            totalPages,
            progress: Math.round(progression * PROGRESS_PERCENT_MULTIPLIER),
            chapterTitle: enhancedTitle,
            loading: false,
            error: null,
            locator: currentLocator,
          })
        })
        .catch(() => {
          // Content locators refine TOC matching only; reading must continue if
          // the optional content pass is unavailable for a publication.
        })
    },
    [
      initialLocator,
      onPositionsReady,
      onPublicationLanguagesReady,
      onTocReady,
      onStateChange,
    ],
  )

  const emitLocationState = useCallback(
    (locator: Locator, selectedToc: ReaderTocItem | null) => {
      const positions = positionsRef.current
      const totalPages = Math.max(1, positions.length)
      const progression =
        locator.locations?.totalProgression ??
        locator.locations?.progression ??
        0
      const progress = Math.round(progression * PROGRESS_PERCENT_MULTIPLIER)

      const tocItems = tocItemsRef.current
      const stateLocator = locatorWithTocSelection(locator, selectedToc)
      currentLocatorRef.current = stateLocator

      const currentPage = positionIndexForLocator(positions, stateLocator)

      const chapterTitle =
        resolveReaderToc({
          toc: tocItems,
          positions,
          locator: stateLocator,
          selectedTocItem: selectedToc,
          fallbackTitle:
            stateLocator.title ?? locator.title ?? chapterTitleRef.current,
        }).title ?? chapterTitleRef.current
      chapterTitleRef.current = chapterTitle

      onStateChange({
        ready: true,
        currentPage,
        totalPages,
        progress,
        chapterTitle,
        loading: false,
        error: null,
        locator: stateLocator,
      })
    },
    [onStateChange],
  )

  const handleLocationChange = useCallback(
    (locator: Locator) => {
      const selectedToc = selectedTocItemRef.current
      selectedTocItemRef.current = null
      emitLocationState(locator, selectedToc)
    },
    [emitLocationState],
  )

  return (
    <View style={styles.reader}>
      <ReadiumView
        ref={readiumRef}
        file={file}
        preferences={preferences}
        fontFamilyDeclarations={fontFamilyDeclarations}
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
