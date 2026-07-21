import { Locator, LocatorLocations, type Publication } from "@readium/shared"
import { Settings } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useTheme } from "@/components/AppThemeProvider"
import type { ReadiumBookmarkRow } from "@/components/reader/readium/ReadiumBookmarkList"
import { ReadiumBookmarkPanel } from "@/components/reader/readium/ReadiumBookmarkPanel"
import {
  ReadiumTocPanel,
  type ReadiumTocRow,
} from "@/components/reader/readium/ReadiumTocPanel"
import { FixedLayoutNativePager } from "@/components/reader/shared/FixedLayoutNativePager"
import { FixedLayoutSettingsPanel } from "@/components/reader/shared/FixedLayoutSettingsPanel"
import { ReaderBottomStatusBar } from "@/components/reader/shared/ReaderBottomStatusBar"
import { ReaderChromeShell } from "@/components/reader/shared/ReaderChromeShell"
import { ReaderPaginateEdgeTurnStrips } from "@/components/reader/shared/ReaderPaginateEdgeTurnStrips"
import {
  READER_SETTINGS_CONTENT_CLASS,
  ReaderSidePanelFrame,
  ReaderSidePanelHeader,
  ReaderSidePanelScrollArea,
} from "@/components/reader/shared/ReaderSidePanelChrome"
import { useFixedLayoutPanzoom } from "@/hooks/reader/useFixedLayoutPanzoom"
import { useLocatorProgressSync } from "@/hooks/reader/useLocatorProgressSync"
import { useReaderBookmarks } from "@/hooks/reader/useReaderBookmarks"
import { useReaderPaginateEdgeHover } from "@/hooks/reader/useReaderPaginateEdgeHover"
import { useReaderPanels } from "@/hooks/reader/useReaderPanels"
import { useReadingChrome } from "@/hooks/reader/useReadingChrome"
import {
  displayProgressionForPosition,
  positionForDisplayProgressPercent,
} from "@/lib/readingProgress"
import { divinaPageForBookmark } from "@/lib/readium/bookmarks"
import {
  consumeWheelPageTurn,
  createWheelPageTurnState,
} from "@/lib/readium/fixedLayoutGestures"
import {
  buildFixedLayoutSpreads,
  spreadIndexForPage,
} from "@/lib/readium/fixedLayoutPagination"
import { resolveFixedBackgroundColor } from "@/lib/readium/fixedLayoutPreferences"
import { useAppUiStore } from "@/stores/appUiStore"

export type ReadiumDivinaReaderProps = {
  bookTitle: string
  publication: Publication
  initialSavedLocator: Locator | null
  libraryId: string | null
  bookId: number
  format: string
  progressSyncEnabled: boolean
}

function initialPage(
  initialSavedLocator: Locator | null,
  positions: readonly Locator[],
): number {
  const position = initialSavedLocator?.locations?.position
  if (
    typeof position === "number" &&
    position >= 1 &&
    position <= positions.length
  ) {
    return position
  }
  const href = initialSavedLocator?.href
  const index = href
    ? positions.findIndex((locator) => locator.href === href)
    : -1
  return index >= 0 ? index + 1 : 1
}

export function ReadiumDivinaReader({
  bookTitle,
  publication,
  initialSavedLocator,
  libraryId,
  bookId,
  format,
  progressSyncEnabled,
}: ReadiumDivinaReaderProps) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const wheelTurnRef = useRef(createWheelPageTurnState())
  const {
    tocOpen,
    bookmarksOpen,
    settingsOpen,
    toggleToc,
    toggleBookmarks,
    toggleSettings,
    closePanels,
  } = useReaderPanels()
  const { readerRootRef, chromeVisible, showChrome, scheduleChromeHide } =
    useReadingChrome(false, tocOpen || bookmarksOpen || settingsOpen)
  const [landscape, setLandscape] = useState(true)
  const background = useAppUiStore((state) => state.fixedLayout.background)
  const direction = useAppUiStore((state) => state.fixedLayout.direction)
  const spreadMode = useAppUiStore((state) => state.fixedLayout.spreadMode)
  const backgroundColor = resolveFixedBackgroundColor(background, resolvedTheme)

  const positions = useMemo(() => {
    const items = publication.readingOrder.items
    return items.map(
      (item, index) =>
        new Locator({
          href: item.href,
          type: item.type ?? "image/jpeg",
          title: item.title,
          locations: new LocatorLocations({
            position: index + 1,
            progression: index / Math.max(1, items.length - 1),
          }),
        }),
    )
  }, [publication])
  const [currentPage, setCurrentPage] = useState(() =>
    initialPage(initialSavedLocator, positions),
  )
  const doublePage =
    spreadMode === "double" || (spreadMode === "auto" && landscape)
  const spreads = useMemo(
    () => buildFixedLayoutSpreads(positions.length, doublePage),
    [doublePage, positions.length],
  )
  const currentSpreadIndex = spreadIndexForPage(spreads, currentPage)
  const currentLocator = positions[currentPage - 1] ?? positions[0] ?? null
  const readerBookmarks = useReaderBookmarks({
    libraryId,
    bookId,
    format,
    currentLocator,
  })

  const tocRows: ReadiumTocRow[] = useMemo(() => {
    return publication.readingOrder.items.map((item, index) => ({
      key: item.href,
      depth: 0,
      title:
        item.title?.trim() ||
        t("reader.pageCount", { current: index + 1, total: "" }).replace(
          " / ",
          "",
        ),
      href: item.href,
      type: item.type,
    }))
  }, [publication, t])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setLandscape((current) => {
        const next = width > height
        return current === next ? current : next
      })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const goToPage = useCallback(
    (pageNumber: number) => {
      const clamped = Math.max(1, Math.min(positions.length, pageNumber))
      setCurrentPage(clamped)
    },
    [positions.length],
  )
  const goToSpread = useCallback(
    (spreadIndex: number) => {
      const page = spreads[spreadIndex]?.[0]
      if (page) goToPage(page)
    },
    [goToPage, spreads],
  )
  const onBookmarkSelect = useCallback(
    (bookmark: ReadiumBookmarkRow) => {
      const page = divinaPageForBookmark(bookmark.locator, positions)
      if (page !== null) goToPage(page)
      closePanels()
    },
    [closePanels, goToPage, positions],
  )
  const onPrevious = useCallback(() => {
    goToSpread(Math.max(0, currentSpreadIndex - 1))
  }, [currentSpreadIndex, goToSpread])
  const onNext = useCallback(() => {
    goToSpread(Math.min(spreads.length - 1, currentSpreadIndex + 1))
  }, [currentSpreadIndex, goToSpread, spreads.length])

  const handleUnzoomedWheel = useCallback(
    (event: WheelEvent): boolean => {
      const horizontalTrackpad =
        event.deltaMode === WheelEvent.DOM_DELTA_PIXEL &&
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
      if (horizontalTrackpad) return false

      const turn = consumeWheelPageTurn(
        wheelTurnRef.current,
        {
          clientX: event.clientX,
          clientY: event.clientY,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          deltaMode: event.deltaMode,
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaZ: event.deltaZ,
          timeStamp: event.timeStamp,
        },
        {
          width: scrollerRef.current?.clientWidth ?? 1,
          height: scrollerRef.current?.clientHeight ?? 1,
        },
      )
      if (!turn) return true
      const turnDirection =
        turn.axis === "x" && direction === "rtl"
          ? -turn.direction
          : turn.direction
      if (turnDirection > 0) onNext()
      else onPrevious()
      return true
    },
    [direction, onNext, onPrevious],
  )
  const { zoomed } = useFixedLayoutPanzoom({
    scrollerRef,
    targetKey: `${currentSpreadIndex}-${direction}-${doublePage}`,
    maxScale: 6,
    onUnzoomedWheel: handleUnzoomedWheel,
  })

  const onTocSelect = useCallback(
    (row: ReadiumTocRow) => {
      const index = publication.readingOrder.items.findIndex(
        (item) => item.href === row.href.split("#")[0],
      )
      if (index >= 0) goToPage(index + 1)
      closePanels()
    },
    [closePanels, goToPage, publication],
  )
  const onProgressSeek = useCallback(
    (progress: number) => {
      if (positions.length === 0) return
      const page = positionForDisplayProgressPercent(progress, positions.length)
      if (page != null) goToPage(page)
    },
    [goToPage, positions.length],
  )
  const resolveProgressCommit = useCallback(
    (progress: number) => {
      const page = positionForDisplayProgressPercent(progress, positions.length)
      return page == null
        ? 0
        : (displayProgressionForPosition(page, positions.length) ?? 0) * 100
    },
    [positions.length],
  )
  const getProgressPreview = useCallback(
    (nextProgress: number) => {
      const total = Math.max(1, positions.length)
      const page = positionForDisplayProgressPercent(nextProgress, total) ?? 1
      const label = t("reader.pageCount", { current: page, total })
      return {
        chapterTitle: tocRows[page - 1]?.title ?? label,
        label,
      }
    },
    [positions.length, t, tocRows],
  )

  useLocatorProgressSync({
    enabled: progressSyncEnabled && Boolean(libraryId) && format.length > 0,
    libraryId,
    bookId,
    format,
    currentLocator,
    displayProgression:
      displayProgressionForPosition(currentPage, positions.length) ?? null,
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        direction === "rtl" ? onPrevious() : onNext()
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        direction === "rtl" ? onNext() : onPrevious()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [direction, onNext, onPrevious])

  const isRtl = direction === "rtl"
  const edgeTurnActive =
    positions.length > 0 && !tocOpen && !bookmarksOpen && !settingsOpen
  const { nearLeft, nearRight } = useReaderPaginateEdgeHover(
    edgeTurnActive,
    readerRootRef,
  )

  return (
    <ReaderChromeShell
      readerRootRef={readerRootRef}
      chromeVisible={chromeVisible}
      showChrome={showChrome}
      scheduleChromeHide={scheduleChromeHide}
      panelsOpen={tocOpen || bookmarksOpen || settingsOpen}
      onClosePanels={closePanels}
      readerMode="fixed-layout"
      readerBackgroundColor={backgroundColor}
      topBar={{
        bookTitle,
        chapterTitle: "",
        bookmarked: readerBookmarks.bookmarked,
        bookmarkDisabled: !readerBookmarks.canToggle,
        tocOpen,
        bookmarksOpen,
        settingsOpen,
        onToggleToc: toggleToc,
        onToggleBookmarks: toggleBookmarks,
        onToggleBookmark: () => void readerBookmarks.toggleCurrentBookmark(),
        onToggleSettings: toggleSettings,
      }}
      tocPanel={
        <ReadiumTocPanel
          visible={tocOpen}
          rows={tocRows}
          activeKey={currentLocator?.href ?? null}
          onSelect={onTocSelect}
          onClose={closePanels}
        />
      }
      bookmarkPanel={
        <ReadiumBookmarkPanel
          visible={bookmarksOpen}
          bookmarks={readerBookmarks.bookmarks}
          activeBookmarkLocatorKey={readerBookmarks.currentBookmarkLocatorKey}
          loading={readerBookmarks.loading}
          mutating={readerBookmarks.mutating}
          error={readerBookmarks.loadError}
          onRetry={readerBookmarks.retry}
          onSelect={onBookmarkSelect}
          onDelete={readerBookmarks.deleteBookmark}
          onClose={closePanels}
        />
      }
      settingsPanel={
        <ReaderSidePanelFrame visible={settingsOpen} side="right">
          <ReaderSidePanelHeader
            title={t("reader.settingsShort")}
            icon={Settings}
            onClose={closePanels}
          />
          <ReaderSidePanelScrollArea className={READER_SETTINGS_CONTENT_CLASS}>
            <FixedLayoutSettingsPanel showPageDirection={false} />
          </ReaderSidePanelScrollArea>
        </ReaderSidePanelFrame>
      }
      edgeTurnOverlays={
        <ReaderPaginateEdgeTurnStrips
          direction={direction}
          showPrev={isRtl ? nearRight : nearLeft}
          showNext={isRtl ? nearLeft : nearRight}
          onPrev={onPrevious}
          onNext={onNext}
          prevLabel={t("reader.prevPage")}
          nextLabel={t("reader.nextPage")}
        />
      }
      bottomStatusBar={
        <ReaderBottomStatusBar
          visible={chromeVisible}
          direction={direction}
          emphasizePositionLabel
          leftText={
            positions.length > 0
              ? t("reader.pageCount", {
                  current: currentPage,
                  total: positions.length,
                })
              : undefined
          }
          progress={
            (displayProgressionForPosition(currentPage, positions.length) ??
              0) * 100
          }
          getProgressPreview={getProgressPreview}
          resolveProgressCommit={resolveProgressCommit}
          onProgressChange={onProgressSeek}
          onProgressStepBackward={onPrevious}
          onProgressStepForward={onNext}
        />
      }
      main={
        <div
          ref={containerRef}
          className="relative min-h-0 min-w-0 w-full flex-1 basis-0 overflow-hidden"
          style={{ backgroundColor }}
        >
          <FixedLayoutNativePager
            scrollerRef={scrollerRef}
            spreads={spreads}
            currentSpreadIndex={currentSpreadIndex}
            direction={direction}
            zoomed={zoomed}
            onSpreadIndexChange={goToSpread}
            renderSpread={(spread, _logicalIndex, active) => {
              const pages = direction === "rtl" ? [...spread].reverse() : spread
              return (
                <div
                  data-fixed-layout-panzoom-target
                  className="flex h-full w-full min-w-0 items-center justify-center"
                >
                  {pages.map((page) => {
                    const item = publication.readingOrder.items[page - 1]
                    return item ? (
                      <img
                        key={item.href}
                        src={item.href}
                        alt=""
                        draggable={false}
                        decoding="async"
                        loading={active ? "eager" : "lazy"}
                        className={`block h-full min-w-0 object-contain select-none ${spread.length > 1 ? "w-1/2" : "w-full"}`}
                      />
                    ) : null
                  })}
                </div>
              )
            }}
          />
        </div>
      }
    />
  )
}
