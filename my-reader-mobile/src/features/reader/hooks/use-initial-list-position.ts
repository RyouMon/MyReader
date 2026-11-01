import { useCallback, useEffect, useRef } from "react"
import type { FlatList } from "react-native"

/** Position a variable-height virtual list once, then leave scrolling to the reader. */
export function useInitialListPosition<T>(index: number, count: number) {
  const ref = useRef<FlatList<T>>(null)
  const target = useRef<number | null>(null)
  const positioned = useRef(false)
  const retries = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancel = useCallback(() => {
    target.current = null
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const scroll = useCallback(() => {
    if (target.current !== null)
      ref.current?.scrollToIndex({
        index: target.current,
        viewPosition: 0.5,
        animated: false,
      })
  }, [])
  useEffect(() => {
    if (positioned.current || index < 0 || !count) return
    positioned.current = true
    target.current = index
    timer.current = setTimeout(scroll, 0)
  }, [index, count, scroll])
  useEffect(() => cancel, [cancel])
  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      if (target.current === null || retries.current++ >= 8) return
      ref.current?.scrollToOffset({
        offset: info.averageItemLength * info.index,
        animated: false,
      })
      timer.current = setTimeout(scroll, 100)
    },
    [scroll],
  )
  return { ref, onScrollToIndexFailed, onScrollBeginDrag: cancel }
}
