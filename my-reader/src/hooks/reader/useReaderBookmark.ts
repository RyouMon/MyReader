import { useCallback, useState } from "react"

/** 阅读器书签勾选状态（UI 层，是否与书库同步由上层扩展）。 */
export function useReaderBookmark() {
  const [bookmarked, setBookmarked] = useState(false)
  const toggleBookmark = useCallback(() => setBookmarked((prev) => !prev), [])
  return { bookmarked, toggleBookmark }
}
