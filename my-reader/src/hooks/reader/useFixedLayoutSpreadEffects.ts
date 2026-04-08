import { useEffect, type Dispatch, type SetStateAction } from "react"
import type { ChapterData, ImageChapterData } from "my-reader-tools/rendition"
import type { FixedLayoutSettings } from "@/components/reader/types"

/**
 * 滚动 + 双页组合无效时，将展示模式收回为单页。
 */
export function useFixedLayoutScrollSpreadGuard(
  setSettings: Dispatch<SetStateAction<FixedLayoutSettings>>,
  readingLayout: FixedLayoutSettings["readingLayout"],
  displayMode: FixedLayoutSettings["displayMode"],
): void {
  useEffect(() => {
    setSettings((s) => {
      if (s.readingLayout === "scroll" && s.displayMode === "spread") {
        return { ...s, displayMode: "single" }
      }
      return s
    })
  }, [readingLayout, displayMode, setSettings])
}

/**
 * 分页双页模式下预取下一整页，供对页渲染使用。
 */
export function useFixedLayoutSpreadNeighborPage(
  readingLayout: FixedLayoutSettings["readingLayout"],
  displayMode: FixedLayoutSettings["displayMode"],
  currentIndex: number,
  totalPages: number,
  getChapter: (index: number) => Promise<ChapterData | null>,
  setSpreadPage: Dispatch<SetStateAction<ImageChapterData | null>>,
): void {
  useEffect(() => {
    if (
      readingLayout !== "paginate" ||
      displayMode !== "spread" ||
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
    readingLayout,
    displayMode,
    currentIndex,
    totalPages,
    getChapter,
    setSpreadPage,
  ])
}
