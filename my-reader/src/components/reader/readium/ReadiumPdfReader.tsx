import { ReadiumTocPanel, type ReadiumTocRow } from "@/components/reader/readium/ReadiumTocPanel"
import {
  ReaderSidePanelFrame,
  ReaderSidePanelHeader,
} from "@/components/reader/shared/ReaderSidePanelChrome"
import { ReaderBottomStatusBar } from "@/components/reader/shared/ReaderBottomStatusBar"
import { ReaderChromeShell } from "@/components/reader/shared/ReaderChromeShell"
import { ReaderPaginateEdgeTurnStrips } from "@/components/reader/shared/ReaderPaginateEdgeTurnStrips"
import { Label } from "@/components/ui/label"
import { useLocatorProgressSync } from "@/hooks/reader/useLocatorProgressSync"
import { useReaderPanels } from "@/hooks/reader/useReaderPanels"
import { useReaderPaginateEdgeTurn } from "@/hooks/reader/useReaderPaginateEdgeTurn"
import { useReadingChrome } from "@/hooks/reader/useReadingChrome"
import { useAppUiStore } from "@/stores/appUiStore"
import { ensurePdfJsWorker } from "@/lib/pdfWorker"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { Locator, LocatorLocations } from "@readium/shared"
import { Settings } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

const PDF_RENDER_BASE = 1.25
const PDF_SCALE_MIN = 0.75
const PDF_SCALE_MAX = 3

/** RFC 3778 / Readium locators: page fragments live in `locations.fragments`, not in `href`. */
function pdfPageFragment(page: number): string {
  return `page=${Math.max(1, Math.floor(page))}`
}

/** Resolve initial page from persisted Readium locator (new `page=` fragments or legacy `page-N` href). */
function parsePdfStartPage(
  loc: Locator | null,
  numPages: number,
): number | null {
  if (!loc || numPages < 1) return null
  const frags = loc.locations?.fragments
  if (frags?.length) {
    for (const f of frags) {
      const m = /^page=(\d+)$/i.exec(String(f).trim())
      if (m) {
        const n = Number(m[1])
        if (n >= 1 && n <= numPages) return n
      }
    }
  }
  const pos = loc.locations?.position
  if (typeof pos === "number") {
    const n = Math.floor(pos)
    if (n >= 1 && n <= numPages) return n
  }
  const legacy = /^page-(\d+)$/i.exec(loc.href)
  if (legacy) {
    const n = Number(legacy[1])
    if (n >= 1 && n <= numPages) return n
  }
  return null
}

export type ReadiumPdfReaderProps = {
  bookTitle: string
  /** Tauri asset URL or file URL for pdf.js */
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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const { tocOpen, settingsOpen, toggleToc, toggleSettings, closePanels } = useReaderPanels()
  const { readerRootRef, chromeVisible, showChrome, scheduleChromeHide } = useReadingChrome(
    false,
    tocOpen || settingsOpen,
  )
  const [bookmarked, setBookmarked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pageNum, setPageNum] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [renderScale, setRenderScale] = useState(PDF_RENDER_BASE)
  const direction = useAppUiStore((s) => s.fixedLayout.direction)

  const tocRows: ReadiumTocRow[] = useMemo(() => {
    if (totalPages < 1) return []
    return Array.from({ length: totalPages }, (_, i) => ({
      depth: 0,
      title: `第 ${i + 1} 页`,
      href: `page-${i + 1}`,
      type: "application/pdf",
    }))
  }, [totalPages])

  const currentLocator = useMemo(() => {
    if (totalPages < 1) return null
    const prog = totalPages > 1 ? (pageNum - 1) / (totalPages - 1) : 0
    return new Locator({
      href: fileUrl,
      type: "application/pdf",
      title: `第 ${pageNum} 页`,
      locations: new LocatorLocations({
        fragments: [pdfPageFragment(pageNum)],
        position: pageNum,
        progression: prog,
        totalProgression: prog,
      }),
    })
  }, [fileUrl, pageNum, totalPages])

  useLocatorProgressSync({
    enabled: progressSyncEnabled && Boolean(libraryId) && format.length > 0 && totalPages > 0,
    libraryId,
    bookId,
    format,
    currentLocator,
  })

  useEffect(() => {
    let cancelled = false
    setError(null)
    void (async () => {
      try {
        await ensurePdfJsWorker()
        const pdfjs = await import("pdfjs-dist")
        const task = pdfjs.getDocument({ url: fileUrl })
        const pdf = await task.promise
        if (cancelled) {
          await pdf.destroy()
          return
        }
        pdfRef.current = pdf
        setTotalPages(pdf.numPages)
        const parsed = parsePdfStartPage(initialSavedLocator, pdf.numPages)
        setPageNum(parsed ?? 1)
      } catch (e) {
        if (!cancelled) setError(String(e))
      }
    })()
    return () => {
      cancelled = true
      void pdfRef.current?.destroy()
      pdfRef.current = null
    }
  }, [fileUrl, initialSavedLocator])

  useEffect(() => {
    const pdf = pdfRef.current
    const canvas = canvasRef.current
    if (!pdf || !canvas || pageNum < 1) return

    void (async () => {
      const page = await pdf.getPage(pageNum)
      const vp = page.getViewport({ scale: renderScale })
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      canvas.width = vp.width
      canvas.height = vp.height
      await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise
    })()
  }, [pageNum, totalPages, renderScale])

  const go = useCallback(
    (delta: number) => {
      setPageNum((p) => {
        const next = p + delta
        if (next < 1) return 1
        if (totalPages > 0 && next > totalPages) return totalPages
        return next
      })
    },
    [totalPages],
  )

  const isRtl = direction === "rtl"
  const edgeTurnActive = totalPages > 0 && !error && !tocOpen && !settingsOpen
  const { nearLeft, nearRight } = useReaderPaginateEdgeTurn(
    edgeTurnActive,
    readerRootRef,
  )

  const onPdfEdgePrev = useCallback(() => {
    go(-1)
  }, [go])

  const onPdfEdgeNext = useCallback(() => {
    go(1)
  }, [go])

  const onTocSelect = useCallback(
    (row: ReadiumTocRow) => {
      const m = /^page-(\d+)$/i.exec(row.href)
      if (m) setPageNum(Number(m[1]))
      closePanels()
    },
    [closePanels],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isRtl = direction === "rtl"
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        go(isRtl ? -1 : 1)
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        go(isRtl ? 1 : -1)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go, direction])

  if (error) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center bg-background p-8 text-center">
        <div>
          <p className="text-destructive font-medium mb-2">PDF 加载失败</p>
          <p className="text-sm text-muted-foreground max-w-md">{error}</p>
        </div>
      </div>
    )
  }

  const chapterTitle =
    totalPages > 0 ? `第 ${pageNum} / ${totalPages} 页` : ""

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
          <ReaderSidePanelHeader title="设置" icon={Settings} onClose={closePanels} />
          <div className="reader-chrome-muted space-y-4 px-4 py-3 text-xs leading-relaxed">
            <section className="space-y-2">
              <Label
                htmlFor="pdf-render-scale"
                className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80"
              >
                渲染缩放
              </Label>
              <input
                id="pdf-render-scale"
                type="range"
                min={PDF_SCALE_MIN}
                max={PDF_SCALE_MAX}
                step={0.05}
                value={renderScale}
                onChange={(e) => setRenderScale(Number(e.target.value))}
                className="mt-1 w-full accent-primary"
              />
              <p className="text-[11px] tabular-nums text-reader-chrome-fg/70">
                {renderScale.toFixed(2)}×（方向键与左右边缘翻页）
              </p>
            </section>
            <p className="text-[11px] text-reader-chrome-fg/55">
              连续滚动与手势缩放将另行接入 pdf.js 管线。
            </p>
          </div>
        </ReaderSidePanelFrame>
      }
      edgeTurnOverlays={
        <ReaderPaginateEdgeTurnStrips
          nearLeft={isRtl ? nearRight : nearLeft}
          nearRight={isRtl ? nearLeft : nearRight}
          onPrev={onPdfEdgePrev}
          onNext={onPdfEdgeNext}
          prevLabel="上一页"
          nextLabel="下一页"
        />
      }
      bottomStatusBar={
        <ReaderBottomStatusBar
          visible={chromeVisible}
          leftText={totalPages > 0 ? `第 ${pageNum} / ${totalPages} 页` : undefined}
          progress={totalPages > 1 ? ((pageNum - 1) / (totalPages - 1)) * 100 : 0}
        />
      }
      main={
        <div className="relative flex min-h-0 min-w-0 flex-1 basis-0 flex-col items-center justify-center overflow-auto bg-muted/30 p-4">
          {totalPages < 1 ? (
            <div className="text-sm text-muted-foreground">正在加载 PDF…</div>
          ) : (
            <canvas
              ref={canvasRef}
              className="shadow-md max-h-[calc(100dvh-6rem)] w-auto max-w-full"
            />
          )}
        </div>
      }
    />
  )
}
