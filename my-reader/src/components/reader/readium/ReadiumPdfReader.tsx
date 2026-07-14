import type { Locator } from "@readium/shared"
import { Settings } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useTheme } from "@/components/AppThemeProvider"
import {
  type ReadiumBookmarkRow,
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
  deserializeReaderBookmarkLocator,
  pdfPageForBookmark,
} from "@/lib/readium/bookmarks"
import {
  consumeWheelPageTurn,
  createWheelPageTurnState,
  wheelZoomFactor,
  zoomAtPoint,
} from "@/lib/readium/fixedLayoutGestures"
import {
  buildFixedLayoutSpreads,
  spreadIndexForPage,
} from "@/lib/readium/fixedLayoutPagination"
import { resolveFixedBackgroundColor } from "@/lib/readium/fixedLayoutPreferences"
import { PdfNavigator } from "@/lib/readium/PdfNavigator"
import { useAppUiStore } from "@/stores/appUiStore"

export type ReadiumPdfReaderProps = {
  bookTitle: string
  fileUrl: string
  initialSavedLocator: Locator | null
  libraryId: string | null
  bookId: number
  format: string
  progressSyncEnabled: boolean
}

export function ReadiumPdfReader({
  bookTitle,
  fileUrl,
  initialSavedLocator,
  libraryId,
  bookId,
  format,
  progressSyncEnabled,
}: ReadiumPdfReaderProps) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const horizontalScrollerRef = useRef<HTMLDivElement>(null)
  const verticalScrollRef = useRef<HTMLDivElement>(null)
  const verticalScrollPageChangeRef = useRef(false)
  const verticalScaleRef = useRef(1)
  const wheelTurnRef = useRef(createWheelPageTurnState())
  const navRef = useRef<PdfNavigator | null>(null)
  const { tocOpen, settingsOpen, toggleToc, toggleSettings, closePanels } =
    useReaderPanels()
  const { readerRootRef, chromeVisible, showChrome, scheduleChromeHide } =
    useReadingChrome(false, tocOpen || settingsOpen)
  const [initError, setInitError] = useState<string | null>(null)
  const [readiumNavReady, setReadiumNavReady] = useState(false)
  const [currentLocator, setCurrentLocator] = useState<Locator | null>(null)
  const readerBookmarks = useReaderBookmarks({
    libraryId,
    bookId,
    format,
    currentLocator,
  })
  const [totalPages, setTotalPages] = useState(0)
  const [landscape, setLandscape] = useState(true)
  const background = useAppUiStore((state) => state.fixedLayout.background)
  const navigationMode = useAppUiStore(
    (state) => state.fixedLayout.navigationMode,
  )
  const spreadMode = useAppUiStore((state) => state.fixedLayout.spreadMode)
  const direction = useAppUiStore((state) => state.fixedLayout.direction)
  const backgroundColor = resolveFixedBackgroundColor(background, resolvedTheme)
  const pageNum = currentLocator?.locations?.position ?? 1
  const doublePage =
    navigationMode === "horizontal" &&
    (spreadMode === "double" || (spreadMode === "auto" && landscape))
  const spreads = useMemo(
    () => buildFixedLayoutSpreads(totalPages, doublePage),
    [doublePage, totalPages],
  )
  const currentSpreadIndex = spreadIndexForPage(spreads, pageNum)

  const tocRows: ReadiumTocRow[] = useMemo(() => {
    if (totalPages < 1) return []
    return Array.from({ length: totalPages }, (_, index) => ({
      key: `page-${index + 1}`,
      depth: 0,
      title: t("reader.pageCount", {
        current: index + 1,
        total: "",
      }).replace(" / ", ""),
      href: `page-${index + 1}`,
      type: "application/pdf",
    }))
  }, [t, totalPages])

  useLocatorProgressSync({
    enabled:
      progressSyncEnabled &&
      Boolean(libraryId) &&
      format.length > 0 &&
      totalPages > 0,
    libraryId,
    bookId,
    format,
    currentLocator,
  })

  useEffect(() => {
    let cancelled = false
    const nav = new PdfNavigator(fileUrl, {
      positionChanged: (locator) => {
        if (!cancelled) setCurrentLocator(locator)
      },
      tap: () => {
        showChrome()
        return false
      },
      click: () => false,
    })

    void (async () => {
      try {
        await nav.load(initialSavedLocator)
        if (cancelled) {
          await nav.destroy()
          return
        }
        navRef.current = nav
        setTotalPages(nav.totalPages)
        setCurrentLocator(nav.currentLocator)
        setReadiumNavReady(true)
      } catch (error) {
        if (!cancelled) setInitError(String(error))
      }
    })()

    return () => {
      cancelled = true
      setReadiumNavReady(false)
      navRef.current = null
      void nav.destroy()
    }
  }, [fileUrl, initialSavedLocator, showChrome])

  const renderPdfPages = useCallback(() => {
    const nav = navRef.current
    const container = containerRef.current
    if (!nav || !container || !readiumNavReady) return
    nav.spreadMode =
      navigationMode === "vertical"
        ? "single"
        : doublePage
          ? "double"
          : "single"
    const { width, height } = container.getBoundingClientRect()
    if (width <= 0 || height <= 0) return

    if (navigationMode === "horizontal") {
      horizontalScrollerRef.current
        ?.querySelectorAll<HTMLCanvasElement>("canvas[data-pdf-spread-page]")
        .forEach((canvas) => {
          const page = Number(canvas.dataset.pdfSpreadPage)
          if (!Number.isFinite(page)) return
          void nav.renderPageAt(canvas, page, width, height, direction, true)
        })
      return
    }

    verticalScrollRef.current
      ?.querySelectorAll<HTMLCanvasElement>("canvas[data-pdf-page]")
      .forEach((canvas) => {
        const page = Number(canvas.dataset.pdfPage)
        if (Number.isFinite(page) && Math.abs(page - pageNum) <= 2) {
          void nav.renderSinglePage(canvas, page, width, height)
        }
      })
  }, [direction, doublePage, navigationMode, pageNum, readiumNavReady])

  useEffect(() => {
    renderPdfPages()
  }, [renderPdfPages])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !readiumNavReady) return
    let frame = 0
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setLandscape((current) => {
        const next = width > height
        return current === next ? current : next
      })
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(renderPdfPages)
    })
    observer.observe(container)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [readiumNavReady, renderPdfPages])

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    nav.spreadMode =
      navigationMode === "vertical"
        ? "single"
        : doublePage
          ? "double"
          : "single"
    if (navigationMode === "horizontal") {
      const spreadStart = spreads[currentSpreadIndex]?.[0]
      if (spreadStart && spreadStart !== nav.currentPage) {
        nav.goToPage(spreadStart)
      }
    }
  }, [currentSpreadIndex, doublePage, navigationMode, spreads])

  const goToPdfPage = useCallback(
    (pageNumber: number) => {
      const nav = navRef.current
      if (!nav) return
      nav.goToPage(pageNumber)
      if (navigationMode === "vertical") {
        requestAnimationFrame(() => {
          verticalScrollRef.current
            ?.querySelector<HTMLElement>(`[data-pdf-page-slot="${pageNumber}"]`)
            ?.scrollIntoView({ block: "start" })
        })
      }
    },
    [navigationMode],
  )
  const onBookmarkSelect = useCallback(
    (bookmark: ReadiumBookmarkRow) => {
      const nav = navRef.current
      if (!nav) return
      const storedPage = pdfPageForBookmark(bookmark.locator, totalPages)
      if (storedPage !== null) {
        goToPdfPage(storedPage)
        closePanels()
        return
      }
      const locator = deserializeReaderBookmarkLocator(bookmark.locator)
      if (!locator) return
      nav.go(locator)
      goToPdfPage(nav.currentPage)
      closePanels()
    },
    [closePanels, goToPdfPage, totalPages],
  )
  const goToSpread = useCallback(
    (spreadIndex: number) => {
      const page = spreads[spreadIndex]?.[0]
      if (page) goToPdfPage(page)
    },
    [goToPdfPage, spreads],
  )
  const onPrevious = useCallback(() => {
    const nav = navRef.current
    if (!nav) return
    if (navigationMode === "horizontal") {
      goToSpread(Math.max(0, currentSpreadIndex - 1))
    } else {
      nav.goBackward()
      goToPdfPage(nav.currentPage)
    }
  }, [currentSpreadIndex, goToPdfPage, goToSpread, navigationMode])
  const onNext = useCallback(() => {
    const nav = navRef.current
    if (!nav) return
    if (navigationMode === "horizontal") {
      goToSpread(Math.min(spreads.length - 1, currentSpreadIndex + 1))
    } else {
      nav.goForward()
      goToPdfPage(nav.currentPage)
    }
  }, [
    currentSpreadIndex,
    goToPdfPage,
    goToSpread,
    navigationMode,
    spreads.length,
  ])

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
          width: horizontalScrollerRef.current?.clientWidth ?? 1,
          height: horizontalScrollerRef.current?.clientHeight ?? 1,
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
  const onZoomSettled = useCallback(
    (scale: number) => {
      const nav = navRef.current
      const container = containerRef.current
      const canvas =
        horizontalScrollerRef.current?.querySelector<HTMLCanvasElement>(
          `canvas[data-pdf-spread-page="${spreads[currentSpreadIndex]?.[0] ?? 1}"]`,
        )
      if (!nav || !container || !canvas) return
      nav.renderScale = scale
      const { width, height } = container.getBoundingClientRect()
      void nav.renderPageAt(
        canvas,
        spreads[currentSpreadIndex]?.[0] ?? 1,
        width,
        height,
        direction,
        true,
      )
    },
    [currentSpreadIndex, direction, spreads],
  )
  const { zoomed } = useFixedLayoutPanzoom({
    scrollerRef: horizontalScrollerRef,
    targetKey: `${navigationMode}-${currentSpreadIndex}-${direction}-${doublePage}`,
    maxScale: 4,
    onUnzoomedWheel: handleUnzoomedWheel,
    onZoomSettled,
  })

  useEffect(() => {
    if (navigationMode !== "horizontal") return
    const nav = navRef.current
    if (!nav) return
    nav.renderScale = 1
    renderPdfPages()
  }, [navigationMode, renderPdfPages])

  useEffect(() => {
    if (navigationMode !== "vertical" || !readiumNavReady) return
    if (verticalScrollPageChangeRef.current) {
      verticalScrollPageChangeRef.current = false
      return
    }
    goToPdfPage(pageNum)
  }, [goToPdfPage, navigationMode, pageNum, readiumNavReady])

  const onVerticalScroll = useCallback(() => {
    const viewport = verticalScrollRef.current
    const nav = navRef.current
    if (!viewport || !nav || viewport.clientHeight <= 0) return
    const viewportCenter = viewport.scrollTop + viewport.clientHeight / 2
    let nextPage = nav.currentPage
    let closestDistance = Number.POSITIVE_INFINITY
    viewport
      .querySelectorAll<HTMLElement>("[data-pdf-page-slot]")
      .forEach((slot) => {
        const page = Number(slot.dataset.pdfPageSlot)
        const center = slot.offsetTop + slot.offsetHeight / 2
        const distance = Math.abs(center - viewportCenter)
        if (Number.isFinite(page) && distance < closestDistance) {
          nextPage = page
          closestDistance = distance
        }
      })
    if (nextPage === nav.currentPage) return
    verticalScrollPageChangeRef.current = true
    nav.goToPage(nextPage)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container || navigationMode !== "vertical" || !readiumNavReady) return
    const onWheel = (event: WheelEvent) => {
      const rect = container.getBoundingClientRect()
      const input = {
        clientX: event.clientX,
        clientY: event.clientY,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        deltaMode: event.deltaMode,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaZ: event.deltaZ,
        timeStamp: event.timeStamp,
      }
      const factor = wheelZoomFactor(input, {
        width: rect.width,
        height: rect.height,
      })
      if (factor === null) return
      event.preventDefault()

      const previousScale = verticalScaleRef.current
      const scale = zoomAtPoint(
        { scale: previousScale, offsetX: 0, offsetY: 0 },
        factor,
        {
          x: event.clientX - rect.left - rect.width / 2,
          y: event.clientY - rect.top - rect.height / 2,
        },
        { width: rect.width, height: rect.height },
        1,
        4,
      ).scale
      const scroll = verticalScrollRef.current
      const ratio = scale / previousScale
      if (scroll && ratio !== 1) {
        const localX = event.clientX - rect.left
        const localY = event.clientY - rect.top
        scroll
          .querySelectorAll<HTMLCanvasElement>("canvas[data-pdf-page]")
          .forEach((canvas) => {
            const width = Number.parseFloat(canvas.style.width)
            const height = Number.parseFloat(canvas.style.height)
            if (Number.isFinite(width))
              canvas.style.width = `${width * ratio}px`
            if (Number.isFinite(height))
              canvas.style.height = `${height * ratio}px`
          })
        scroll.scrollLeft = (scroll.scrollLeft + localX) * ratio - localX
        scroll.scrollTop = (scroll.scrollTop + localY) * ratio - localY
      }
      verticalScaleRef.current = scale
      const nav = navRef.current
      if (nav) nav.renderScale = scale
      renderPdfPages()
    }
    container.addEventListener("wheel", onWheel, { passive: false })
    return () => container.removeEventListener("wheel", onWheel)
  }, [navigationMode, readiumNavReady, renderPdfPages])

  const onProgressSeek = useCallback(
    (progress: number) => {
      const nav = navRef.current
      if (!nav || nav.totalPages < 1) return
      const normalized = Math.max(0, Math.min(100, progress)) / 100
      goToPdfPage(Math.round(normalized * (nav.totalPages - 1)) + 1)
    },
    [goToPdfPage],
  )
  const resolveProgressCommit = useCallback(
    (progress: number) => {
      if (totalPages <= 1) return 0
      const normalized = Math.max(0, Math.min(100, progress)) / 100
      const page = Math.round(normalized * (totalPages - 1)) + 1
      return ((page - 1) / (totalPages - 1)) * 100
    },
    [totalPages],
  )
  const getProgressPreview = useCallback(
    (nextProgress: number) => {
      const total = Math.max(1, totalPages)
      const current =
        total > 1
          ? Math.round(
              (Math.max(0, Math.min(100, nextProgress)) / 100) * (total - 1),
            ) + 1
          : 1
      const label = t("reader.pageCount", { current, total })
      return {
        chapterTitle: tocRows[current - 1]?.title ?? label,
        label,
      }
    },
    [t, tocRows, totalPages],
  )
  const onTocSelect = useCallback(
    (row: ReadiumTocRow) => {
      const match = /^page-(\d+)$/i.exec(row.href)
      if (match) goToPdfPage(Number(match[1]))
      closePanels()
    },
    [closePanels, goToPdfPage],
  )

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
    navigationMode === "horizontal" &&
    readiumNavReady &&
    !tocOpen &&
    !settingsOpen
  const { nearLeft, nearRight } = useReaderPaginateEdgeHover(
    edgeTurnActive,
    readerRootRef,
  )

  if (initError) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center bg-background p-8 text-center">
        <div>
          <p className="text-destructive font-medium mb-2">
            {t("reader.loadFailed")}
          </p>
          <p className="text-sm text-muted-foreground max-w-md">{initError}</p>
        </div>
      </div>
    )
  }

  return (
    <ReaderChromeShell
      readerRootRef={readerRootRef}
      chromeVisible={chromeVisible}
      showChrome={showChrome}
      scheduleChromeHide={scheduleChromeHide}
      panelsOpen={tocOpen || settingsOpen}
      onClosePanels={closePanels}
      readerMode="fixed-layout"
      readerBackgroundColor={backgroundColor}
      topBar={{
        bookTitle,
        chapterTitle: "",
        bookmarked: readerBookmarks.bookmarked,
        bookmarkDisabled: !readerBookmarks.canToggle,
        tocOpen,
        settingsOpen,
        onToggleToc: toggleToc,
        onToggleBookmark: () => void readerBookmarks.toggleCurrentBookmark(),
        onToggleSettings: toggleSettings,
      }}
      tocPanel={
        <ReadiumTocPanel
          visible={tocOpen}
          rows={tocRows}
          activeKey={`page-${pageNum}`}
          onSelect={onTocSelect}
          bookmarks={readerBookmarks.bookmarks}
          activeBookmarkLocatorKey={readerBookmarks.currentBookmarkLocatorKey}
          bookmarksLoading={readerBookmarks.loading}
          bookmarksMutating={readerBookmarks.mutating}
          bookmarksError={readerBookmarks.loadError}
          onBookmarksRetry={readerBookmarks.retry}
          onBookmarkSelect={onBookmarkSelect}
          onBookmarkDelete={readerBookmarks.deleteBookmark}
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
            <FixedLayoutSettingsPanel showPageDirection />
          </ReaderSidePanelScrollArea>
        </ReaderSidePanelFrame>
      }
      edgeTurnOverlays={
        navigationMode === "horizontal" ? (
          <ReaderPaginateEdgeTurnStrips
            direction={direction}
            showPrev={isRtl ? nearRight : nearLeft}
            showNext={isRtl ? nearLeft : nearRight}
            onPrev={onPrevious}
            onNext={onNext}
            prevLabel={t("reader.prevPage")}
            nextLabel={t("reader.nextPage")}
          />
        ) : null
      }
      bottomStatusBar={
        <ReaderBottomStatusBar
          visible={chromeVisible}
          direction={direction}
          emphasizePositionLabel
          leftText={
            totalPages > 0
              ? t("reader.pageCount", { current: pageNum, total: totalPages })
              : undefined
          }
          progress={
            totalPages > 1 ? ((pageNum - 1) / (totalPages - 1)) * 100 : 0
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
          className="relative flex min-h-0 min-w-0 flex-1 basis-0 flex-col items-center justify-center overflow-hidden"
          style={{ backgroundColor }}
        >
          {!readiumNavReady ? (
            <div className="text-sm text-muted-foreground">
              {t("reader.loadingPdf")}
            </div>
          ) : navigationMode === "horizontal" ? (
            <FixedLayoutNativePager
              scrollerRef={horizontalScrollerRef}
              spreads={spreads}
              currentSpreadIndex={currentSpreadIndex}
              direction={direction}
              zoomed={zoomed}
              onSpreadIndexChange={goToSpread}
              renderSpread={(spread) => (
                <div
                  data-fixed-layout-panzoom-target
                  className="flex h-full w-full min-w-0 items-center justify-center"
                >
                  <canvas
                    data-pdf-spread-page={spread[0]}
                    className="block max-h-none max-w-none shrink-0 shadow-md"
                  />
                </div>
              )}
            />
          ) : (
            <div
              ref={verticalScrollRef}
              className="h-full w-full overflow-auto overscroll-contain"
              onScroll={onVerticalScroll}
            >
              {Array.from({ length: totalPages }, (_, index) => {
                const page = index + 1
                const shouldRender = Math.abs(page - pageNum) <= 2
                return (
                  <div
                    key={page}
                    data-pdf-page-slot={page}
                    className="flex min-h-full w-full items-center justify-center p-4"
                  >
                    {shouldRender ? (
                      <canvas
                        data-pdf-page={page}
                        className="block max-h-none max-w-none shrink-0 shadow-md"
                      />
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      }
    />
  )
}
