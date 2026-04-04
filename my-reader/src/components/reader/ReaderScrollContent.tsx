import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react"

import type { TextChapterData } from "@/lib/rendition"

interface ReaderScrollContentProps {
  chapters: TextChapterData[]
  fontFamily: string
  fontSize: number
  lineHeight: number
  paddingX: number
  scrollContainerRef: React.RefObject<HTMLDivElement>
  onBookProgress: (pct: number) => void
  onVisibleChapterChange: (index: number) => void
}

/**
 * 全书连续滚动：多章 HTML 拼接在同一滚动容器中，进度按整卷 scroll 计算。
 */
export function ReaderScrollContent({
  chapters,
  fontFamily,
  fontSize,
  lineHeight,
  paddingX,
  scrollContainerRef,
  onBookProgress,
  onVisibleChapterChange,
}: ReaderScrollContentProps) {
  const sectionRefs = useRef<Map<number, HTMLElement>>(new Map())

  const setSectionRef = useCallback((index: number, el: HTMLElement | null) => {
    const m = sectionRefs.current
    if (el) m.set(index, el)
    else m.delete(index)
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    const pct = max <= 0 ? 100 : Math.round((el.scrollTop / max) * 100)
    onBookProgress(pct)

    const cr = el.getBoundingClientRect()
    let best = 0
    let bestVisible = -1
    for (const [idx, node] of sectionRefs.current) {
      const nr = node.getBoundingClientRect()
      const top = Math.max(cr.top, nr.top)
      const bottom = Math.min(cr.bottom, nr.bottom)
      const h = Math.max(0, bottom - top)
      if (h > bestVisible) {
        bestVisible = h
        best = idx
      }
    }
    if (bestVisible >= 0) onVisibleChapterChange(best)
  }, [scrollContainerRef, onBookProgress, onVisibleChapterChange])

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const id = window.requestAnimationFrame(() => handleScroll())
    return () => window.cancelAnimationFrame(id)
  }, [scrollContainerRef, handleScroll])

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => handleScroll())
    ro.observe(el)
    return () => ro.disconnect()
  }, [scrollContainerRef, handleScroll])

  return (
    <main
      ref={scrollContainerRef}
      className="reader-scroll-viewport reader-text-surface flex-1 overflow-y-auto overflow-x-hidden"
      onScroll={handleScroll}
    >
      {chapters.map((chapter) => (
        <ScrollChapterSection
          key={chapter.index}
          chapter={chapter}
          fontFamily={fontFamily}
          fontSize={fontSize}
          lineHeight={lineHeight}
          paddingX={paddingX}
          setSectionRef={setSectionRef}
        />
      ))}
    </main>
  )
}

function ScrollChapterSection({
  chapter,
  fontFamily,
  fontSize,
  lineHeight,
  paddingX,
  setSectionRef,
}: {
  chapter: TextChapterData
  fontFamily: string
  fontSize: number
  lineHeight: number
  paddingX: number
  setSectionRef: (index: number, el: HTMLElement | null) => void
}) {
  const scopedCss = useMemo(() => chapter.cssText ?? "", [chapter.cssText])

  return (
    <section
      ref={(el) => setSectionRef(chapter.index, el)}
      data-chapter-index={chapter.index}
      className="reader-scroll-chapter"
    >
      <div
        className="reader-chapter-container reader-scroll-chapter-inner"
        style={
          {
            "--reader-padding-x": `${paddingX}rem`,
            "--reader-font-family": fontFamily,
            "--reader-font-size": `${fontSize}px`,
            "--reader-line-height": String(lineHeight),
          } as CSSProperties
        }
      >
        {scopedCss && <style>{scopedCss}</style>}
        <ChapterBodyContent html={chapter.bodyHtml} />
      </div>
    </section>
  )
}

/**
 * 将章节 HTML 写入容器节点，避免在 JSX 中使用 dangerouslySetInnerHTML。
 */
function ChapterBodyContent({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    containerRef.current.innerHTML = html
  }, [html])

  return <div ref={containerRef} className="reader-body-content" />
}
