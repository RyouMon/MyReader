import {
  ReadiumTocPanel,
  type ReadiumTocRow,
} from "@/components/reader/readium/ReadiumTocPanel"
import { ReaderBottomStatusBar } from "@/components/reader/shared/ReaderBottomStatusBar"
import { ReaderChromeShell } from "@/components/reader/shared/ReaderChromeShell"
import { ReaderPaginateEdgeTurnStrips } from "@/components/reader/shared/ReaderPaginateEdgeTurnStrips"
import {
  ReaderSidePanelFrame,
  ReaderSidePanelHeader,
} from "@/components/reader/shared/ReaderSidePanelChrome"
import { Label } from "@/components/ui/label"
import { useLocatorProgressSync } from "@/hooks/reader/useLocatorProgressSync"
import { useReaderPaginateEdgeTurn } from "@/hooks/reader/useReaderPaginateEdgeTurn"
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
      depth: 0,
      title: t("reader.pageCount", { current: i + 1, total: "" }).replace(" / ", ""),
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
  const { nearLeft, nearRight } = useReaderPaginateEdgeTurn(
    edgeTurnActive,
    readerRootRef,
  )

  if (initError) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center bg-background p-8 text-center">
        <div>
          <p className="text-destructive font-medium mb-2">{t("reader.loadFailed")}</p>
          <p className="text-sm text-muted-foreground max-w-md">{initError}</p>
        </div>
      </div>
    )
  }

  const chapterTitle = totalPages > 0
    ? t("reader.pageCount", { current: pageNum, total: totalPages })
    : ""

  return (
    <ReaderChromeShell
      readerRootRef={readerRootRef}
      chromeVisible={chromeVisible}
      showChrome={showChrome}
      scheduleChromeHide={scheduleChromeHide}
      panelsOpen={tocOpen || settingsOpen}
      onClosePanels={closePanels}
      topBar={{
        bookTitle,
        chapterTitle,
        bookmarked,
        onToggleToc: toggleToc,
        onToggleBookmark: () => setBookmarked((b) => !b),
        onToggleSettings: toggleSettings,
      }}
      tocPanel={
        <ReadiumTocPanel
          visible={tocOpen}
          rows={tocRows}
          activeHref={`page-${pageNum}`}
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
          <div className="reader-chrome-muted space-y-5 px-4 py-3 text-xs leading-relaxed">
            <section className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80">
                {t("reader.layout")}
              </Label>
              <div className="flex flex-col gap-1">
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
                      "rounded-md border px-3 py-2 text-start text-[13px] transition-colors",
                      spreadMode === value
                        ? "border-primary bg-accent text-reader-chrome-fg"
                        : "border-reader-chrome-border bg-transparent text-reader-chrome-fg/90 hover:bg-reader-chrome-muted/25",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>
            <section className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80">
                {t("reader.canvasBg")}
              </Label>
              <div className="flex flex-col gap-1">
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
                      "rounded-md border px-3 py-2 text-start text-[13px] transition-colors",
                      surface === value
                        ? "border-primary bg-accent text-reader-chrome-fg"
                        : "border-reader-chrome-border bg-transparent text-reader-chrome-fg/90 hover:bg-reader-chrome-muted/25",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>
            <section className="space-y-2">
              <Label
                htmlFor="pdf-render-scale"
                className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80"
              >
                {t("reader.renderScale")}
              </Label>
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
                className="mt-1 w-full accent-primary"
              />
              <p className="text-[11px] tabular-nums text-reader-chrome-fg/70">
                {renderScale.toFixed(2)}×
              </p>
            </section>
          </div>
        </ReaderSidePanelFrame>
      }
      edgeTurnOverlays={
        <ReaderPaginateEdgeTurnStrips
          nearLeft={isRtl ? nearRight : nearLeft}
          nearRight={isRtl ? nearLeft : nearRight}
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
            <div className="text-sm text-muted-foreground">{t("reader.loadingPdf")}</div>
          ) : (
            <canvas
              ref={canvasRef}
              className="max-h-full max-w-full"
            />
          )}
        </div>
      }
    />
  )
}
