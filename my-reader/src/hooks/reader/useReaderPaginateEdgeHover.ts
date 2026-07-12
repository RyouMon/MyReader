import { type RefObject, useEffect, useState } from "react"

/** 阅读根容器 ref，仅读取 `getBoundingClientRect` 与 `current`。 */
export type ReaderPaginateRootRef = RefObject<HTMLElement | null>

/** 左右边缘悬浮唤出翻页按钮的检测宽度；不作为点击热区。 */
export const READER_PAGINATE_EDGE_HOVER_PX = 44

/**
 * 分页模式下追踪指针是否落在阅读根容器左右边缘带内，只用于显示翻页按钮。
 * 翻页点击目标由可见按钮本身承担，边缘带不处理点击。
 */
export function useReaderPaginateEdgeHover(
  enabled: boolean,
  readerRootRef: ReaderPaginateRootRef,
  edgePx: number = READER_PAGINATE_EDGE_HOVER_PX,
): { nearLeft: boolean; nearRight: boolean } {
  const [nearLeft, setNearLeft] = useState(false)
  const [nearRight, setNearRight] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setNearLeft(false)
      setNearRight(false)
      return
    }
    const onMove = (e: PointerEvent) => {
      const root = readerRootRef.current
      if (!root) return
      const r = root.getBoundingClientRect()
      const { clientX: x, clientY: y } = e
      const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
      if (!inside) {
        setNearLeft(false)
        setNearRight(false)
        return
      }
      setNearLeft(x - r.left <= edgePx)
      setNearRight(r.right - x <= edgePx)
    }
    document.addEventListener("pointermove", onMove, {
      passive: true,
      capture: true,
    })
    return () =>
      document.removeEventListener("pointermove", onMove, { capture: true })
  }, [enabled, readerRootRef, edgePx])

  return { nearLeft, nearRight }
}
