import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { ImageChapterData, TocItem } from "@/lib/rendition"
import { ComicBottomBar } from "./ComicBottomBar"
import { ComicScrollViewport } from "./ComicScrollViewport"
import { ComicSettingsPanel } from "./ComicSettingsPanel"
import { ComicTocPanel } from "./ComicTocPanel"
import { ComicViewport } from "./ComicViewport"
import { ReaderTopBar } from "./ReaderTopBar"
import type { ReadingLayout } from "./types"
import type { UseReaderReturn } from "./useReader"
import { useReadingChrome } from "./useReadingChrome"

export type DisplayMode = "single" | "spread"
export type ZoomMode = "fit-height" | "fit-width" | "original"
export type ReadingDirection = "ltr" | "rtl"

export interface ComicSettings {
  readingLayout: ReadingLayout
  displayMode: DisplayMode
  zoomMode: ZoomMode
  direction: ReadingDirection
  brightness: number
  pageGap: number
}

const DEFAULT_COMIC_SETTINGS: ComicSettings = {
  readingLayout: "paginate",
  displayMode: "single",
  zoomMode: "fit-height",
  direction: "ltr",
  brightness: 100,
  pageGap: 16,
}

interface ComicReaderProps {
  bookTitle: string
  /** Calibre format code, e.g. CBZ / PDF — shown in the top bar. */
  format: string
  reader: UseReaderReturn
  onBack: () => void
}

export function ComicReader({
  bookTitle,
  format,
  reader,
  onBack,
}: ComicReaderProps) {
  const readerRootRef = useRef<HTMLDivElement>(null)
  const chrome = useReadingChrome({ rootRef: readerRootRef })
  const comicScrollRef = useRef<HTMLDivElement>(null)
  const [scrollBookProgress, setScrollBookProgress] = useState(0)

  const [tocOpen, setTocOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bookmarked, setBookmarked] = useState(false)
  const [settings, setSettings] = useState<ComicSettings>(
    DEFAULT_COMIC_SETTINGS,
  )
  const [turnDirection, setTurnDirection] = useState<
    "forward" | "backward" | null
  >(null)
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clickTurnPendingRef = useRef(false)
  const clickTurnMovedRef = useRef(false)
  const clickTurnStartRef = useRef<{ x: number; y: number } | null>(null)

  const [spreadPage, setSpreadPage] = useState<ImageChapterData | null>(null)

  const currentPage = reader.chapter as ImageChapterData | null
  const currentIndex = reader.curChapter
  const totalPages = reader.totalChapters

  const getChapter = reader.getChapter

  // biome-ignore lint/correctness/useExhaustiveDependencies: 需在布局或双页模式变化时校正双页设置
  useEffect(() => {
    setSettings((s) => {
      if (s.readingLayout === "scroll" && s.displayMode === "spread") {
        return { ...s, displayMode: "single" }
      }
      return s
    })
  }, [settings.readingLayout, settings.displayMode])

  useEffect(() => {
    if (
      settings.readingLayout !== "paginate" ||
      settings.displayMode !== "spread" ||
      currentIndex + 1 >= totalPages
    ) {
      setSpreadPage(null)
      return
    }
    let cancelled = false
    getChapter(currentIndex + 1).then((ch) => {
      if (cancelled) return
      if (ch?.type === "image") setSpreadPage(ch)
      else setSpreadPage(null)
    })
    return () => {
      cancelled = true
    }
  }, [
    settings.readingLayout,
    settings.displayMode,
    currentIndex,
    totalPages,
    getChapter,
  ])

  const toggleToc = useCallback(() => {
    setTocOpen((v) => {
      if (!v) setSettingsOpen(false)
      return !v
    })
  }, [])

  const toggleSettings = useCallback(() => {
    setSettingsOpen((v) => {
      if (!v) setTocOpen(false)
      return !v
    })
  }, [])

  const closePanels = useCallback(() => {
    setTocOpen(false)
    setSettingsOpen(false)
  }, [])

  const toggleBookmark = useCallback(() => setBookmarked((v) => !v), [])

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
    const el = comicScrollRef.current
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

  const handleSelectPage = useCallback(
    (index: number) => {
      goToPage(index)
      closePanels()
      if (settings.readingLayout === "scroll") {
        requestAnimationFrame(() => {
          comicScrollRef.current
            ?.querySelector(`[data-index="${index}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        })
      }
    },
    [goToPage, closePanels, settings.readingLayout],
  )

  const handleBookProgressSeek = useCallback(
    (pct: number) => {
      const p = Math.max(0, Math.min(100, pct))
      if (settings.readingLayout === "scroll") {
        const el = comicScrollRef.current
        if (!el) return
        const max = el.scrollHeight - el.clientHeight
        if (max <= 0) return
        el.scrollTo({ top: (p / 100) * max, behavior: "smooth" })
        return
      }
      if (totalPages <= 0) return
      const idx = Math.round((p / 100) * Math.max(0, totalPages - 1))
      goToPage(idx)
    },
    [settings.readingLayout, totalPages, goToPage],
  )

  const handleReadingMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || e.detail !== 1) return
      if (chrome.chromeVisible) return
      if (settings.readingLayout !== "paginate") return
      clickTurnPendingRef.current = true
      clickTurnMovedRef.current = false
      clickTurnStartRef.current = { x: e.clientX, y: e.clientY }
    },
    [chrome, settings.readingLayout],
  )

  const handleReadingMouseMove = useCallback((e: React.MouseEvent) => {
    if (!clickTurnPendingRef.current || clickTurnMovedRef.current) return
    const start = clickTurnStartRef.current
    if (!start) return
    if (e.clientX !== start.x || e.clientY !== start.y) {
      clickTurnMovedRef.current = true
    }
  }, [])

  const resetClickTurnState = useCallback(() => {
    clickTurnPendingRef.current = false
    clickTurnMovedRef.current = false
    clickTurnStartRef.current = null
  }, [])

  const handleReadingMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!clickTurnPendingRef.current || e.button !== 0) {
        resetClickTurnState()
        return
      }
      const shouldTurnPage = !clickTurnMovedRef.current
      if (!shouldTurnPage) {
        resetClickTurnState()
        return
      }

      const el = e.currentTarget as HTMLElement
      const r = el.getBoundingClientRect()
      const x = e.clientX - r.left
      const ltr = settings.direction === "ltr"
      if (x < r.width / 2) {
        ;(ltr ? prevPage : nextPage)()
      } else {
        ;(ltr ? nextPage : prevPage)()
      }
      resetClickTurnState()
    },
    [settings.direction, prevPage, nextPage, resetClickTurnState],
  )

  const updateSettings = useCallback(
    (patch: Partial<ComicSettings>) =>
      setSettings((prev) => ({ ...prev, ...patch })),
    [],
  )

  const mediaLabel = useMemo(() => {
    const u = format.toUpperCase()
    if (u === "PDF") return "PDF"
    if (u === "CBZ") return "漫画"
    return u
  }, [format])

  const pageTitle = useMemo(() => {
    if (settings.displayMode === "spread" && currentIndex + 1 < totalPages) {
      return `第 ${currentIndex + 1}-${currentIndex + 2} / ${totalPages} 页`
    }
    return `第 ${currentIndex + 1} / ${totalPages} 页`
  }, [settings.displayMode, currentIndex, totalPages])

  const topChapterLine = useMemo(
    () => (mediaLabel ? `${mediaLabel} · ${pageTitle}` : pageTitle),
    [mediaLabel, pageTitle],
  )

  const paginateProgress =
    totalPages > 0 ? Math.round(((currentIndex + 1) / totalPages) * 100) : 0
  const barProgress =
    settings.readingLayout === "scroll" ? scrollBookProgress : paginateProgress

  const tocEntries = useMemo(
    () => buildTocEntries(reader.toc, totalPages),
    [reader.toc, totalPages],
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest?.("input, textarea, select, [contenteditable=true]"))
        return

      switch (e.key) {
        case "ArrowUp":
          if (settings.readingLayout === "scroll") {
            e.preventDefault()
            scrollByViewport(-1)
          }
          break
        case "ArrowDown":
          if (settings.readingLayout === "scroll") {
            e.preventDefault()
            scrollByViewport(1)
          }
          break
        case "ArrowLeft":
          if (settings.readingLayout !== "scroll") {
            settings.direction === "rtl" ? nextPage() : prevPage()
          }
          break
        case "ArrowRight":
          if (settings.readingLayout !== "scroll") {
            settings.direction === "rtl" ? prevPage() : nextPage()
          }
          break
        case "Escape":
          if (tocOpen || settingsOpen) closePanels()
          else chrome.hideChrome()
          break
        case "f":
        case "F":
          document.documentElement.requestFullscreen?.()
          break
        default:
          break
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    settings.direction,
    settings.readingLayout,
    nextPage,
    prevPage,
    tocOpen,
    settingsOpen,
    closePanels,
    chrome,
    scrollByViewport,
  ])

  return (
    <div
      ref={readerRootRef}
      data-reader-mode="comic"
      className="relative flex size-full flex-col overflow-hidden"
      style={{ background: "var(--viewer-bg, #1a1a1a)" }}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 阅读区鼠标手势 */}
      <div
        className="relative flex min-h-0 flex-1 flex-col"
        onMouseDown={handleReadingMouseDown}
        onMouseMove={handleReadingMouseMove}
        onMouseUp={handleReadingMouseUp}
        onMouseLeave={resetClickTurnState}
      >
        {settings.readingLayout === "scroll" ? (
          <ComicScrollViewport
            totalPages={totalPages}
            getChapter={getChapter}
            scrollRef={comicScrollRef}
            brightness={settings.brightness}
            zoomMode={settings.zoomMode}
            onScrollProgress={setScrollBookProgress}
          />
        ) : (
          <ComicViewport
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
        visible={chrome.chromeVisible}
        bookTitle={bookTitle}
        chapterTitle={topChapterLine}
        bookmarked={bookmarked}
        onBack={onBack}
        onToggleToc={toggleToc}
        onToggleBookmark={toggleBookmark}
        onToggleSettings={toggleSettings}
      />

      <ComicBottomBar
        visible={chrome.chromeVisible}
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

      {/* biome-ignore lint/a11y/noStaticElementInteractions: 全屏蒙层 */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Esc 关闭侧栏 */}
      <div
        className="absolute inset-0 z-55 transition-all duration-300"
        style={{
          background:
            tocOpen || settingsOpen ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0)",
          pointerEvents: tocOpen || settingsOpen ? "auto" : "none",
        }}
        onClick={closePanels}
      />

      <ComicTocPanel
        visible={tocOpen}
        entries={tocEntries}
        currentPage={currentIndex}
        totalPages={totalPages}
        onSelectPage={handleSelectPage}
        getPageImage={reader.getChapter}
      />

      <ComicSettingsPanel
        visible={settingsOpen}
        settings={settings}
        onSettingsChange={updateSettings}
      />
    </div>
  )
}

interface ComicTocEntry {
  label: string
  pageIndex: number
}

function buildTocEntries(toc: TocItem[], totalPages: number): ComicTocEntry[] {
  if (toc.length > 0) {
    return toc.map((t) => ({
      label: t.label || `第 ${t.index + 1} 页`,
      pageIndex: t.index,
    }))
  }
  if (totalPages <= 0) return []
  return Array.from({ length: totalPages }, (_, i) => ({
    label: `第 ${i + 1} 页`,
    pageIndex: i,
  }))
}
