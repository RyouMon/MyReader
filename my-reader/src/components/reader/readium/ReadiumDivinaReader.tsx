import { ReadiumTocPanel, type ReadiumTocRow } from "@/components/reader/readium/ReadiumTocPanel"
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
import { patchEpubNavigatorFixedLayoutGoNav } from "@/lib/readium/epubFixedLayoutNavPatch"
import {
  applySpreadPreference,
  epubPreferencesForSpread,
  type SpreadPreference,
} from "@/lib/readium/epubReaderPrefs"
import { tocTargetToLocator } from "@/lib/readium/tocNavigation"
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

  const tocRows: ReadiumTocRow[] = useMemo(() => {
    return publication.readingOrder.items.map((item, i) => ({
      depth: 0,
      title: item.title?.trim() || `第 ${i + 1} 页`,
      href: item.href,
      type: item.type,
    }))
  }, [publication])

  const goToIndex = useCallback(
    (targetIndex: number) => {
      const nav = navigatorRef.current
      if (!nav) return
      if (targetIndex < 0 || targetIndex >= positions.length) return
      nav.go(positions[targetIndex], false, () => {})
    },
    [positions],
  )

  const onTocSelect = useCallback(
    (row: ReadiumTocRow) => {
      const nav = navigatorRef.current
      if (!nav) return
      const items = publication.readingOrder.items
      const hrefWithoutFragment = row.href.split("#")[0]
      const idx = items.findIndex((link) => link.href === hrefWithoutFragment)
      if (idx >= 0) {
        goToIndex(idx)
      } else {
        const locator = tocTargetToLocator(publication, row)
        if (locator) nav.go(locator, false, () => {})
      }
      closePanels()
    },
    [publication, closePanels, goToIndex],
  )

  const isRtl = publication.metadata.effectiveReadingProgression === "rtl"
  const edgeTurnActive =
    readiumNavReady && !tocOpen && !settingsOpen && !initError
  const { nearLeft, nearRight } = useReaderPaginateEdgeTurn(edgeTurnActive, readerRootRef)

  const onReadiumEdgePrev = useCallback(() => {
    const nav = navigatorRef.current
    if (!nav) return
    const fp = (nav as any).framePool
    const perPage = fp?.perPage ?? 1
    const currentSlide = fp?.currentSlide ?? 0
    const targetSlide = Math.max(0, currentSlide - perPage)
    goToIndex(targetSlide)
  }, [goToIndex])

  const onReadiumEdgeNext = useCallback(() => {
    const nav = navigatorRef.current
    if (!nav) return
    const fp = (nav as any).framePool
    const perPage = fp?.perPage ?? 1
    const currentSlide = fp?.currentSlide ?? 0
    const targetSlide = Math.min(positions.length - 1, currentSlide + perPage)
    goToIndex(targetSlide)
  }, [goToIndex, positions])

  useLocatorProgressSync({
    enabled: progressSyncEnabled && Boolean(libraryId) && format.length > 0,
    libraryId,
    bookId,
    format,
    currentLocator,
  })

  useEffect(() => {
    if (!containerRef.current) return

    let cancelled = false
    let nav: EpubNavigator | null = null

    async function init() {
      try {
        const container = containerRef.current!
        const items = publication.readingOrder.items
        if (items.length === 0) throw new Error("No pages in comic")

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

        const stepBy = (delta: 1 | -1) => {
          const nav2 = navigatorRef.current
          if (!nav2) return
          const fp = (nav2 as any).framePool
          const perPage = fp?.perPage ?? 1
          const currentSlide = fp?.currentSlide ?? 0
          const nextSlide = currentSlide + delta * perPage
          if (nextSlide < 0 || nextSlide >= positions.length) return
          nav2.go(positions[nextSlide], false, () => {})
        }

        nav = new EpubNavigator(
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
              const rec = ev as { key?: string; keyCode?: number }
              const key = rec.key ?? ""
              const isRtl = publication.metadata.effectiveReadingProgression === "rtl"
              if (key === "ArrowRight" || key === "PageDown" || rec.keyCode === 39) {
                stepBy(isRtl ? -1 : 1)
              } else if (key === "ArrowLeft" || key === "PageUp" || rec.keyCode === 37) {
                stepBy(isRtl ? 1 : -1)
              }
            },
          },
          positions,
          initialPosition,
          {
            preferences: epubPreferencesForSpread("auto"),
            defaults: {},
          },
        )
        patchEpubNavigatorFixedLayoutGoNav(nav)
        await nav.load()
        await applySpreadPreference(nav, "auto")
        requestAnimationFrame(() => {
          void nav!.resizeHandler()
          requestAnimationFrame(() => {
            void nav!.resizeHandler()
          })
        })
        if (cancelled) {
          await nav.destroy()
          return
        }

        const fp = (nav as any).framePool
        if (fp) {
          const slide = fp.currentSlide
          const currentPos = (nav as any).currentLocation?.locations?.position
          const currentIdx = typeof currentPos === "number" ? currentPos - 1 : 0
          if (typeof slide === "number" && slide !== currentIdx && slide >= 0 && slide < positions.length) {
            (nav as any).currentLocation = positions[slide]
          }
        }

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
      cancelled = true
      setReadiumNavReady(false)
      void nav?.destroy()
      navigatorRef.current = null
    }
  }, [publication, initialSavedLocator, positions, showChrome])

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
                      "rounded-md border px-3 py-2 text-start text-[13px] transition-colors",
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
                      "rounded-md border px-3 py-2 text-start text-[13px] transition-colors",
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
        /* 勿对 iframe 设 width/height/top/left !important：FXL 依赖内联像素尺寸 + transform: scale() 铺满双页 */
        .readium-navigator-iframe {
          border: none !important;
        }
      `}</style>
      }
      edgeTurnOverlays={
        <ReaderPaginateEdgeTurnStrips
          nearLeft={isRtl ? nearRight : nearLeft}
          nearRight={isRtl ? nearLeft : nearRight}
          onPrev={onReadiumEdgePrev}
          onNext={onReadiumEdgeNext}
          prevLabel="上一页"
          nextLabel="下一页"
        />
      }
      bottomStatusBar={
        <ReaderBottomStatusBar
          visible={chromeVisible}
          leftText={
            positions.length > 0
              ? `第 ${currentLocator?.locations?.position ?? 1} / ${positions.length} 页`
              : undefined
          }
          progress={
            positions.length > 1
              ? (((currentLocator?.locations?.position ?? 1) - 1) /
                  (positions.length - 1)) *
                100
              : 0
          }
        />
      }
      main={
        <div
          ref={containerRef}
          className={cn(
            "readium-divina-host relative min-h-0 min-w-0 w-full flex-1 basis-0 overflow-hidden",
            surface === "black" && "bg-black",
            surface === "dim" && "bg-zinc-950",
            surface === "paper" && "bg-background",
          )}
        />
      }
    />
  )
}
