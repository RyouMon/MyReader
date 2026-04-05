import { useEffect, useState, type RefObject } from "react"

/** 与边缘翻页条默认宽度一致，供指针检测与可点区域对齐。 */
export const READER_PAGINATE_EDGE_PX = 72

/**
 * 分页模式下追踪指针是否落在阅读根容器左右边缘带内，供边缘翻页交互使用。
 * 具体如何响应（例如按钮透明度与 pointer-events）由调用方组件自行决定。
 */
export function useReaderPaginateEdgeTurn(
  enabled: boolean,
  readerRootRef: RefObject<HTMLElement | null>,
  edgePx: number = READER_PAGINATE_EDGE_PX,
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
    document.addEventListener("pointermove", onMove, { passive: true })
    return () => document.removeEventListener("pointermove", onMove)
  }, [enabled, readerRootRef, edgePx])

  return { nearLeft, nearRight }
}
