import { ReadiumTocPanel, type ReadiumTocRow } from "@/components/reader/readium/ReadiumTocPanel"
import { ReaderChromeShell } from "@/components/reader/shared/ReaderChromeShell"
import { ReaderPaginateEdgeTurnStrips } from "@/components/reader/shared/ReaderPaginateEdgeTurnStrips"
import {
    ReaderSidePanelFrame,
    ReaderSidePanelHeader,
} from "@/components/reader/shared/ReaderSidePanelChrome"
import { Label } from "@/components/ui/label"
import { useLocatorProgressSync } from "@/hooks/reader/useLocatorProgressSync"
import {
    READER_PAGINATE_EDGE_PX,
    useReaderPaginateEdgeTurn,
} from "@/hooks/reader/useReaderPaginateEdgeTurn"
import { useReaderPanels } from "@/hooks/reader/useReaderPanels"
import { useReadingChrome } from "@/hooks/reader/useReadingChrome"
import { patchEpubNavigatorFixedLayoutGoNav } from "@/lib/readium/epubFixedLayoutNavPatch"
import { applySpreadPreference, type SpreadPreference } from "@/lib/readium/epubReaderPrefs"
import {
  goToReadingOrderPositionBySteps,
  tocTargetReadingOrderIndex,
  tocTargetToLocator,
} from "@/lib/readium/tocNavigation"
import { cn } from "@/lib/utils"
import { EpubNavigator } from "@readium/navigator"
import { Locator, LocatorLocations, type Publication } from "@readium/shared"
import { Settings } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type DivinaSurface = "black" | "dim" | "paper"

export type ReadiumDivinaReaderProps = {
  bookTitle: string
  publication: Publication
  initialSavedLocator: Locator | null
  libraryId: string | null
  bookId: number
  format: string
  progressSyncEnabled: boolean
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
  const containerRef = useRef<HTMLDivElement>(null)
  /** 与左右翻页条同层，用于边缘悬停检测（对齐可视阅读区，而非整窗）。 */
  const edgeTrackRef = useRef<HTMLDivElement>(null)
  const navigatorRef = useRef<EpubNavigator | null>(null)
  const { tocOpen, settingsOpen, toggleToc, toggleSettings, closePanels } = useReaderPanels()
  const { readerRootRef, chromeVisible, showChrome, scheduleChromeHide } = useReadingChrome(
    false,
    tocOpen || settingsOpen,
  )
  const [bookmarked, setBookmarked] = useState(false)
  const [readiumNavReady, setReadiumNavReady] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [chapterTitle, setChapterTitle] = useState("")
  const [currentLocator, setCurrentLocator] = useState<Locator | null>(null)
  const [spreadMode, setSpreadMode] = useState<SpreadPreference>("auto")
  const [surface, setSurface] = useState<DivinaSurface>("black")

  const onSpreadChange = useCallback(async (mode: SpreadPreference) => {
    const nav = navigatorRef.current
    if (!nav) return
    await applySpreadPreference(nav, mode)
    setSpreadMode(mode)
  }, [])

  const tocRows: ReadiumTocRow[] = useMemo(() => {
    return publication.readingOrder.items.map((item, i) => ({
      depth: 0,
      title: item.title?.trim() || `第 ${i + 1} 页`,
      href: item.href,
      type: item.type,
    }))
  }, [publication])

  const onTocSelect = useCallback(
    async (row: ReadiumTocRow) => {
      const nav = navigatorRef.current
      if (!nav) return
      const targetIndex = tocTargetReadingOrderIndex(publication, row)
      if (targetIndex >= 0) {
        await goToReadingOrderPositionBySteps(nav, targetIndex + 1)
        closePanels()
        return
      }
      const locator = tocTargetToLocator(publication, row)
      if (!locator) return
      nav.go(locator, false, () => {})
      closePanels()
    },
    [publication, closePanels],
  )

  const edgeTurnActive =
    readiumNavReady && !tocOpen && !settingsOpen && !initError
  const { nearLeft, nearRight } = useReaderPaginateEdgeTurn(edgeTurnActive, edgeTrackRef)

  const onReadiumEdgePrev = useCallback(() => {
    navigatorRef.current?.goBackward(false, () => {})
  }, [])

  const onReadiumEdgeNext = useCallback(() => {
    navigatorRef.current?.goForward(false, () => {})
  }, [])

  const onEdgePointerDownCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!readiumNavReady || tocOpen || settingsOpen || initError) return
      const el = edgeTrackRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const x = e.clientX - r.left
      const y = e.clientY - r.top
      if (x < 0 || x > r.width || y < 0 || y > r.height) return
      if (x <= READER_PAGINATE_EDGE_PX) {
        e.preventDefault()
        e.stopPropagation()
        navigatorRef.current?.goBackward(false, () => {})
      } else if (x >= r.width - READER_PAGINATE_EDGE_PX) {
        e.preventDefault()
        e.stopPropagation()
        navigatorRef.current?.goForward(false, () => {})
      }
    },
    [readiumNavReady, tocOpen, settingsOpen, initError],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!readiumNavReady || initError) return
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        navigatorRef.current?.goForward(false, () => {})
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        navigatorRef.current?.goBackward(false, () => {})
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [readiumNavReady, initError])

  useLocatorProgressSync({
    enabled: progressSyncEnabled && Boolean(libraryId) && format.length > 0,
    libraryId,
    bookId,
    format,
    currentLocator,
  })

  useEffect(() => {
    if (!containerRef.current) return

    async function init() {
      try {
        const container = containerRef.current!
        const items = publication.readingOrder.items
        if (items.length === 0) throw new Error("No pages in comic")

        const positions = items.map(
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

        let initialPosition: Locator = positions[0]
        if (initialSavedLocator) {
          const pos = initialSavedLocator.locations?.position
          if (typeof pos === "number" && pos >= 1 && pos <= positions.length) {
            initialPosition = positions[pos - 1]
          } else {
            const m = positions.findIndex((p) => p.href === initialSavedLocator.href)
            if (m >= 0) initialPosition = positions[m]
          }
        }

        const nav = new EpubNavigator(
          container,
          publication,
          {
            frameLoaded: () => {},
            positionChanged: (locator) => {
              setCurrentLocator(locator)
              const idx = (locator.locations?.position ?? 1) - 1
              const t = items[idx]?.title?.trim()
              setChapterTitle(t || `第 ${locator.locations?.position ?? 1} 页`)
            },
            tap: () => {
              showChrome()
              return false
            },
            click: () => false,
            zoom: () => {},
            miscPointer: () => {
              showChrome()
            },
            scroll: () => {},
            customEvent: () => {},
            handleLocator: () => false,
            textSelected: () => {},
            contentProtection: () => {},
            contextMenu: () => {},
            peripheral: (ev) => {
              const nav2 = navigatorRef.current
              if (!nav2) return
              const rec = ev as { key?: string; keyCode?: number }
              const key = rec.key ?? ""
              if (key === "ArrowRight" || key === "PageDown" || rec.keyCode === 39) {
                nav2.goForward(false, () => {})
              } else if (key === "ArrowLeft" || key === "PageUp" || rec.keyCode === 37) {
                nav2.goBackward(false, () => {})
              }
            },
          },
          positions,
          initialPosition,
          {
            preferences: {},
            defaults: {},
          },
        )
        patchEpubNavigatorFixedLayoutGoNav(nav)
        await nav.load()
        requestAnimationFrame(() => {
          void nav.resizeHandler()
          requestAnimationFrame(() => {
            void nav.resizeHandler()
          })
        })
        navigatorRef.current = nav
        setReadiumNavReady(true)
        setCurrentLocator(nav.currentLocator)
        const p0 = nav.currentLocator.locations?.position ?? 1
        setChapterTitle(items[p0 - 1]?.title?.trim() || `第 ${p0} 页`)
      } catch (e) {
        console.error("[ReadiumDivina]", e)
        setInitError(String(e))
      }
    }

    void init()

    return () => {
      setReadiumNavReady(false)
      void navigatorRef.current?.destroy()
      navigatorRef.current = null
    }
  }, [publication, initialSavedLocator, showChrome])

  if (initError) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center bg-background p-8 text-center">
        <div>
          <p className="text-destructive font-medium mb-2">漫画加载失败</p>
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
          activeHref={currentLocator?.href ?? null}
          onSelect={onTocSelect}
          onClose={closePanels}
        />
      }
      settingsPanel={
        <ReaderSidePanelFrame visible={settingsOpen} side="right">
          <ReaderSidePanelHeader title="设置" icon={Settings} onClose={closePanels} />
          <div className="reader-chrome-muted space-y-5 px-4 py-3 text-xs leading-relaxed">
            <section className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80">
                版面
              </Label>
              <div className="flex flex-col gap-1">
                {(
                  [
                    ["auto", "自动（横屏双页）"],
                    ["single", "始终单页"],
                    ["double", "始终双页"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => void onSpreadChange(value)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-[13px] transition-colors",
                      spreadMode === value
                        ? "border-primary bg-primary/10 text-reader-chrome-fg"
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
                画布背景
              </Label>
              <div className="flex flex-col gap-1">
                {(
                  [
                    ["black", "纯黑"],
                    ["dim", "深灰"],
                    ["paper", "纸色"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSurface(value)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-[13px] transition-colors",
                      surface === value
                        ? "border-primary bg-primary/10 text-reader-chrome-fg"
                        : "border-reader-chrome-border bg-transparent text-reader-chrome-fg/90 hover:bg-reader-chrome-muted/25",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </ReaderSidePanelFrame>
      }
      beforeMain={
        <style>{`
        .readium-divina-host > div[aria-label="Book"] {
          width: 100% !important;
          height: 100% !important;
          min-height: 0 !important;
        }
        /* 勿对 iframe 设 width/height/top/left !important：FXL 依赖内联像素尺寸 + transform: scale() 铺满双页 */
        .readium-navigator-iframe {
          border: none !important;
        }
      `}</style>
      }
      main={
        <div
          ref={edgeTrackRef}
          onPointerDownCapture={onEdgePointerDownCapture}
          className={cn(
            "relative min-h-0 min-w-0 flex-1 basis-0 overflow-hidden",
            surface === "black" && "bg-black",
            surface === "dim" && "bg-zinc-950",
            surface === "paper" && "bg-background",
          )}
        >
          <div
            ref={containerRef}
            className="readium-divina-host absolute inset-0 overflow-hidden"
          />
          <ReaderPaginateEdgeTurnStrips
            nearLeft={nearLeft}
            nearRight={nearRight}
            onPrev={onReadiumEdgePrev}
            onNext={onReadiumEdgeNext}
            prevLabel="上一页"
            nextLabel="下一页"
            stripZClass="z-[80]"
          />
        </div>
      }
    />
  )
}
