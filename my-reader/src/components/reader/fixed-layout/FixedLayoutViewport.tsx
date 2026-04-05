import { Loader2 } from "lucide-react"
import type { CSSProperties } from "react"
import type { ImageChapterData } from "@/lib/rendition"
import { cn } from "@/lib/utils"

import type { DisplayMode, ReadingDirection, ZoomMode } from "../types"

interface FixedLayoutViewportProps {
  page: ImageChapterData | null
  spreadPage: ImageChapterData | null
  displayMode: DisplayMode
  direction: ReadingDirection
  zoomMode: ZoomMode
  brightness: number
  pageGap: number
  turnDirection: "forward" | "backward" | null
  loading: boolean
}

export function FixedLayoutViewport({
  page,
  spreadPage,
  displayMode,
  direction,
  zoomMode,
  brightness,
  pageGap,
  turnDirection,
  loading,
}: FixedLayoutViewportProps) {
  const zoomStyle = getZoomStyle(zoomMode)

  return (
    <div
      className="relative flex flex-1 items-center justify-center overflow-hidden bg-viewer-bg"
      style={{
        filter:
          brightness < 100 ? `brightness(${brightness / 100})` : undefined,
      }}
    >
      {loading && !page && (
        <div className="flex flex-col items-center gap-3 text-reader-chrome-muted">
          <Loader2 className="size-8 animate-spin" />
          <span className="text-sm">加载中…</span>
        </div>
      )}

      {page && (
        <div
          className={cn(
            "flex items-center justify-center transition-transform duration-250 ease-out",
            turnDirection === "forward" && "fixed-layout-turning-forward",
            turnDirection === "backward" && "fixed-layout-turning-backward",
          )}
          style={{
            gap: `${pageGap}px`,
            height: "100%",
            padding: "24px",
          }}
        >
          {spreadImageList(page, spreadPage, displayMode, direction).map(
            (p) => (
              <img
                key={p.index}
                src={p.imageUrl}
                alt={p.title}
                className="fixed-layout-page-img"
                style={zoomStyle}
                draggable={false}
              />
            ),
          )}
        </div>
      )}
    </div>
  )
}

function spreadImageList(
  page: ImageChapterData,
  spreadPage: ImageChapterData | null,
  displayMode: DisplayMode,
  direction: ReadingDirection,
): ImageChapterData[] {
  if (displayMode === "spread" && spreadPage) {
    return direction === "rtl" ? [spreadPage, page] : [page, spreadPage]
  }
  return [page]
}

function getZoomStyle(zoomMode: ZoomMode): CSSProperties {
  switch (zoomMode) {
    case "fit-width":
      return { maxWidth: "100%", maxHeight: "none", height: "auto" }
    case "original":
      return { maxWidth: "none", maxHeight: "none" }
    default:
      return { maxHeight: "calc(100vh - 48px)", maxWidth: "100%" }
  }
}
