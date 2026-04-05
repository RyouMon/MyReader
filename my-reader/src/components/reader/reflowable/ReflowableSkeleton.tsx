import {
  type CSSProperties,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { BookReader } from "@/lib/rendition/BookReader"

/** 与分页正文栏 DOM 类名一致，保证骨架与真文的页边距、版心一致。 */
export const reflowablePaginatedColumnClass =
  "reader-chapter-container reader-paginated-container reader-paginated-range-page reader-body-content reader-chapter-typography-host min-h-0 min-w-0 flex-1 overflow-hidden"

/** 确定性 [0,1) 伪随机，用于骨架段落节奏（同 seed 下可复现）。 */
function skeletonPatternRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * 按「段落」生成骨架行宽：段内除末行外均为整行宽，末行较短；段长长短不一，与常见排版书相近。
 */
function buildParagraphStyleSkeletonWidths(rowCount: number, seed: number) {
  const next = skeletonPatternRng(seed)
  const out: number[] = []
  let idx = 0

  while (idx < rowCount) {
    const remaining = rowCount - idx
    const r1 = next()
    const r2 = next()
    let targetLen: number
    if (r1 < 0.3) {
      targetLen = 2 + Math.floor(r2 * 3)
    } else if (r1 < 0.68) {
      targetLen = 4 + Math.floor(r2 * 5)
    } else {
      targetLen = 8 + Math.floor(r2 * 10)
    }
    const paraLen = Math.max(1, Math.min(targetLen, remaining))

    for (let j = 0; j < paraLen; j++) {
      const isLast = j === paraLen - 1
      if (isLast) {
        const u = next()
        const w = 0.34 + 0.6 * u ** 0.52
        out.push(Math.min(0.97, w))
      } else {
        out.push(1)
      }
    }
    idx += paraLen
  }

  return out
}

/**
 * 单栏版心内按视口高度铺满骨架行：行盒高度为 fontSize×lineHeight，条高为字号，与正文行距一致。
 */
function ReflowableSkeletonColumn({
  fontSize,
  lineHeight,
  typoStyle,
  patternSeed,
}: {
  fontSize: number
  lineHeight: number
  typoStyle: CSSProperties
  patternSeed: number
}) {
  const measureRef = useRef<HTMLDivElement>(null)
  const [rowCount, setRowCount] = useState(0)
  const lineStridePx = Math.max(1, fontSize * lineHeight)

  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    const updateFromHeight = (h: number) => {
      const n = lineStridePx > 0 ? Math.max(0, Math.floor(h / lineStridePx)) : 0
      setRowCount(n)
    }
    updateFromHeight(el.getBoundingClientRect().height)
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0
      updateFromHeight(h)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [lineStridePx])

  const lineWidths = useMemo(
    () =>
      buildParagraphStyleSkeletonWidths(
        rowCount,
        patternSeed ^ Math.imul(rowCount, 0x85ebca6b),
      ),
    [rowCount, patternSeed],
  )

  return (
    <div className={reflowablePaginatedColumnClass} style={typoStyle}>
      <div
        ref={measureRef}
        className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
      >
        {lineWidths.map((frac, i) => (
          <div
            key={`reflowable-skel-line-${i}`}
            className="flex w-full shrink-0 items-start"
            style={{ height: lineStridePx }}
          >
            <Skeleton
              className="max-w-full rounded-sm"
              style={{
                width: `${frac * 100}%`,
                height: fontSize,
                minHeight: fontSize,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export interface ReflowableSkeletonProps {
  fontSize: number
  lineHeight: number
  typoStyle: CSSProperties
  twoColumnShell: boolean
}

/**
 * 分页阅读视口占位骨架：页边距与分页栏（reader-paginated-container）一致，行高/行距与阅读设置一致。
 */
export function ReflowableSkeleton({
  fontSize,
  lineHeight,
  typoStyle,
  twoColumnShell,
}: ReflowableSkeletonProps) {
  if (!twoColumnShell) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
        <ReflowableSkeletonColumn
          fontSize={fontSize}
          lineHeight={lineHeight}
          typoStyle={typoStyle}
          patternSeed={0x4b1d_4e5f}
        />
      </div>
    )
  }

  return (
    <div
      className="flex h-full min-h-0 w-full min-w-0 flex-row"
      style={{ gap: `${BookReader.PAGINATION_DOUBLE_COLUMN_GAP_PX}px` }}
    >
      <ReflowableSkeletonColumn
        fontSize={fontSize}
        lineHeight={lineHeight}
        typoStyle={typoStyle}
        patternSeed={0x4b1d_4e5f}
      />
      <ReflowableSkeletonColumn
        fontSize={fontSize}
        lineHeight={lineHeight}
        typoStyle={typoStyle}
        patternSeed={0x7c02_a19d}
      />
    </div>
  )
}
