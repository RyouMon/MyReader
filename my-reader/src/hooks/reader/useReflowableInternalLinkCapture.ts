import { useEffect, type RefObject } from "react"
import { isNonBookSchemeHref } from "my-reader-tools/rendition/internalTextLink"
import { findHtmlFragmentElement } from "my-reader-tools/rendition/utils"

export type UseReflowableInternalLinkCaptureOptions = {
  readerRootRef: RefObject<HTMLElement | null>
  scrollContainerRef: RefObject<HTMLElement | null>
  readerReady: boolean
  layoutMode: string
  layout: "scroll" | "paginate"
  scrollFocusChapterIndex: number
  curChapter: number
  resolveInternalTextLink: (
    fromChapter: number,
    href: string,
  ) => { chapterIndex: number; fragmentId: string | null } | null
  followInternalTextLink: (
    fromChapter: number,
    href: string,
  ) => void | Promise<unknown>
}

/**
 * 在阅读根节点上以 capture 拦截 `<a href>`：外链新窗口；书内链在滚动/分页模式下分别滚动或交给控制器。
 */
export function useReflowableInternalLinkCapture(
  options: UseReflowableInternalLinkCaptureOptions,
): void {
  const {
    readerRootRef,
    scrollContainerRef,
    readerReady,
    layoutMode,
    layout,
    scrollFocusChapterIndex,
    curChapter,
    resolveInternalTextLink,
    followInternalTextLink,
  } = options

  useEffect(() => {
    const root = readerRootRef.current
    if (!root || !readerReady) return
    if (layoutMode !== "reflowable") return

    const onClickCapture = (e: MouseEvent) => {
      const t = e.target
      if (!t || !(t instanceof Element)) return
      const a = t.closest("a[href]")
      if (!a || !(a instanceof HTMLAnchorElement)) return
      const hrefAttr = a.getAttribute("href")
      if (!hrefAttr?.trim()) return
      const href = hrefAttr.trim()
      if (isNonBookSchemeHref(href)) {
        e.preventDefault()
        window.open(href, "_blank", "noopener,noreferrer")
        return
      }

      e.preventDefault()

      const fromChapter =
        layout === "scroll" ? scrollFocusChapterIndex : curChapter

      if (layout === "scroll") {
        const container = scrollContainerRef.current
        if (!container) return
        const r = resolveInternalTextLink(fromChapter, href)
        if (!r) return
        const section = container.querySelector(
          `[data-chapter-index="${r.chapterIndex}"]`,
        )
        if (!(section instanceof HTMLElement)) return
        const el = r.fragmentId
          ? findHtmlFragmentElement(section, r.fragmentId)
          : null
        ;(el ?? section).scrollIntoView({ behavior: "smooth", block: "start" })
        return
      }

      void followInternalTextLink(fromChapter, href)
    }

    root.addEventListener("click", onClickCapture, true)
    return () => root.removeEventListener("click", onClickCapture, true)
  }, [
    readerReady,
    layoutMode,
    layout,
    scrollFocusChapterIndex,
    curChapter,
    readerRootRef,
    scrollContainerRef,
    resolveInternalTextLink,
    followInternalTextLink,
  ])
}
