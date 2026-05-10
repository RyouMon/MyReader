import { ReadiumTocPanel, type ReadiumTocRow } from "@/components/reader/readium/ReadiumTocPanel"
import { ReaderBottomStatusBar } from "@/components/reader/shared/ReaderBottomStatusBar"
import { ReaderChromeShell } from "@/components/reader/shared/ReaderChromeShell"
import { ReaderPaginateEdgeTurnStrips } from "@/components/reader/shared/ReaderPaginateEdgeTurnStrips"
import {
  ReaderSidePanelFrame,
  ReaderSidePanelHeader,
} from "@/components/reader/shared/ReaderSidePanelChrome"
import type { ReadingLayout } from "@/components/reader/types"
import { Label } from "@/components/ui/label"
import { useLocatorProgressSync } from "@/hooks/reader/useLocatorProgressSync"
import { useReaderPaginateEdgeTurn } from "@/hooks/reader/useReaderPaginateEdgeTurn"
import { useReaderPanels } from "@/hooks/reader/useReaderPanels"
import { useReadingChrome } from "@/hooks/reader/useReadingChrome"
import { patchEpubNavigatorFixedLayoutGoNav } from "@/lib/readium/epubFixedLayoutNavPatch"
import {
  applySpreadPreference,
  epubPreferencesForSpread,
  type ReflowThemePreset,
  type SpreadPreference,
} from "@/lib/readium/epubReaderPrefs"
import {
  readerSettingsToEpubPreferences,
  readerThemeToReflowPreset,
} from "@/lib/readium/readerSettingsBridge"
import {
  goToReadingOrderPositionBySteps,
  tocTargetReadingOrderIndex,
  tocTargetToLocator,
} from "@/lib/readium/tocNavigation"
import { cn } from "@/lib/utils"
import { useAppUiStore } from "@/stores/appUiStore"
import { EpubNavigator } from "@readium/navigator"
import { Layout, Links, Locator, LocatorLocations, type Publication } from "@readium/shared"
import { Settings } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

const RANGE_INPUT_CLASS = "mt-1.5 block w-full accent-primary disabled:opacity-50"

function walkTocLinks(links: Links | undefined, depth: number, out: ReadiumTocRow[]): void {
  if (!links) return
  for (const link of links.items) {
    out.push({
      depth,
      title: link.title?.trim() || link.href,
      href: link.href,
      type: link.type,
    })
    if (link.children?.items.length) walkTocLinks(link.children, depth + 1, out)
  }
}

type EpubSettingsPanelProps = {
  visible: boolean
  isFixedLayout: boolean
  onClose: () => void
}

function EpubSettingsPanel({ visible, isFixedLayout, onClose }: EpubSettingsPanelProps) {
  const spreadMode = useAppUiStore((s) => s.fixedLayout.spreadMode)
  const patchFixedLayout = useAppUiStore((s) => s.patchFixedLayout)
  const readerSettings = useAppUiStore((s) => s.reflowable.settings)
  const patchReflowableSettings = useAppUiStore((s) => s.patchReflowableSettings)
  const reflowThemeActive = readerThemeToReflowPreset(readerSettings.theme)

  const onSpreadChange = useCallback(
    (mode: SpreadPreference) => {
      patchFixedLayout({ spreadMode: mode })
    },
    [patchFixedLayout],
  )

  const onReflowThemeChange = useCallback(
    (preset: ReflowThemePreset) => {
      patchReflowableSettings({ theme: preset })
    },
    [patchReflowableSettings],
  )

  return (
    <ReaderSidePanelFrame visible={visible} side="right">
      <ReaderSidePanelHeader title="阅读设置" icon={Settings} onClose={onClose} />
      <div className="reader-chrome-muted space-y-5 px-4 py-3 text-xs leading-relaxed">
        {isFixedLayout ? (
          <section className="space-y-2">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80">
              固定版面 · 双页
            </Label>
            <p className="text-[11px] text-reader-chrome-fg/60">
              与 Thorium 类似：偏好写入本机配置，下次打开仍生效。
            </p>
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
                  onClick={() => onSpreadChange(value)}
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
        ) : (
          <>
            <section className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80">
                主题
              </Label>
              <div className="flex flex-col gap-1">
                {(
                  [
                    ["paper", "纸白"],
                    ["sepia", "护眼米黄"],
                    ["dark", "夜间深灰"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onReflowThemeChange(value)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-[13px] transition-colors",
                      reflowThemeActive === value
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
              <Label
                htmlFor="readium-font-size"
                className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80"
              >
                字号 {readerSettings.fontSize}px
              </Label>
              <input
                id="readium-font-size"
                type="range"
                min={14}
                max={26}
                step={1}
                value={readerSettings.fontSize}
                onChange={(e) =>
                  patchReflowableSettings({ fontSize: Number(e.target.value) || 18 })
                }
                className={RANGE_INPUT_CLASS}
              />
            </section>

            <section className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80">
                行距
              </Label>
              <div className="flex flex-wrap gap-1">
                {([1.35, 1.5, 1.65, 1.85, 2] as const).map((lh) => (
                  <button
                    key={lh}
                    type="button"
                    onClick={() => patchReflowableSettings({ lineHeight: lh })}
                    className={cn(
                      "rounded-md border px-2.5 py-1.5 text-[12px] transition-colors",
                      readerSettings.lineHeight === lh
                        ? "border-primary bg-primary/10 text-reader-chrome-fg"
                        : "border-reader-chrome-border bg-transparent text-reader-chrome-fg/90 hover:bg-reader-chrome-muted/25",
                    )}
                  >
                    {lh}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80">
                版式
              </Label>
              <div className="flex flex-col gap-1">
                {(
                  [
                    ["paginate", "分页"],
                    ["scroll", "连续滚动"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      patchReflowableSettings({ readingLayout: value as ReadingLayout })
                    }
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-[13px] transition-colors",
                      readerSettings.readingLayout === value
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
              <Label
                htmlFor="readium-page-margin"
                className="text-[11px] font-semibold uppercase tracking-wide text-reader-chrome-fg/80"
              >
                页边距（内边距系数）{readerSettings.paddingX.toFixed(1)}
              </Label>
              <input
                id="readium-page-margin"
                type="range"
                min={0}
                max={4}
                step={0.25}
                value={readerSettings.paddingX}
                onChange={(e) =>
                  patchReflowableSettings({ paddingX: Number(e.target.value) || 0 })
                }
                className={RANGE_INPUT_CLASS}
              />
            </section>
          </>
        )}
        <p className="text-[11px] text-reader-chrome-fg/55">
          偏好保存在应用数据目录的 config.json（readerUi），与书库进度分离。
        </p>
      </div>
    </ReaderSidePanelFrame>
  )
}

export type ReadiumEpubReaderProps = {
  bookTitle: string
  publication: Publication
  initialSavedLocator: Locator | null
  libraryId: string | null
  bookId: number
  format: string
  progressSyncEnabled: boolean
}

export function ReadiumEpubReader({
  bookTitle,
  publication,
  initialSavedLocator,
  libraryId,
  bookId,
  format,
  progressSyncEnabled,
}: ReadiumEpubReaderProps) {
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

  const readerPreferencesHydrated = useAppUiStore((s) => s.readerPreferencesHydrated)
  const spreadMode = useAppUiStore((s) => s.fixedLayout.spreadMode)
  const readerSettings = useAppUiStore((s) => s.reflowable.settings)

  const isFixedLayout = useMemo(
    () => EpubNavigator.determineLayout(publication, false) === Layout.fixed,
    [publication],
  )

  const epubNavigatorDefaults = useMemo(
    () => (isFixedLayout ? {} : { maximalLineLength: null }),
    [isFixedLayout],
  )

  const tocRows = useMemo(() => {
    const out: ReadiumTocRow[] = []
    walkTocLinks(publication.toc, 0, out)
    return out
  }, [publication])

  const onTocSelect = useCallback(
    async (row: ReadiumTocRow) => {
      const nav = navigatorRef.current
      if (!nav) return
      if (isFixedLayout) {
        const targetIndex = tocTargetReadingOrderIndex(publication, row)
        if (targetIndex >= 0) {
          await goToReadingOrderPositionBySteps(nav, targetIndex + 1)
          closePanels()
          return
        }
      }
      const locator = tocTargetToLocator(publication, row)
      if (!locator) return
      nav.go(locator, false, () => {})
      closePanels()
    },
    [isFixedLayout, publication, closePanels],
  )

  const edgeTurnActive =
    readiumNavReady && !tocOpen && !settingsOpen && !initError
  const { nearLeft, nearRight } = useReaderPaginateEdgeTurn(edgeTurnActive, readerRootRef)

  const onReadiumEdgePrev = useCallback(() => {
    navigatorRef.current?.goBackward(false, () => {})
  }, [])

  const onReadiumEdgeNext = useCallback(() => {
    navigatorRef.current?.goForward(false, () => {})
  }, [])

  useLocatorProgressSync({
    enabled: progressSyncEnabled && Boolean(libraryId) && format.length > 0,
    libraryId,
    bookId,
    format,
    currentLocator,
  })

  useEffect(() => {
    const nav = navigatorRef.current
    if (!nav || !readerPreferencesHydrated) return
    if (isFixedLayout) {
      void applySpreadPreference(nav, spreadMode)
      return
    }
    void (async () => {
      await nav.submitPreferences(readerSettingsToEpubPreferences(readerSettings))
      await nav.resizeHandler()
    })()
  }, [
    readerPreferencesHydrated,
    isFixedLayout,
    spreadMode,
    readerSettings.theme,
    readerSettings.fontSize,
    readerSettings.lineHeight,
    readerSettings.fontFamily,
    readerSettings.readingLayout,
    readerSettings.paddingX,
  ])

  useEffect(() => {
    if (!containerRef.current) return

    async function init() {
      try {
        const container = containerRef.current!
        if (publication.readingOrder.items.length === 0) {
          throw new Error("Publication has no reading order items")
        }

        const positions = publication.readingOrder.items.map(
          (item, index) =>
            new Locator({
              href: item.href,
              type: item.type ?? "application/xhtml+xml",
              title: item.title,
              locations: new LocatorLocations({
                position: index + 1,
                progression: 0,
              }),
            }),
        )

        let initialPosition = positions[0]
        if (initialSavedLocator) {
          const match = positions.find(
            (p) =>
              p.href === initialSavedLocator.href ||
              p.href.split("#")[0] === initialSavedLocator.href.split("#")[0],
          )
          if (match) {
            initialPosition = new Locator({
              href: initialSavedLocator.href,
              type: initialSavedLocator.type,
              title: initialSavedLocator.title ?? match.title,
              locations: initialSavedLocator.locations ?? match.locations,
              text: initialSavedLocator.text,
            })
          }
        }

        const ui = useAppUiStore.getState()
        const initialPreferences = isFixedLayout
          ? epubPreferencesForSpread(ui.fixedLayout.spreadMode)
          : readerSettingsToEpubPreferences(ui.reflowable.settings)

        const nav = new EpubNavigator(
          container,
          publication,
          {
            frameLoaded: () => {},
            positionChanged: (locator) => {
              setCurrentLocator(locator)
              setChapterTitle(locator.title?.trim() || "")
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
            preferences: initialPreferences,
            defaults: epubNavigatorDefaults,
          },
        )
        if (isFixedLayout) {
          patchEpubNavigatorFixedLayoutGoNav(nav)
        }
        await nav.load()
        requestAnimationFrame(() => {
          void nav.resizeHandler()
          requestAnimationFrame(() => {
            void nav.resizeHandler()
          })
        })
        navigatorRef.current = nav
        setReadiumNavReady(true)
        const store = useAppUiStore.getState()
        if (store.readerPreferencesHydrated) {
          if (isFixedLayout) {
            await applySpreadPreference(nav, store.fixedLayout.spreadMode)
          } else {
            await nav.submitPreferences(readerSettingsToEpubPreferences(store.reflowable.settings))
            await nav.resizeHandler()
          }
        }
        setCurrentLocator(nav.currentLocator)
        setChapterTitle(nav.currentLocator.title?.trim() || "")
      } catch (e) {
        console.error("[Readium] Failed to initialize navigator:", e)
        setInitError(String(e))
      }
    }

    void init()

    return () => {
      setReadiumNavReady(false)
      void navigatorRef.current?.destroy()
      navigatorRef.current = null
    }
  }, [publication, initialSavedLocator, showChrome, epubNavigatorDefaults, isFixedLayout])

  if (initError) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center bg-background p-8 text-center">
        <div>
          <p className="text-destructive font-medium mb-2">Readium 初始化失败</p>
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
          activeHref={currentLocator?.href?.split("#")[0] ?? null}
          onSelect={onTocSelect}
          onClose={closePanels}
        />
      }
      settingsPanel={
        <EpubSettingsPanel
          visible={settingsOpen}
          isFixedLayout={isFixedLayout}
          onClose={closePanels}
        />
      }
      beforeMain={
        <style>{`
        /*
          重排 EPUB：FrameManager 的 iframe 为 position:absolute 且不设宽高，浏览器默认约 300×150，
          ReflowableSetup 会把 --RS__viewportWidth 设为 iframe 的 innerWidth，导致整书按窄视口排版。
          仅对宿主下「直接子级」iframe 生效；FXL 的 iframe 在 bookElement/spine 内层，不受影响。
        */
        .readium-epub-host > .readium-navigator-iframe {
          border: none !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          box-sizing: border-box !important;
        }
      `}</style>
      }
      edgeTurnOverlays={
        <ReaderPaginateEdgeTurnStrips
          nearLeft={nearLeft}
          nearRight={nearRight}
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
            isFixedLayout
              ? `第 ${currentLocator?.locations?.position ?? 1} / ${publication.readingOrder.items.length} 页`
              : currentLocator?.locations?.progression != null
                ? `${Math.round((currentLocator.locations.progression ?? 0) * 100)}%`
                : undefined
          }
          progress={
            currentLocator?.locations?.totalProgression != null
              ? (currentLocator.locations.totalProgression ?? 0) * 100
              : undefined
          }
        />
      }
      main={
        <div
          ref={containerRef}
          className="readium-epub-host relative min-h-0 min-w-0 w-full flex-1 basis-0 overflow-hidden"
        />
      }
    />
  )
}
