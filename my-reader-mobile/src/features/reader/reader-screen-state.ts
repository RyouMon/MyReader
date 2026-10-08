import type { Locator, ReaderCapabilities } from "@my-reader/readium"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import type { useReaderSearch } from "./hooks/use-reader-search"
import { ChromeState } from "./components/reader/chrome/chrome-state"
import { readerBookmarkButtonVisible } from "./components/reader/chrome/ReaderBookmarkButton"
import { readerPositionLabelVisible } from "./components/reader/chrome/ReaderPositionLabel"
import type { ReaderState, ReaderTocItem } from "./components/reader/types"
import { resolveReaderToc } from "./components/reader/reader-toc-resolver"

export function readerChromeState({
  chromeState,
  readerState,
  isReflowSurface,
  isFixedSurface,
  isCurrentLocationBookmarked,
  bookmarkPending,
  bookmarksLoading,
  bookmarkError,
  ttsPlayerExpanded,
  hasTtsState,
  toc,
}: {
  chromeState: ChromeState
  readerState: ReaderState | null
  isReflowSurface: boolean
  isFixedSurface: boolean
  isCurrentLocationBookmarked: boolean
  bookmarkPending: boolean
  bookmarksLoading: boolean
  bookmarkError: boolean
  ttsPlayerExpanded: boolean
  hasTtsState: boolean
  toc: ReaderTocItem[]
}) {
  const {
    ready: readerReady,
    locator: currentLocator,
    currentPage,
    totalPages,
    chapterTitle: currentChapterTitle,
  } = readerState ?? {}
  const chromeActive = chromeState >= ChromeState.Chrome
  const moreButtonVisible =
    chromeState === ChromeState.Chrome ||
    chromeState === ChromeState.NavigationSheet ||
    chromeState === ChromeState.AnnotationsSheet ||
    chromeState === ChromeState.SettingsSheet ||
    chromeState === ChromeState.SearchSheet
  const bookmarkButtonVisible = readerBookmarkButtonVisible(
    chromeState,
    isCurrentLocationBookmarked,
  )
  const bookmarkActionDisabled =
    bookmarkPending ||
    bookmarksLoading ||
    Boolean(bookmarkError) ||
    !currentLocator
  const ttsControlsExpanded = ttsPlayerExpanded || hasTtsState
  const positionLabelVisible = readerPositionLabelVisible(
    chromeActive,
    totalPages,
    ttsControlsExpanded,
  )
  const ttsAvailable = isReflowSurface && Boolean(readerReady)
  const ttsPlayerVisible = ttsAvailable && moreButtonVisible
  const tocResolution = resolveReaderToc({
    toc,
    locator: currentLocator,
    currentPage: currentPage,
    currentTitle: currentChapterTitle,
  })
  const activeTocIndex = tocResolution.index
  const chapterLabelTitle =
    tocResolution.title?.trim() || currentChapterTitle?.trim() || null
  const showChapterLabel =
    Boolean(chapterLabelTitle) &&
    chromeActive &&
    (isReflowSurface || isFixedSurface)

  return {
    moreButtonVisible,
    bookmarkButtonVisible,
    bookmarkActionDisabled,
    ttsControlsExpanded,
    positionLabelVisible,
    ttsAvailable,
    ttsPlayerVisible,
    activeTocIndex,
    chapterLabelTitle,
    showChapterLabel,
  }
}

import { isReadyBookLoadForRequest } from "@/src/hooks/book-load-identity"
import type { LoadState } from "@/src/hooks/use-book-loader"

export function readerBookContext(
  loadState: LoadState,
  activeLibraryId: string | null,
  id: string | undefined,
  formatParam: string | undefined,
) {
  const activeLoadState =
    loadState.status === "ready" &&
    isReadyBookLoadForRequest(loadState, activeLibraryId, id, formatParam)
      ? loadState
      : null
  const isReflowReady = activeLoadState?.layoutMode === "reflowable"
  const fallbackLanguages = activeLoadState?.languages ?? []
  return {
    activeLoadState,
    isReflowReady,
    fallbackLanguages,
    bookId: activeLoadState?.bookId ?? null,
    format: activeLoadState?.format ?? null,
    closeTransitionFormat: activeLoadState?.format ?? formatParam,
  }
}

export function readerSearchState(
  ready: boolean | undefined,
  search: Pick<ReturnType<typeof useReaderSearch>, "capabilities" | "locators">,
  decoration: { publicationKey: string; locator: ReaderLocator } | null,
  publicationKey: string,
) {
  return {
    searchAvailable: Boolean(ready && search.capabilities?.searchable),
    activeSearchLocator:
      decoration?.publicationKey === publicationKey &&
      search.locators.includes(decoration.locator)
        ? decoration.locator
        : null,
  }
}

export function readingSessionLocation(
  locator: Locator | undefined,
  currentPage: number | undefined,
) {
  return locator
    ? JSON.stringify([locator.href, locator.locations ?? null])
    : (currentPage ?? null)
}

export function supportsReaderAnnotations(
  enabled: boolean,
  capabilities: ReaderCapabilities,
) {
  return (
    enabled &&
    capabilities.canSelectText &&
    capabilities.canDecorate &&
    capabilities.supportedDecorationStyles.includes("highlight")
  )
}
