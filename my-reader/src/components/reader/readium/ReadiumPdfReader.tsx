import {
  ReadiumTocPanel,
  type ReadiumTocRow,
} from "@/components/reader/readium/ReadiumTocPanel"
import { ReaderBottomStatusBar } from "@/components/reader/shared/ReaderBottomStatusBar"
import { ReaderChromeShell } from "@/components/reader/shared/ReaderChromeShell"
import { ReaderPaginateEdgeTurnStrips } from "@/components/reader/shared/ReaderPaginateEdgeTurnStrips"
import {
  READER_SETTINGS_CONTENT_CLASS,
  READER_SETTINGS_LABEL_CLASS,
  READER_SETTINGS_OPTION_CLASS,
  READER_SETTINGS_VALUE_CLASS,
  ReaderSidePanelFrame,
  ReaderSidePanelHeader,
  ReaderSidePanelScrollArea,
  readerSettingsOptionStateClass,
} from "@/components/reader/shared/ReaderSidePanelChrome"
import { Label } from "@/components/ui/label"
import { useLocatorProgressSync } from "@/hooks/reader/useLocatorProgressSync"
import { useReaderPaginateEdgeHover } from "@/hooks/reader/useReaderPaginateEdgeHover"
import { useReaderPanels } from "@/hooks/reader/useReaderPanels"
import { useReadingChrome } from "@/hooks/reader/useReadingChrome"
import {
  PdfNavigator,
  PDF_RENDER_BASE,
  PDF_SCALE_MIN,
  PDF_SCALE_MAX,
  type SpreadMode,
} from "@/lib/readium/PdfNavigator"
import { useAppUiStore } from "@/stores/appUiStore"
import { Locator } from "@readium/shared"
import { Settings } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

type PdfSurface = "black" | "dim" | "paper"

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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<PdfNavigator | null>(null)
  const { tocOpen, settingsOpen, toggleToc, toggleSettings, closePanels } =
    useReaderPanels()
  const { readerRootRef, chromeVisible, showChrome, scheduleChromeHide } =
    useReadingChrome(false, tocOpen || settingsOpen)
  const [bookmarked, setBookmarked] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [readiumNavReady, setReadiumNavReady] = useState(false)
  const [currentLocator, setCurrentLocator] = useState<Locator | null>(null)
  const [renderScale, setRenderScale] = useState(PDF_RENDER_BASE)
  const [spreadMode, setSpreadMode] = useState<SpreadMode>("auto")
  const [surface, setSurface] = useState<PdfSurface>("black")
  const direction = useAppUiStore((s) => s.fixedLayout.direction)

  const totalPages = navRef.current?.totalPages ?? 0
  const pageNum = currentLocator?.locations?.position ?? 1

  const tocRows: ReadiumTocRow[] = useMemo(() => {
    const nav = navRef.current
    if (!nav || nav.totalPages < 1) return []
    return Array.from({ length: nav.totalPages }, (_, i) => ({
      key: `page-${i + 1}`,
      depth: 0,
      title: t("reader.pageCount", { current: i + 1, total: "" }).replace(
        " / ",
        "",
      ),
      href: `page-${i + 1}`,
      type: "application/pdf",
    }))
  }, [readiumNavReady])

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
  }, [fileUrl, initialSavedLocator])

  // Re-render when page, scale, spread mode, or container size changes
  useEffect(() => {
    const nav = navRef.current
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!nav || !canvas || !container || !readiumNavReady) return
    const { width, height } = container.getBoundingClientRect()
    if (width === 0 || height === 0) return
    void nav.renderPage(canvas, width, height)
  }, [pageNum, renderScale, spreadMode, readiumNavReady])

  // Observe container resize (debounced to avoid flicker during chrome transitions)
  useEffect(() => {
    const container = containerRef.current
    if (!container || !readiumNavReady) return
    let rafId = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const nav = navRef.current
        const canvas = canvasRef.current
        if (!nav || !canvas) return
        const { width, height } = container.getBoundingClientRect()
        if (width === 0 || height === 0) return
        void nav.renderPage(canvas, width, height)
      })
    })
    observer.observe(container)
    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [readiumNavReady])

  const onSpreadChange = useCallback((mode: SpreadMode) => {
    const nav = navRef.current
    if (nav) nav.spreadMode = mode
    setSpreadMode(mode)
  }, [])

  const onPdfEdgePrev = useCallback(() => {
    navRef.current?.goBackward()
  }, [])

  const onPdfEdgeNext = useCallback(() => {
    navRef.current?.goForward()
  }, [])

  const onProgressSeek = useCallback((progress: number) => {
    const nav = navRef.current
    if (!nav || nav.totalPages < 1) return
    const normalized = Math.max(0, Math.min(100, progress)) / 100
    const targetPage = Math.round(normalized * (nav.totalPages - 1)) + 1
    nav.goToPage(targetPage)
  }, [])
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
      if (m) navRef.current?.goToPage(Number(m[1]))
      closePanels()
    },
    [closePanels],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const nav = navRef.current
      if (!nav) return
      const isRtl = direction === "rtl"
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        isRtl ? nav.goBackward() : nav.goForward()
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        isRtl ? nav.goForward() : nav.goBackward()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [direction])

  const isRtl = direction === "rtl"
  const edgeTurnActive = readiumNavReady && !tocOpen && !settingsOpen
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
            <section className="space-y-2">
              <Label className={READER_SETTINGS_LABEL_CLASS}>
                {t("reader.layout")}
              </Label>
              <div className="flex flex-col gap-2">
                {(
                  [
                    ["auto", t("reader.layoutOptions.auto")],
                    ["single", t("reader.layoutOptions.single")],
                    ["double", t("reader.layoutOptions.double")],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onSpreadChange(value)}
                    className={cn(
                      READER_SETTINGS_OPTION_CLASS,
                      "text-start",
                      readerSettingsOptionStateClass(spreadMode === value),
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>
            <section className="space-y-2">
              <Label className={READER_SETTINGS_LABEL_CLASS}>
                {t("reader.canvasBg")}
              </Label>
              <div className="flex flex-col gap-2">
                {(
                  [
                    ["black", t("reader.canvasBgOptions.black")],
                    ["dim", t("reader.canvasBgOptions.dim")],
                    ["paper", t("reader.canvasBgOptions.paper")],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSurface(value)}
                    className={cn(
                      READER_SETTINGS_OPTION_CLASS,
                      "text-start",
                      readerSettingsOptionStateClass(surface === value),
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label
                  htmlFor="pdf-render-scale"
                  className={READER_SETTINGS_LABEL_CLASS}
                >
                  {t("reader.renderScale")}
                </Label>
                <span className={READER_SETTINGS_VALUE_CLASS}>
                  {renderScale.toFixed(2)}×
                </span>
              </div>
              <input
                id="pdf-render-scale"
                type="range"
                min={PDF_SCALE_MIN}
                max={PDF_SCALE_MAX}
                step={0.05}
                value={renderScale}
                onChange={(e) => {
                  const scale = Number(e.target.value)
                  setRenderScale(scale)
                  if (navRef.current) navRef.current.renderScale = scale
                }}
                className="w-full accent-reader-chrome-active"
              />
            </section>
          </ReaderSidePanelScrollArea>
        </ReaderSidePanelFrame>
      }
      edgeTurnOverlays={
        <ReaderPaginateEdgeTurnStrips
          showPrev={isRtl ? nearRight : nearLeft}
          showNext={isRtl ? nearLeft : nearRight}
          onPrev={onPdfEdgePrev}
          onNext={onPdfEdgeNext}
          prevLabel={t("reader.prevPage")}
          nextLabel={t("reader.nextPage")}
        />
      }
      bottomStatusBar={
        <ReaderBottomStatusBar
          visible={chromeVisible}
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
          className={cn(
            "relative flex min-h-0 min-w-0 flex-1 basis-0 flex-col items-center justify-center overflow-hidden",
            surface === "black" && "bg-black",
            surface === "dim" && "bg-zinc-950",
            surface === "paper" && "bg-background",
          )}
        >
          {!readiumNavReady ? (
            <div className="text-sm text-muted-foreground">
              {t("reader.loadingPdf")}
            </div>
          ) : (
            <canvas ref={canvasRef} className="max-h-full max-w-full" />
          )}
        </div>
      }
    />
  )
}
