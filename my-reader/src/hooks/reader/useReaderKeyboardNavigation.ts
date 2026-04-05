import { type RefObject, useEffect } from "react"

/** 与 {@link useReaderPanels} 返回值兼容的最小形状，供键盘 Esc 逻辑使用。 */
export type ReaderPanelsForKeyboard = {
  tocOpen: boolean
  settingsOpen: boolean
  closePanels: () => void
}

export type UseReaderKeyboardNavigationOptions = {
  readingLayout: "scroll" | "paginate"
  scrollContainerRef: RefObject<HTMLElement | null>
  /**
   * 滚动模式下 ArrowUp/Down 的步长 = clientHeight * 该比例。
   * 分页模式下忽略。
   */
  scrollStepViewportRatio: number
  /** 分页模式下物理「上一页」语义（固定版式中可由调用方按阅读方向映射）。 */
  onPaginatePrev: () => void
  /** 分页模式下物理「下一页」语义。 */
  onPaginateNext: () => void
  panels: ReaderPanelsForKeyboard
  hideChrome: () => void
  /** 为 true 时 F 请求全屏（当前仅固定版式使用）。 */
  fullscreenHotkey?: boolean
}

/**
 * 全局 keydown：表单/可编辑区内不处理；Esc 关侧栏或隐藏 chrome；
 * 滚动模式 ArrowUp/Down 平滑滚动；分页模式 ArrowLeft/Right 翻页。
 */
export function useReaderKeyboardNavigation(
  options: UseReaderKeyboardNavigationOptions,
): void {
  const {
    readingLayout,
    scrollContainerRef,
    scrollStepViewportRatio,
    onPaginatePrev,
    onPaginateNext,
    panels,
    hideChrome,
    fullscreenHotkey = false,
  } = options

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest?.("input, textarea, select, [contenteditable=true]"))
        return

      if (e.key === "Escape") {
        if (panels.tocOpen || panels.settingsOpen) panels.closePanels()
        else hideChrome()
        return
      }

      if (fullscreenHotkey && (e.key === "f" || e.key === "F")) {
        document.documentElement.requestFullscreen?.()
        return
      }

      if (readingLayout === "scroll") {
        const el = scrollContainerRef.current
        if (el && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
          e.preventDefault()
          const step = Math.round(el.clientHeight * scrollStepViewportRatio)
          el.scrollBy({
            top: e.key === "ArrowUp" ? -step : step,
            behavior: "smooth",
          })
        }
        return
      }

      if (e.key === "ArrowLeft") onPaginatePrev()
      if (e.key === "ArrowRight") onPaginateNext()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    readingLayout,
    scrollContainerRef,
    scrollStepViewportRatio,
    onPaginatePrev,
    onPaginateNext,
    panels.tocOpen,
    panels.settingsOpen,
    panels.closePanels,
    hideChrome,
    fullscreenHotkey,
  ])
}
