import { EpubNavigator } from "@readium/navigator"
import {
  Locator,
  LocatorLocations,
  Page,
  type Publication,
  ReadingProgression,
} from "@readium/shared"
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
import { useReaderIframePointerBridge } from "@/hooks/reader/useReaderIframePointerBridge"
import { useReaderPaginateEdgeHover } from "@/hooks/reader/useReaderPaginateEdgeHover"
import { useReaderPanels } from "@/hooks/reader/useReaderPanels"
import { useReadingChrome } from "@/hooks/reader/useReadingChrome"
import { patchEpubNavigatorFixedLayoutGoNav } from "@/lib/readium/epubFixedLayoutNavPatch"
import {
  applySpreadPreference,
  epubPreferencesForSpread,
} from "@/lib/readium/epubReaderPrefs"
import { resolveFixedBackgroundColor } from "@/lib/readium/fixedLayoutPreferences"
import { tocTargetToLocator } from "@/lib/readium/tocNavigation"
import { useAppUiStore } from "@/stores/appUiStore"

function applyPublicationReadingProgression(
  publication: Publication,
  direction: "ltr" | "rtl",
) {
  const target =
    direction === "rtl" ? ReadingProgression.rtl : ReadingProgression.ltr
  if (publication.metadata.readingProgression === target) return

  publication.metadata.readingProgression = target
  for (const item of publication.readingOrder.items) {
    const page = item.properties?.page
    if (page === Page.left || page === Page.right) {
      item.properties = item.properties?.add({
        page: page === Page.left ? Page.right : Page.left,
      })
    }
  }
}

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
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const navigatorRef = useRef<EpubNavigator | null>(null)
  const currentLocatorRef = useRef<Locator | null>(null)
  const { tocOpen, settingsOpen, toggleToc, toggleSettings, closePanels } =
    useReaderPanels()
  const {
    readerRootRef,
    chromeVisible,
    showChrome,
    scheduleChromeHide,
    handlePointerPosition,
  } = useReadingChrome(false, tocOpen || settingsOpen)
  useReaderIframePointerBridge(containerRef, handlePointerPosition)
  const [bookmarked, setBookmarked] = useState(false)
  const [readiumNavReady, setReadiumNavReady] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [chapterTitle, setChapterTitle] = useState("")
  const [currentLocator, setCurrentLocator] = useState<Locator | null>(null)
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

  const tocRows: ReadiumTocRow[] = useMemo(() => {
    return publication.readingOrder.items.map((item, i) => ({
      key: item.href,
      depth: 0,
      title:
        item.title?.trim() ||
        t("reader.pageCount", { current: i + 1, total: "" }).replace(" / ", ""),
      href: item.href,
      type: item.type,
    }))
  }, [publication, t])

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

  const isRtl = direction === "rtl"
  const edgeTurnActive =
    readiumNavReady && !tocOpen && !settingsOpen && !initError
  const { nearLeft, nearRight } = useReaderPaginateEdgeHover(
    edgeTurnActive,
    readerRootRef,
  )

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

  const onProgressSeek = useCallback(
    (progress: number) => {
      if (positions.length === 0) return
      const normalized = Math.max(0, Math.min(100, progress)) / 100
      const targetIndex = Math.round(normalized * (positions.length - 1))
      goToIndex(targetIndex)
    },
    [goToIndex, positions],
  )
  const resolveProgressCommit = useCallback(
    (progress: number) => {
      if (positions.length <= 1) return 0
      const normalized = Math.max(0, Math.min(100, progress)) / 100
      const targetIndex = Math.round(normalized * (positions.length - 1))
      return (targetIndex / (positions.length - 1)) * 100
    },
    [positions.length],
  )
  const getProgressPreview = useCallback(
    (nextProgress: number) => {
      const total = Math.max(1, positions.length)
      const targetIndex =
        total > 1
          ? Math.round(
              (Math.max(0, Math.min(100, nextProgress)) / 100) * (total - 1),
            )
          : 0
      const current = targetIndex + 1
      const label = t("reader.pageCount", { current, total })
      return {
        chapterTitle: tocRows[targetIndex]?.title ?? label,
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
  })

  useEffect(() => {
    const nav = navigatorRef.current
    if (nav) void applySpreadPreference(nav, spreadMode)
  }, [spreadMode])

  useEffect(() => {
    if (!containerRef.current) return

    let cancelled = false
    let nav: EpubNavigator | null = null

    async function init() {
      try {
        const container = containerRef.current!
        applyPublicationReadingProgression(publication, direction)
        const items = publication.readingOrder.items
        if (items.length === 0) throw new Error("No pages in comic")

        let initialPosition: Locator = positions[0]
        const restoredLocator = currentLocatorRef.current ?? initialSavedLocator
        if (restoredLocator) {
          const pos = restoredLocator.locations?.position
          if (typeof pos === "number" && pos >= 1 && pos <= positions.length) {
            initialPosition = positions[pos - 1]
          } else {
            const m = positions.findIndex(
              (p) => p.href === restoredLocator.href,
            )
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
              currentLocatorRef.current = locator
              setCurrentLocator(locator)
              const idx = (locator.locations?.position ?? 1) - 1
              const itemTitle = items[idx]?.title?.trim()
              setChapterTitle(
                itemTitle ||
                  t("reader.pageCount", {
                    current: locator.locations?.position ?? 1,
                    total: "",
                  }).replace(" / ", ""),
              )
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
              const isRtl = direction === "rtl"
              if (
                key === "ArrowRight" ||
                key === "PageDown" ||
                rec.keyCode === 39
              ) {
                stepBy(isRtl ? -1 : 1)
              } else if (
                key === "ArrowLeft" ||
                key === "PageUp" ||
                rec.keyCode === 37
              ) {
                stepBy(isRtl ? 1 : -1)
              }
            },
          },
          positions,
          initialPosition,
          {
            preferences: epubPreferencesForSpread(
              useAppUiStore.getState().fixedLayout.spreadMode,
            ),
            defaults: {},
          },
        )
        patchEpubNavigatorFixedLayoutGoNav(nav)
        await nav.load()
        await applySpreadPreference(
          nav,
          useAppUiStore.getState().fixedLayout.spreadMode,
        )
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
          if (
            typeof slide === "number" &&
            slide !== currentIdx &&
            slide >= 0 &&
            slide < positions.length
          ) {
            ;(nav as any).currentLocation = positions[slide]
          }
        }

        navigatorRef.current = nav
        setReadiumNavReady(true)
        currentLocatorRef.current = nav.currentLocator
        setCurrentLocator(nav.currentLocator)
        const p0 = nav.currentLocator.locations?.position ?? 1
        setChapterTitle(
          items[p0 - 1]?.title?.trim() ||
            t("reader.pageCount", { current: p0, total: "" }).replace(
              " / ",
              "",
            ),
        )
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
  }, [direction, initialSavedLocator, positions, publication, showChrome, t])

  if (initError) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center bg-background p-8 text-center">
        <div>
          <p className="text-destructive font-medium mb-2">
            {t("reader.loadComicFailed")}
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
        chapterTitle: format.toUpperCase() === "CBZ" ? "" : chapterTitle,
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
          activeKey={currentLocator?.href ?? null}
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
            <FixedLayoutSettingsPanel showPageDirection={false} />
          </ReaderSidePanelScrollArea>
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
          direction={direction}
          showPrev={isRtl ? nearRight : nearLeft}
          showNext={isRtl ? nearLeft : nearRight}
          onPrev={onReadiumEdgePrev}
          onNext={onReadiumEdgeNext}
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
                  current: currentLocator?.locations?.position ?? 1,
                  total: positions.length,
                })
              : undefined
          }
          progress={
            positions.length > 1
              ? (((currentLocator?.locations?.position ?? 1) - 1) /
                  (positions.length - 1)) *
                100
              : 0
          }
          getProgressPreview={getProgressPreview}
          resolveProgressCommit={resolveProgressCommit}
          onProgressChange={onProgressSeek}
          onProgressStepBackward={onReadiumEdgePrev}
          onProgressStepForward={onReadiumEdgeNext}
        />
      }
      main={
        <div
          ref={containerRef}
          className="readium-divina-host relative min-h-0 min-w-0 w-full flex-1 basis-0 overflow-hidden"
          style={{ backgroundColor }}
        />
      }
    />
  )
}
