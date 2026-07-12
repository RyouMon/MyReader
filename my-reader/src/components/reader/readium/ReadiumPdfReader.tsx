import type { Locator } from "@readium/shared"
import { Settings } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useTheme } from "@/components/AppThemeProvider"
import {
  ReadiumTocPanel,
  type ReadiumTocRow,
} from "@/components/reader/readium/ReadiumTocPanel"
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
import { useLocatorProgressSync } from "@/hooks/reader/useLocatorProgressSync"
import { useReaderPaginateEdgeHover } from "@/hooks/reader/useReaderPaginateEdgeHover"
import { useReaderPanels } from "@/hooks/reader/useReaderPanels"
import { useReadingChrome } from "@/hooks/reader/useReadingChrome"
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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const verticalScrollRef = useRef<HTMLDivElement>(null)
  const verticalScrollPageChangeRef = useRef(false)
  const navRef = useRef<PdfNavigator | null>(null)
  const { tocOpen, settingsOpen, toggleToc, toggleSettings, closePanels } =
    useReaderPanels()
  const { readerRootRef, chromeVisible, showChrome, scheduleChromeHide } =
    useReadingChrome(false, tocOpen || settingsOpen)
  const [bookmarked, setBookmarked] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [readiumNavReady, setReadiumNavReady] = useState(false)
  const [currentLocator, setCurrentLocator] = useState<Locator | null>(null)
  const background = useAppUiStore((s) => s.fixedLayout.background)
  const navigationMode = useAppUiStore((s) => s.fixedLayout.navigationMode)
  const spreadMode = useAppUiStore((s) => s.fixedLayout.spreadMode)
  const direction = useAppUiStore((s) => s.fixedLayout.direction)
  const backgroundColor = resolveFixedBackgroundColor(background, resolvedTheme)

  const totalPages = navRef.current?.totalPages ?? 0
  const pageNum = currentLocator?.locations?.position ?? 1

  const tocRows: ReadiumTocRow[] = useMemo(() => {
    if (totalPages < 1) return []
    return Array.from({ length: totalPages }, (_, i) => ({
      key: `page-${i + 1}`,
      depth: 0,
      title: t("reader.pageCount", { current: i + 1, total: "" }).replace(
        " / ",
        "",
      ),
      href: `page-${i + 1}`,
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
    nav.spreadMode = useAppUiStore.getState().fixedLayout.spreadMode

    void (async () => {
      try {
        await nav.load(initialSavedLocator)
        if (cancelled) {
          await nav.destroy()
          return
        }
        navRef.current = nav
        setReadiumNavReady(true)
        setCurrentLocator(nav.currentLocator)
      } catch (e) {
        if (!cancelled) setInitError(String(e))
      }
    })()

    return () => {
      cancelled = true
      setReadiumNavReady(false)
      navRef.current = null
      void nav.destroy()
    }
  }, [fileUrl, initialSavedLocator, showChrome])

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    nav.spreadMode = navigationMode === "vertical" ? "single" : spreadMode
    setCurrentLocator(nav.currentLocator)
  }, [navigationMode, spreadMode])

  const renderPdfPages = useCallback(() => {
    const nav = navRef.current
    const container = containerRef.current
    if (!nav || !container || !readiumNavReady) return
    nav.spreadMode = navigationMode === "vertical" ? "single" : spreadMode
    const { width, height } = container.getBoundingClientRect()
    if (width === 0 || height === 0) return

    if (navigationMode === "horizontal") {
      const canvas = canvasRef.current
      if (canvas) void nav.renderPage(canvas, width, height, direction)
      return
    }

    const canvases = verticalScrollRef.current?.querySelectorAll(
      "canvas[data-pdf-page]",
    )
    canvases?.forEach((canvas) => {
      const pageNumber = Number(canvas.getAttribute("data-pdf-page"))
      if (
        canvas instanceof HTMLCanvasElement &&
        Number.isFinite(pageNumber) &&
        Math.abs(pageNumber - pageNum) <= 2
      ) {
        void nav.renderSinglePage(canvas, pageNumber, width, height)
      }
    })
  }, [direction, navigationMode, pageNum, readiumNavReady, spreadMode])

  useEffect(() => {
    renderPdfPages()
  }, [renderPdfPages])

  // Observe container resize (debounced to avoid flicker during chrome transitions)
  useEffect(() => {
    const container = containerRef.current
    if (!container || !readiumNavReady) return
    let rafId = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        renderPdfPages()
      })
    })
    observer.observe(container)
    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [readiumNavReady, renderPdfPages])

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
    const nextPage = Math.max(
      1,
      Math.min(
        nav.totalPages,
        Math.round(viewport.scrollTop / viewport.clientHeight) + 1,
      ),
    )
    if (nextPage === nav.currentPage) return
    verticalScrollPageChangeRef.current = true
    nav.goToPage(nextPage)
  }, [])

  const onPdfEdgePrev = useCallback(() => {
    const nav = navRef.current
    if (!nav) return
    nav.goBackward()
    if (navigationMode === "vertical") goToPdfPage(nav.currentPage)
  }, [goToPdfPage, navigationMode])

  const onPdfEdgeNext = useCallback(() => {
    const nav = navRef.current
    if (!nav) return
    nav.goForward()
    if (navigationMode === "vertical") goToPdfPage(nav.currentPage)
  }, [goToPdfPage, navigationMode])

  const onProgressSeek = useCallback(
    (progress: number) => {
      const nav = navRef.current
      if (!nav || nav.totalPages < 1) return
      const normalized = Math.max(0, Math.min(100, progress)) / 100
      const targetPage = Math.round(normalized * (nav.totalPages - 1)) + 1
      goToPdfPage(targetPage)
    },
    [goToPdfPage],
  )
  const resolveProgressCommit = useCallback(
    (progress: number) => {
      if (totalPages <= 1) return 0
      const normalized = Math.max(0, Math.min(100, progress)) / 100
      const targetPage = Math.round(normalized * (totalPages - 1)) + 1
      return ((targetPage - 1) / (totalPages - 1)) * 100
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
      const m = /^page-(\d+)$/i.exec(row.href)
      if (m) goToPdfPage(Number(m[1]))
      closePanels()
    },
    [closePanels, goToPdfPage],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const nav = navRef.current
      if (!nav) return
      const isRtl = direction === "rtl"
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        isRtl ? onPdfEdgePrev() : onPdfEdgeNext()
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        isRtl ? onPdfEdgeNext() : onPdfEdgePrev()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [direction, onPdfEdgeNext, onPdfEdgePrev])

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
        bookmarked,
        tocOpen,
        settingsOpen,
        onToggleToc: toggleToc,
        onToggleBookmark: () => setBookmarked((b) => !b),
        onToggleSettings: toggleSettings,
      }}
      tocPanel={
        <ReadiumTocPanel
          visible={tocOpen}
          rows={tocRows}
          activeKey={`page-${pageNum}`}
          onSelect={onTocSelect}
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
            showPrev={isRtl ? nearRight : nearLeft}
            showNext={isRtl ? nearLeft : nearRight}
            onPrev={onPdfEdgePrev}
            onNext={onPdfEdgeNext}
            prevLabel={t("reader.prevPage")}
            nextLabel={t("reader.nextPage")}
          />
        ) : null
      }
      bottomStatusBar={
        <ReaderBottomStatusBar
          visible={chromeVisible}
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
          onProgressStepBackward={onPdfEdgePrev}
          onProgressStepForward={onPdfEdgeNext}
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
            <canvas ref={canvasRef} className="max-h-full max-w-full" />
          ) : (
            <div
              ref={verticalScrollRef}
              className="h-full w-full overflow-y-auto overscroll-contain"
              onScroll={onVerticalScroll}
            >
              {Array.from({ length: totalPages }, (_, index) => {
                const page = index + 1
                const shouldRender = Math.abs(page - pageNum) <= 2
                return (
                  <div
                    key={page}
                    data-pdf-page-slot={page}
                    className="flex h-full min-h-full w-full items-center justify-center p-4"
                  >
                    {shouldRender ? (
                      <canvas
                        data-pdf-page={page}
                        className="max-h-full max-w-full shadow-md"
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
