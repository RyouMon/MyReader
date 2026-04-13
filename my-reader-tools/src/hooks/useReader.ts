import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { BookAnchor } from "my-reader-tools/progress/BookAnchor"
import type { FixedViewportState } from "my-reader-tools/layout-engines/fixed"
import { BookReader } from "my-reader-tools/rendition"
import type {
  ChapterData,
  LayoutConfig,
  LayoutMode,
  RangeBoundary,
  ReaderProgress,
  TextChapterPaginationResult,
  TocItem,
} from "my-reader-tools/rendition"

export interface UseReaderOptions {
  /** Raw book file bytes — pass `null` while still loading. */
  buffer: ArrayBuffer | null
  /** Book format, e.g. `"EPUB"`, `"CBZ"`, `"PDF"`. */
  format: string
  /**
   * 首次 `init` 时应用的锚点（与 `buffer` 同批传入），首屏 layout 即对应该位置。
   * `null` 表示无已存进度，从第 1 章开头打开。
   */
  initialOpenAnchor?: BookAnchor | null
}

export interface UseReaderReturn {
  /**
   * `true` when parsing and first-chapter data are ready and the first screen
   * layout is committed (text paginate: first successful `layout()`; text scroll:
   * `notifyInitialViewCommitted()`; image/PDF: same as parsed + first chapter).
   */
  ready: boolean
  /**
   * Text paginate: first successful measured `layout()`. Text scroll: after
   * `notifyInitialViewCommitted()`. Image/PDF: once the first chapter is loaded.
   */
  firstLayoutDone: boolean
  /** Human-readable error, if any. */
  error: string | null
  /** `true` while a chapter is being fetched. */
  loading: boolean

  /** 全书排版模式：可重排正文 vs 固定版式（漫画/PDF 等）。 */
  layoutMode: LayoutMode
  /** Same as the `format` passed to {@link useBookReader}, e.g. `"EPUB"` / `"CBZ"`. */
  format: string
  toc: TocItem[]
  totalChapters: number

  /** 当前章节下标（0-based），与架构文档 curChapter 一致 */
  curChapter: number
  /** 当前章完整数据（文本或图页） */
  chapter: ChapterData | null
  /** 当前章内页偏移（0-based），与 BookReader.curPage.index 一致 */
  curPageIndex: number
  /** 当前章列页/分页总数（文本书经 DomReflowEngine 测量后 ≥1） */
  totalPagesInChapter: number
  isChapterStartFromEnd: boolean

  gotoChapter: (index: number) => void
  gotoPage: (chapter: number, pageOffset: number) => Promise<void>
  gotoNextPage: () => Promise<void>
  gotoPrevPage: () => Promise<void>
  gotoPageInChapter: (totalPages: number, pageOffset: number) => void
  layout: (
    config: LayoutConfig,
    measureHost: HTMLDivElement | null | undefined,
  ) => Promise<TextChapterPaginationResult | undefined>
  /**
   * Scroll mode does not invoke `layout(measureHost)`; call once when the
   * initial chapter stream is ready or when scroll loading has failed.
   */
  notifyInitialViewCommitted: () => void
  getChapter: (index: number) => Promise<ChapterData | null>

  /** Text books: resolve in-book `<a href>` from a spine chapter. */
  resolveInternalTextLink: (
    fromChapter: number,
    href: string,
  ) => { chapterIndex: number; fragmentId: string | null } | null
  /** Text books: navigate and scroll paginated view to target after layout. */
  followInternalTextLink: (
    fromChapter: number,
    href: string,
  ) => Promise<boolean>

  /**
   * 从本地锚点恢复章节与可选列页偏移；漫画/PDF 通常仅 `chapterIndex`。
   */
  applyReadingResume: (
    chapterIndex: number,
    columnPageOffset?: number,
  ) => Promise<void>

  /** 打包当前位置供持久化（文本书含章内 UTF-16 偏移与片段）。 */
  buildSaveBookAnchor: (fileFormat: string) => BookAnchor

  /**
   * 文本书：当前列页切片在章内 UTF-16 区间的中点（与切换滚动视图时对齐整页插图更稳）。
   */
  buildSaveBookAnchorMidSlice: (fileFormat: string) => BookAnchor

  /** 文本书：按 `chapterIndex` 章内 UTF-16 `charOffset` 续读；失败返回 `false`。 */
  applyCharOffsetResume: (
    chapterIndex: number,
    charOffset: number,
  ) => Promise<boolean>

  /** 文本书整章（full）首屏滚动续读：有边界时由视口消费；分页（sliced）由 `layout` 消费。 */
  getPendingTextResumeBoundary: () => RangeBoundary | null
  clearPendingTextResumeBoundary: () => void

  /**
   * 滚动视图中与可见章节对齐：仅更新 {@link BookReader} 当前 spine 下标并拉取章节数据，
   * 不进入全局 loading。翻页/持久化锚点与 {@link BookReader} 一致。
   */
  syncChapterIndexFromScroll: (chapterIndex: number) => void

  /**
   * 全书阅读进度快照（0..1 的 `fraction`），由 {@link BookReader} 按章体量与章内位置在内部计算，
   * 无需外部写入。
   */
  progress: ReaderProgress

  /** 固定版式：当前页窗口快照；EPUB 等为 `null`。 */
  fixedViewport: FixedViewportState | null
  /** 固定版式：按当前 spine 预取邻近页（分页模式已由会话自动触发，滚动模式可额外调用）。 */
  prefetchFixedLayoutNeighbors: () => void
  /** 固定版式滚动：为虚拟列表可见行预取解码页。 */
  prefetchFixedPageIndices: (indices: readonly number[]) => void
}

/**
 * React hook that wraps {@link BookReader}.
 *
 * Inspired by TanStack Table's `useReactTable` — this hook owns the
 * headless reader instance and exposes reactive state + actions.
 */
export function useBookReader({
  buffer,
  format,
  initialOpenAnchor = null,
}: UseReaderOptions): UseReaderReturn {
  const coreRef = useRef<BookReader | null>(null)
  const mountedRef = useRef(true)
  const [parsedReady, setParsedReady] = useState(false)
  const [firstLayoutDone, setFirstLayoutDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [layoutMode, setLayoutMode] = useState<LayoutMode>("unknown")
  const [toc, setToc] = useState<TocItem[]>([])
  const [totalChapters, setTotalChapters] = useState(0)
  const [curChapter, setCurChapter] = useState(0)
  const [chapter, setChapter] = useState<ChapterData | null>(null)
  const [curPageIndex, setCurPageIndex] = useState(0)
  const [totalPagesInChapter, setTotalPagesInChapter] = useState(1)
  const [isChapterStartFromEnd, setIsChapterStartFromEnd] = useState(false)
  const [progress, setProgress] = useState<ReaderProgress>({
    chapterIndex: 0,
    chapterTitle: "",
    totalChapters: 0,
    fraction: 0,
  })

  // Recompute when navigation or book shape changes; snapshot reads live session state via coreRef.
  // biome-ignore lint/correctness/useExhaustiveDependencies: curChapter/totalChapters drive fixed window display
  const fixedViewport = useMemo((): FixedViewportState | null => {
    if (layoutMode !== "fixedLayout" || !parsedReady) return null
    return coreRef.current?.getFixedViewportState() ?? null
  }, [layoutMode, curChapter, totalChapters, parsedReady])

  const prefetchFixedLayoutNeighbors = useCallback(() => {
    coreRef.current?.prefetchFixedLayoutNeighbors()
  }, [])

  const prefetchFixedPageIndices = useCallback(
    (indices: readonly number[]) => {
      coreRef.current?.prefetchFixedPageIndices(indices)
    },
    [],
  )

  const syncNavigationState = useCallback((core: BookReader) => {
    setCurChapter(core.curChapter)
    setCurPageIndex(core.curPage.index)
    setTotalPagesInChapter(core.totalPagesOfCurChapter)
    setIsChapterStartFromEnd(core.chapterStartFromEnd)
    setProgress(core.getProgress())
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!buffer) return

    const core = new BookReader()
    coreRef.current = core
    let cancelled = false

    async function init() {
      try {
        setLoading(true)
        setError(null)

        const book = await core.init(buffer!, format, {
          initialOpenAnchor: initialOpenAnchor ?? undefined,
        })
        if (cancelled) return

        setLayoutMode(book.layoutMode)
        setToc(book.toc)
        setTotalChapters(book.chapters.length)

        const ch = await core.getChapter(core.curChapter)
        if (cancelled) return

        setChapter(ch)
        syncNavigationState(core)
        setParsedReady(true)
        if (book.layoutMode === "fixedLayout") {
          setFirstLayoutDone(true)
        }
      } catch (e) {
        if (!cancelled) setError(String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()

    return () => {
      cancelled = true
      core.destroy()
      coreRef.current = null
      setParsedReady(false)
      setFirstLayoutDone(false)
      setChapter(null)
      setTotalChapters(0)
      setProgress({
        chapterIndex: 0,
        chapterTitle: "",
        totalChapters: 0,
        fraction: 0,
      })
    }
  }, [buffer, format, initialOpenAnchor, syncNavigationState])

  const gotoChapter = useCallback(
    async (index: number) => {
      const core = coreRef.current
      if (!core?.ready) return

      setLoading(true)
      try {
        core.gotoChapter(index)
        const ch = await core.getChapter(index)
        setChapter(ch)
        syncNavigationState(core)
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    },
    [syncNavigationState],
  )

  const gotoPage = useCallback(
    async (chapterIndex: number, pageOffset: number) => {
      const core = coreRef.current
      if (!core?.ready) return
      setLoading(true)
      try {
        const ch = await core.gotoPage(chapterIndex, pageOffset)
        setChapter(ch)
        syncNavigationState(core)
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    },
    [syncNavigationState],
  )

  const gotoNextPage = useCallback(async () => {
    const core = coreRef.current
    if (!core?.ready) return
    setLoading(true)
    try {
      const ch = await core.gotoNextPage()
      if (ch) {
        setChapter(ch)
        syncNavigationState(core)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [syncNavigationState])

  const gotoPrevPage = useCallback(async () => {
    const core = coreRef.current
    if (!core?.ready) return
    setLoading(true)
    try {
      const ch = await core.gotoPrevPage()
      if (ch) {
        setChapter(ch)
        syncNavigationState(core)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [syncNavigationState])

  const gotoPageInChapter = useCallback(
    (totalPages: number, pageOffset: number) => {
      const core = coreRef.current
      if (!core?.ready) return
      core.gotoPageInChapter(totalPages, pageOffset)
      syncNavigationState(core)
    },
    [syncNavigationState],
  )

  const layout = useCallback(
    async (
      config: LayoutConfig,
      measureHost: HTMLDivElement | null | undefined,
    ) => {
      const core = coreRef.current
      if (!core?.ready) return undefined
      const result = await core.layout(config, measureHost ?? undefined)
      if (!mountedRef.current || coreRef.current !== core || !core.ready) {
        return undefined
      }
      syncNavigationState(core)
      if (result !== undefined) {
        setFirstLayoutDone(true)
      }
      return result
    },
    [syncNavigationState],
  )

  const notifyInitialViewCommitted = useCallback(() => {
    if (!mountedRef.current) return
    setFirstLayoutDone(true)
  }, [])

  const getChapter = useCallback(
    async (index: number): Promise<ChapterData | null> => {
      const core = coreRef.current
      if (!core?.ready) return null
      return core.getChapter(index)
    },
    [],
  )

  const resolveInternalTextLink = useCallback(
    (fromChapter: number, href: string) => {
      return coreRef.current?.resolveInternalTextLink(fromChapter, href) ?? null
    },
    [],
  )

  const followInternalTextLink = useCallback(
    async (fromChapter: number, href: string) => {
      const core = coreRef.current
      if (!core?.ready) return false
      const prep = core.prepareInternalTextLinkNavigation(fromChapter, href)
      if (!prep) return false
      setLoading(true)
      try {
        const ch = await core.getChapter(prep.chapterIndex)
        setChapter(ch)
        syncNavigationState(core)
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
      return true
    },
    [syncNavigationState],
  )

  const applyReadingResume = useCallback(
    async (chapterIndex: number, columnPageOffset?: number) => {
      const core = coreRef.current
      if (!core?.ready) return
      setLoading(true)
      try {
        core.gotoChapterWithResume(chapterIndex, columnPageOffset)
        const ch = await core.getChapter(chapterIndex)
        if (!mountedRef.current) return
        setChapter(ch)
        syncNavigationState(core)
      } catch (e) {
        if (mountedRef.current) setError(String(e))
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    },
    [syncNavigationState],
  )

  const applyCharOffsetResume = useCallback(
    async (chapterIndex: number, charOffset: number) => {
      const core = coreRef.current
      if (!core?.ready) return false
      setLoading(true)
      try {
        const ok = await core.applyCharOffsetResume(chapterIndex, charOffset)
        if (!ok || !mountedRef.current) return false
        const ch = await core.getChapter(core.currentIndex)
        if (!mountedRef.current) return false
        setChapter(ch)
        syncNavigationState(core)
        return true
      } catch (e) {
        if (mountedRef.current) setError(String(e))
        return false
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    },
    [syncNavigationState],
  )

  const getPendingTextResumeBoundary = useCallback((): RangeBoundary | null => {
    return coreRef.current?.getPendingTextResumeBoundary() ?? null
  }, [])

  const clearPendingTextResumeBoundary = useCallback(() => {
    coreRef.current?.clearPendingTextResumeBoundary()
  }, [])

  const syncChapterIndexFromScroll = useCallback(
    (chapterIndex: number) => {
      const core = coreRef.current
      if (!core?.ready) return
      if (chapterIndex < 0 || chapterIndex >= core.totalChapters) return
      core.gotoChapter(chapterIndex)
      syncNavigationState(core)
      void core.getChapter(chapterIndex).then((ch: ChapterData | null) => {
        if (!mountedRef.current || coreRef.current !== core) return
        setChapter(ch)
      })
    },
    [syncNavigationState],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: 依赖导航态 bump 引用，供进度保存 effect 在翻页时重新防抖
  const buildSaveBookAnchor = useCallback(
    (fileFormat: string): BookAnchor => {
      return (
        coreRef.current?.buildSaveBookAnchor(fileFormat) ?? {
          chapterIndex: 0,
        }
      )
    },
    [curChapter, curPageIndex, layoutMode],
  )

  const buildSaveBookAnchorMidSlice = useCallback(
    (fileFormat: string): BookAnchor => {
      return (
        coreRef.current?.buildSaveBookAnchorMidSlice(fileFormat) ?? {
          chapterIndex: 0,
        }
      )
    },
    [curChapter, curPageIndex, layoutMode],
  )

  const ready = parsedReady && firstLayoutDone

  return {
    ready,
    firstLayoutDone,
    error,
    loading,
    layoutMode,
    format,
    toc,
    totalChapters,
    curChapter,
    chapter,
    curPageIndex,
    totalPagesInChapter,
    isChapterStartFromEnd,
    gotoChapter,
    gotoPage,
    gotoNextPage,
    gotoPrevPage,
    gotoPageInChapter,
    layout,
    notifyInitialViewCommitted,
    getChapter,
    resolveInternalTextLink,
    followInternalTextLink,
    applyReadingResume,
    applyCharOffsetResume,
    getPendingTextResumeBoundary,
    clearPendingTextResumeBoundary,
    syncChapterIndexFromScroll,
    buildSaveBookAnchor,
    buildSaveBookAnchorMidSlice,
    progress,
    fixedViewport,
    prefetchFixedLayoutNeighbors,
    prefetchFixedPageIndices,
  }
}
