import { ChevronLeft, ChevronRight } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { TextChapterData } from "@/lib/rendition"
import { ReaderBottomBar } from "./ReaderBottomBar"
import { ReaderContent } from "./ReaderContent"
import { ReaderScrollContent } from "./ReaderScrollContent"
import { ReaderTopBar } from "./ReaderTopBar"
import { SettingsPanel } from "./SettingsPanel"
import { TocPanel } from "./TocPanel"
import { TtsPanel } from "./TtsPanel"
import type { ReaderSurfaceProps } from "./types"
import { useReaderStore } from "./useReaderStore"
import { useReadingChrome } from "./useReadingChrome"

export function TextReader({ bookTitle, reader }: ReaderSurfaceProps) {
  const chapter = reader.chapter as TextChapterData
  const {
    toc,
    totalChapters,
    curChapter,
    curPageIndex,
    isChapterStartFromEnd,
    getChapter,
    gotoPage,
    gotoNextPage,
    gotoPrevPage,
    gotoPageInChapter,
    layout: applyLayout,
    format,
  } = reader
  const store = useReaderStore()
  const readerRootRef = useRef<HTMLDivElement>(null)
  const chrome = useReadingChrome({
    rootRef: readerRootRef,
    expandBottomForTts: store.ttsActive,
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const [paginateNavLeftVisible, setPaginateNavLeftVisible] = useState(false)
  const [paginateNavRightVisible, setPaginateNavRightVisible] = useState(false)

  // 章节内页级进度（0-100），由 ReaderContent.onProgressChange 驱动
  const [chapterProgressPct, setChapterProgressPct] = useState(0)

  // ── 滚动模式：全书章节列表 ─────────────────────────────────────────────
  const [scrollChapters, setScrollChapters] = useState<
    TextChapterData[] | null
  >(null)
  const [scrollLoadError, setScrollLoadError] = useState<string | null>(null)
  const [bookProgress, setBookProgress] = useState(0)
  const [scrollFocusIndex, setScrollFocusIndex] = useState(curChapter)

  const layout = store.settings.readingLayout
  const prevLayoutRef = useRef<typeof layout | null>(null)

  const mediaLabel = useMemo(() => {
    const u = format.toUpperCase()
    if (u === "PDF") return "PDF"
    if (u === "CBZ") return "漫画"
    return u
  }, [format])

  const topChapterLine = useMemo(
    () => (mediaLabel ? `${mediaLabel} · ${chapter.title}` : chapter.title),
    [mediaLabel, chapter.title],
  )

  // ── TTS ──────────────────────────────────────────────────────────────────
  const ttsChapter = useMemo(() => {
    if (layout === "scroll" && scrollChapters?.length) {
      return scrollChapters.find((c) => c.index === scrollFocusIndex) ?? chapter
    }
    return chapter
  }, [layout, scrollChapters, scrollFocusIndex, chapter])

  const sentences = useMemo(
    () =>
      ttsChapter.text
        .split(/(?<=[。？！.?!]+["'」』）)】]*)/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    [ttsChapter.text],
  )

  const handleTtsTogglePlay = useCallback(
    () => store.ttsTogglePlay(sentences.length),
    [store, sentences.length],
  )

  const handleTtsNext = useCallback(
    () => store.ttsNext(sentences.length),
    [store, sentences.length],
  )

  // ── 章节导航 ─────────────────────────────────────────────────────────────
  /** 向前翻章：新章从末页开始 */
  const handlePrevChapter = useCallback(() => {
    if (curChapter <= 0) return
    void gotoPage(curChapter - 1, Number.MAX_SAFE_INTEGER)
  }, [curChapter, gotoPage])

  /** 向后翻章：新章从首页开始 */
  const handleNextChapter = useCallback(() => {
    if (curChapter >= totalChapters - 1) return
    void gotoPage(curChapter + 1, 0)
  }, [curChapter, totalChapters, gotoPage])

  /** 目录直跳：始终从首页开始 */
  const handleSelectChapter = useCallback(
    (idx: number) => {
      void gotoPage(idx, 0)
      store.closePanels()
    },
    [gotoPage, store],
  )

  // ── 翻页（分页模式） ──────────────────────────────────────────────────────
  /**
   * 分页模式翻页统一走 Reader 控制器 API。
   */
  const handlePaginateTurn = useCallback(
    (direction: "prev" | "next") => {
      if (layout !== "paginate") return
      if (direction === "prev") {
        void gotoPrevPage()
        return
      }
      void gotoNextPage()
    },
    [layout, gotoNextPage, gotoPrevPage],
  )

  // ── 布局切换 ─────────────────────────────────────────────────────────────
  const handleLayoutChange = useCallback(
    (l: typeof layout) => {
      store.updateSettings({ readingLayout: l })
    },
    [store],
  )

  // ── 进度 ──────────────────────────────────────────────────────────────────
  /**
   * 翻页模式：全书进度 = 章节基础进度 + 章内页级进度。
   *   chapterBase   = curChapter / totalChapters          （0 → 1）
   *   withinChapter = (chapterProgressPct / 100) / totalChapters
   */
  const paginateBookProgress = useMemo(() => {
    if (totalChapters <= 0) return 0
    const chapterBase = curChapter / totalChapters
    const withinChapter = chapterProgressPct / 100 / totalChapters
    return Math.round((chapterBase + withinChapter) * 100)
  }, [curChapter, totalChapters, chapterProgressPct])

  const displayedBookProgress =
    layout === "scroll" ? bookProgress : paginateBookProgress

  // 切章/切布局时将章内进度重置为起始端，避免短暂显示旧章进度。
  // 起始端由 Reader 控制器提供。
  useEffect(() => {
    if (layout !== "paginate") return
    setChapterProgressPct(isChapterStartFromEnd ? 100 : 0)
  }, [layout, isChapterStartFromEnd])

  // ── 进度拖动/跳转 ─────────────────────────────────────────────────────────
  const handlePaginatePageStateChange = useCallback(
    (pageIndex: number, pageCount: number) => {
      gotoPageInChapter(pageCount, pageIndex)
    },
    [gotoPageInChapter],
  )

  const handleBookProgressSeek = useCallback(
    (pct: number) => {
      const p = Math.max(0, Math.min(100, pct))
      if (layout === "paginate") {
        if (totalChapters <= 0) return
        const idx = Math.round((p / 100) * Math.max(0, totalChapters - 1))
        void gotoPage(idx, 0)
        return
      }
      const el = scrollRef.current
      if (!el) return
      const max = el.scrollHeight - el.clientHeight
      if (max <= 0) return
      el.scrollTo({ top: (p / 100) * max, behavior: "smooth" })
    },
    [layout, totalChapters, gotoPage],
  )

  // ── 滚动模式：加载全书 ────────────────────────────────────────────────────
  useEffect(() => {
    if (layout !== "scroll") {
      setScrollChapters(null)
      setScrollLoadError(null)
      return
    }
    let cancelled = false
    setScrollChapters(null)
    setScrollLoadError(null)
    ;(async () => {
      try {
        const list: TextChapterData[] = []
        for (let i = 0; i < totalChapters; i++) {
          const d = await getChapter(i)
          if (cancelled) return
          if (d?.type === "text") list.push(d)
        }
        if (!cancelled) setScrollChapters(list)
      } catch (e) {
        if (!cancelled) setScrollLoadError(String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [layout, totalChapters, getChapter])

  // ── 滚动模式：同步焦点章节 ───────────────────────────────────────────────
  const scrollFocusIndexRef = useRef(scrollFocusIndex)
  scrollFocusIndexRef.current = scrollFocusIndex

  useEffect(() => {
    if (layout !== "scroll") return
    setScrollFocusIndex(curChapter)
  }, [curChapter, layout])

  const scrollToChapterStart = useCallback((chapterIndex: number) => {
    const root = scrollRef.current
    if (!root) return
    const el = root.querySelector<HTMLElement>(
      `[data-chapter-index="${chapterIndex}"]`,
    )
    el?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  useEffect(() => {
    if (layout !== "scroll" || !scrollChapters?.length) return
    const t = window.requestAnimationFrame(() =>
      scrollToChapterStart(curChapter),
    )
    return () => window.cancelAnimationFrame(t)
  }, [layout, scrollChapters, curChapter, scrollToChapterStart])

  // ── 滚动 → 翻页切换时保留焦点章节 ──────────────────────────────────────
  useEffect(() => {
    const prev = prevLayoutRef.current
    prevLayoutRef.current = layout
    if (prev === "scroll" && layout === "paginate") {
      const target = scrollFocusIndexRef.current
      if (target !== curChapter) {
        void gotoPage(target, 0)
      }
    }
  }, [layout, curChapter, gotoPage])

  // ── 键盘 ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest?.("input, textarea, select, [contenteditable=true]"))
        return

      if (e.key === "Escape") {
        if (store.tocOpen || store.settingsOpen) store.closePanels()
        else chrome.hideChrome()
        return
      }

      if (layout === "scroll") {
        const el = scrollRef.current
        if (el && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
          e.preventDefault()
          const step = Math.round(el.clientHeight * 0.85)
          el.scrollBy({
            top: e.key === "ArrowUp" ? -step : step,
            behavior: "smooth",
          })
        }
        return
      }

      if (e.key === "ArrowLeft") handlePaginateTurn("prev")
      if (e.key === "ArrowRight") handlePaginateTurn("next")
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [store, chrome, layout, handlePaginateTurn])

  /** 指针靠近阅读器左/右边缘时分别显示对应翻页键（与顶底工具栏感应方式一致，用 document 监听） */
  useEffect(() => {
    if (layout !== "paginate") {
      setPaginateNavLeftVisible(false)
      setPaginateNavRightVisible(false)
      return
    }
    const edgePx = 72
    const onMove = (e: PointerEvent) => {
      const root = readerRootRef.current
      if (!root) return
      const r = root.getBoundingClientRect()
      const { clientX: x, clientY: y } = e
      const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
      if (!inside) {
        setPaginateNavLeftVisible(false)
        setPaginateNavRightVisible(false)
        return
      }
      setPaginateNavLeftVisible(x - r.left <= edgePx)
      setPaginateNavRightVisible(r.right - x <= edgePx)
    }
    document.addEventListener("pointermove", onMove, { passive: true })
    return () => document.removeEventListener("pointermove", onMove)
  }, [layout])

  // ── 目录 ──────────────────────────────────────────────────────────────────
  const tocEntries = useMemo(
    () => toc.map((t) => ({ number: t.index + 1, title: t.label })),
    [toc],
  )

  const onVisibleChapterChange = useCallback(
    (idx: number) => setScrollFocusIndex(idx),
    [],
  )

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={readerRootRef}
      data-reader-theme={store.settings.theme}
      className="relative flex size-full flex-col overflow-hidden"
      style={{
        background: "var(--reader-bg)",
        color: "var(--reader-fg)",
        transition: "background 350ms ease, color 350ms ease",
      }}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        {layout === "paginate" && (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 left-3 z-30 flex items-center"
              style={{
                opacity: paginateNavLeftVisible ? 1 : 0,
                transition: "opacity 220ms ease",
              }}
            >
              <button
                type="button"
                aria-label="上一页"
                title="上一页"
                className="flex size-11 items-center justify-center rounded-full border-none transition-all active:scale-95"
                style={{
                  background:
                    "color-mix(in srgb, var(--reader-chrome-bg) 92%, transparent)",
                  color: "var(--reader-chrome-fg)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  pointerEvents: paginateNavLeftVisible ? "auto" : "none",
                }}
                onClick={() => handlePaginateTurn("prev")}
              >
                <ChevronLeft className="size-5" />
              </button>
            </div>
            <div
              className="pointer-events-none absolute inset-y-0 right-3 z-30 flex items-center"
              style={{
                opacity: paginateNavRightVisible ? 1 : 0,
                transition: "opacity 220ms ease",
              }}
            >
              <button
                type="button"
                aria-label="下一页"
                title="下一页"
                className="flex size-11 items-center justify-center rounded-full border-none transition-all active:scale-95"
                style={{
                  background:
                    "color-mix(in srgb, var(--reader-chrome-bg) 92%, transparent)",
                  color: "var(--reader-chrome-fg)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  pointerEvents: paginateNavRightVisible ? "auto" : "none",
                }}
                onClick={() => handlePaginateTurn("next")}
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
          </>
        )}
        {layout === "scroll" && scrollLoadError && (
          <main className="flex flex-1 items-center justify-center px-6 text-center text-sm text-destructive">
            {scrollLoadError}
          </main>
        )}
        {layout === "scroll" && !scrollLoadError && scrollChapters === null && (
          <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            正在加载全书…
          </main>
        )}
        {layout === "scroll" && scrollChapters && scrollChapters.length > 0 && (
          <ReaderScrollContent
            chapters={scrollChapters}
            fontFamily={store.settings.fontFamily}
            fontSize={store.settings.fontSize}
            lineHeight={store.settings.lineHeight}
            paddingX={store.settings.paddingX}
            scrollContainerRef={scrollRef}
            onBookProgress={setBookProgress}
            onVisibleChapterChange={onVisibleChapterChange}
          />
        )}
        {layout === "paginate" && (
          <ReaderContent
            key={chapter.index}
            chapter={chapter}
            layout={applyLayout}
            fontFamily={store.settings.fontFamily}
            fontSize={store.settings.fontSize}
            lineHeight={store.settings.lineHeight}
            paddingX={store.settings.paddingX}
            startFromEnd={isChapterStartFromEnd}
            pageOffset={curPageIndex}
            onProgressChange={setChapterProgressPct}
            onPageStateChange={handlePaginatePageStateChange}
          />
        )}
      </div>

      <ReaderTopBar
        visible={chrome.chromeVisible}
        bookTitle={bookTitle}
        chapterTitle={topChapterLine}
        bookmarked={store.bookmarked}
        onToggleToc={store.toggleToc}
        onToggleBookmark={store.toggleBookmark}
        onToggleSettings={store.toggleSettings}
      />

      <TtsPanel
        visible={store.ttsActive && chrome.chromeVisible}
        playing={store.ttsPlaying}
        speed={store.ttsSpeed}
        configId={store.ttsConfigId}
        onTogglePlay={handleTtsTogglePlay}
        onPrev={store.ttsPrev}
        onNext={handleTtsNext}
        onSpeedChange={store.setTtsSpeed}
        onConfigChange={store.setTtsConfigId}
      />

      <ReaderBottomBar
        visible={chrome.chromeVisible}
        currentChapter={curChapter + 1}
        totalChapters={totalChapters}
        bookProgress={displayedBookProgress}
        readingLayout={layout}
        onReadingLayoutChange={handleLayoutChange}
        onBookProgressSeek={handleBookProgressSeek}
        ttsActive={store.ttsActive}
        onPrevChapter={handlePrevChapter}
        onNextChapter={handleNextChapter}
        onToggleTts={store.toggleTts}
      />

      {/* biome-ignore lint/a11y/noStaticElementInteractions: 全屏蒙层 */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Esc 关闭侧栏 */}
      <div
        className="absolute inset-0 z-55 transition-all duration-300"
        style={{
          background:
            store.tocOpen || store.settingsOpen
              ? "rgba(0,0,0,0.3)"
              : "rgba(0,0,0,0)",
          pointerEvents: store.tocOpen || store.settingsOpen ? "auto" : "none",
        }}
        onClick={store.closePanels}
      />

      <TocPanel
        visible={store.tocOpen}
        entries={tocEntries}
        currentChapter={
          layout === "scroll" ? scrollFocusIndex + 1 : curChapter + 1
        }
        onSelectChapter={(num) => handleSelectChapter(num - 1)}
      />

      <SettingsPanel
        visible={store.settingsOpen}
        settings={store.settings}
        onThemeChange={store.setTheme}
        onSettingsChange={store.updateSettings}
      />
    </div>
  )
}
