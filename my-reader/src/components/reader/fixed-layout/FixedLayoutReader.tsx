import { useCallback, useMemo, useRef, useState } from "react"

import { useAppUiStore } from "@/stores/appUiStore"
import { ReaderPaginateEdgeTurnStrips } from "@/components/reader/shared/ReaderPaginateEdgeTurnStrips"
import { ReaderPanelsBackdrop } from "@/components/reader/shared/ReaderPanelsBackdrop"
import { ReaderTopBar } from "@/components/reader/shared/ReaderTopBar"
import {
  useFixedLayoutScrollSpreadGuard,
  useFixedLayoutSpreadNeighborPage,
} from "@/hooks/reader/useFixedLayoutSpreadEffects"
import { useReaderBookmark } from "@/hooks/reader/useReaderBookmark"
import { useReaderBookProgressSeek } from "@/hooks/reader/useReaderBookProgressSeek"
import { useReaderKeyboardNavigation } from "@/hooks/reader/useReaderKeyboardNavigation"
import { useReaderPaginateEdgeTurn } from "@/hooks/reader/useReaderPaginateEdgeTurn"
import { useReaderPanels } from "@/hooks/reader/useReaderPanels"
import { useReadingChrome } from "@/hooks/reader/useReadingChrome"
import type { ImageChapterData, TocItem } from "@/lib/rendition"
import type {
  FixedLayoutSettings,
  FixedLayoutTocEntry,
  ReaderSurfaceProps,
} from "../types"
import { FixedLayoutBottomBar } from "./FixedLayoutBottomBar"
import { FixedLayoutScrollViewport } from "./FixedLayoutScrollViewport"
import { FixedLayoutSettingsPanel } from "./FixedLayoutSettingsPanel"
import { FixedLayoutTocPanel } from "./FixedLayoutTocPanel"
import { FixedLayoutViewport } from "./FixedLayoutViewport"

export type {
  DisplayMode,
  FixedLayoutSettings,
  ReadingDirection,
  ZoomMode,
} from "../types"

export { DEFAULT_FIXED_LAYOUT_SETTINGS } from "../types"

export function FixedLayoutReader({ bookTitle, reader }: ReaderSurfaceProps) {
  const panels = useReaderPanels()
  const bookmark = useReaderBookmark()
  const { readerRootRef, chromeVisible, hideChrome } = useReadingChrome(false)
  const fixedLayoutScrollRef = useRef<HTMLDivElement>(null)
  const [scrollBookProgress, setScrollBookProgress] = useState(0)

  const settings = useAppUiStore((s) => s.fixedLayout)
  const patchFixedLayout = useAppUiStore((s) => s.patchFixedLayout)
  const [turnDirection, setTurnDirection] = useState<
    "forward" | "backward" | null
  >(null)
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [spreadPage, setSpreadPage] = useState<ImageChapterData | null>(null)

  const currentPage = reader.chapter as ImageChapterData | null
  const currentIndex = reader.curChapter
  const totalPages = reader.totalChapters

  const getChapter = reader.getChapter

  useFixedLayoutScrollSpreadGuard(
    patchFixedLayout,
    settings.readingLayout,
    settings.displayMode,
  )
  useFixedLayoutSpreadNeighborPage(
    settings.readingLayout,
    settings.displayMode,
    currentIndex,
    totalPages,
    getChapter,
    setSpreadPage,
  )

  const animateTurn = useCallback((dir: "forward" | "backward") => {
    if (turnTimer.current) clearTimeout(turnTimer.current)
    setTurnDirection(dir)
    turnTimer.current = setTimeout(() => setTurnDirection(null), 300)
  }, [])

  const goToPage = useCallback(
    (index: number) => {
      if (index < 0 || index >= totalPages) return
      reader.gotoChapter(index)
    },
    [reader, totalPages],
  )

  const scrollByViewport = useCallback((dir: 1 | -1) => {
    const el = fixedLayoutScrollRef.current
    if (!el) return
    const step = Math.round(el.clientHeight * 0.92)
    el.scrollBy({ top: dir * step, behavior: "smooth" })
  }, [])

  const nextPage = useCallback(() => {
    if (settings.readingLayout === "scroll") {
      scrollByViewport(1)
      return
    }
    const step = settings.displayMode === "spread" ? 2 : 1
    const next = currentIndex + step
    if (next < totalPages) {
      animateTurn("forward")
      goToPage(next)
    }
  }, [
    settings.readingLayout,
    settings.displayMode,
    currentIndex,
    totalPages,
    animateTurn,
    goToPage,
    scrollByViewport,
  ])

  const prevPage = useCallback(() => {
    if (settings.readingLayout === "scroll") {
      scrollByViewport(-1)
      return
    }
    const step = settings.displayMode === "spread" ? 2 : 1
    const prev = currentIndex - step
    if (prev >= 0) {
      animateTurn("backward")
      goToPage(prev)
    }
  }, [
    settings.readingLayout,
    settings.displayMode,
    currentIndex,
    animateTurn,
    goToPage,
    scrollByViewport,
  ])

  const paginateKeyboardPrev = useCallback(() => {
    if (settings.direction === "rtl") nextPage()
    else prevPage()
  }, [settings.direction, nextPage, prevPage])

  const paginateKeyboardNext = useCallback(() => {
    if (settings.direction === "rtl") prevPage()
    else nextPage()
  }, [settings.direction, nextPage, prevPage])

  useReaderKeyboardNavigation({
    readingLayout: settings.readingLayout,
    scrollContainerRef: fixedLayoutScrollRef,
    scrollStepViewportRatio: 0.92,
    onPaginatePrev: paginateKeyboardPrev,
    onPaginateNext: paginateKeyboardNext,
    panels,
    hideChrome,
    fullscreenHotkey: true,
  })

  const { nearLeft, nearRight } = useReaderPaginateEdgeTurn(
    settings.readingLayout === "paginate",
    readerRootRef,
  )

  const handleSelectPage = useCallback(
    (index: number) => {
      goToPage(index)
      panels.closePanels()
      if (settings.readingLayout === "scroll") {
        requestAnimationFrame(() => {
          fixedLayoutScrollRef.current
            ?.querySelector(`[data-index="${index}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        })
      }
    },
    [goToPage, panels, settings.readingLayout],
  )

  const handleBookProgressSeek = useReaderBookProgressSeek({
    readingLayout: settings.readingLayout,
    scrollContainerRef: fixedLayoutScrollRef,
    paginateUnitCount: totalPages,
    seekPaginate: goToPage,
  })

  const updateSettings = useCallback(
    (patch: Partial<FixedLayoutSettings>) => patchFixedLayout(patch),
    [patchFixedLayout],
  )

  const pageTitle = useMemo(() => {
    if (settings.displayMode === "spread" && currentIndex + 1 < totalPages) {
      return `第 ${currentIndex + 1}-${currentIndex + 2} / ${totalPages} 页`
    }
    return `第 ${currentIndex + 1} / ${totalPages} 页`
  }, [settings.displayMode, currentIndex, totalPages])

  const paginateProgress =
    totalPages > 0 ? Math.round(((currentIndex + 1) / totalPages) * 100) : 0
  const barProgress =
    settings.readingLayout === "scroll" ? scrollBookProgress : paginateProgress

  const tocEntries = useMemo(
    () => buildTocEntries(reader.toc, totalPages),
    [reader.toc, totalPages],
  )

  return (
    <div
      ref={readerRootRef}
      data-reader-mode="fixed-layout"
      className="relative flex size-full flex-col overflow-hidden bg-viewer-bg"
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        {settings.readingLayout === "paginate" && (
          <ReaderPaginateEdgeTurnStrips
            nearLeft={nearLeft}
            nearRight={nearRight}
            onPrev={paginateKeyboardPrev}
            onNext={paginateKeyboardNext}
            prevLabel={settings.direction === "rtl" ? "下一页" : "上一页"}
            nextLabel={settings.direction === "rtl" ? "上一页" : "下一页"}
          />
        )}
        {settings.readingLayout === "scroll" ? (
          <FixedLayoutScrollViewport
            totalPages={totalPages}
            getChapter={getChapter}
            scrollRef={fixedLayoutScrollRef}
            brightness={settings.brightness}
            zoomMode={settings.zoomMode}
            onScrollProgress={setScrollBookProgress}
          />
        ) : (
          <FixedLayoutViewport
            page={currentPage}
            spreadPage={spreadPage}
            displayMode={settings.displayMode}
            direction={settings.direction}
            zoomMode={settings.zoomMode}
            brightness={settings.brightness}
            pageGap={settings.pageGap}
            turnDirection={turnDirection}
            loading={reader.loading}
          />
        )}
      </div>

      <ReaderTopBar
        visible={chromeVisible}
        bookTitle={bookTitle}
        chapterTitle={pageTitle}
        bookmarked={bookmark.bookmarked}
        onToggleToc={panels.toggleToc}
        onToggleBookmark={bookmark.toggleBookmark}
        onToggleSettings={panels.toggleSettings}
      />

      <FixedLayoutBottomBar
        visible={chromeVisible}
        currentPage={currentIndex}
        totalPages={totalPages}
        bookProgress={barProgress}
        readingLayout={settings.readingLayout}
        onReadingLayoutChange={(l) => updateSettings({ readingLayout: l })}
        onBookProgressSeek={handleBookProgressSeek}
        displayMode={settings.displayMode}
        onPrevPage={prevPage}
        onNextPage={nextPage}
        onDisplayModeChange={(mode) => updateSettings({ displayMode: mode })}
      />

      <ReaderPanelsBackdrop
        open={panels.tocOpen || panels.settingsOpen}
        onClose={panels.closePanels}
      />

      <FixedLayoutTocPanel
        visible={panels.tocOpen}
        entries={tocEntries}
        currentPage={currentIndex}
        totalPages={totalPages}
        onSelectPage={handleSelectPage}
        getPageImage={reader.getChapter}
      />

      <FixedLayoutSettingsPanel
        visible={panels.settingsOpen}
        settings={settings}
        onSettingsChange={updateSettings}
      />
    </div>
  )
}

function buildTocEntries(
  toc: TocItem[],
  totalPages: number,
): FixedLayoutTocEntry[] {
  if (toc.length > 0) {
    return flattenFixedLayoutToc(toc)
  }
  if (totalPages <= 0) return []
  return Array.from({ length: totalPages }, (_, i) => ({
    label: `第 ${i + 1} 页`,
    pageIndex: i,
  }))
}

function flattenFixedLayoutToc(items: TocItem[]): FixedLayoutTocEntry[] {
  const out: FixedLayoutTocEntry[] = []
  for (const t of items) {
    out.push({
      label: t.label || `第 ${t.index + 1} 页`,
      pageIndex: t.index,
    })
    if (t.subitems?.length) out.push(...flattenFixedLayoutToc(t.subitems))
  }
  return out
}
