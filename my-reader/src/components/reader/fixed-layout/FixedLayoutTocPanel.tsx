import { List } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import type { ChapterData } from "@/lib/rendition"
import {
  ReaderSidePanelFrame,
  ReaderSidePanelHeader,
} from "@/components/reader/shared/ReaderSidePanelChrome"
import { cn } from "@/lib/utils"

import type { FixedLayoutTocEntry } from "../types"

interface FixedLayoutTocPanelProps {
  visible: boolean
  entries: FixedLayoutTocEntry[]
  currentPage: number
  totalPages: number
  onSelectPage: (pageIndex: number) => void
  getPageImage: (index: number) => Promise<ChapterData | null>
}

type TabId = "chapters" | "thumbs"

export function FixedLayoutTocPanel({
  visible,
  entries,
  currentPage,
  totalPages,
  onSelectPage,
  getPageImage,
}: FixedLayoutTocPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("chapters")
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map())
  const [loadingThumbs, setLoadingThumbs] = useState(false)

  const loadThumbnails = useCallback(async () => {
    if (loadingThumbs || thumbnails.size > 0) return
    setLoadingThumbs(true)

    const thumbCount = Math.min(totalPages, 48)
    const map = new Map<number, string>()

    for (let i = 0; i < thumbCount; i++) {
      const ch = await getPageImage(i)
      if (ch?.type === "image") {
        map.set(i, ch.imageUrl)
      }
    }
    setThumbnails(map)
    setLoadingThumbs(false)
  }, [totalPages, getPageImage, loadingThumbs, thumbnails.size])

  useEffect(() => {
    if (activeTab === "thumbs" && thumbnails.size === 0 && visible) {
      loadThumbnails()
    }
  }, [activeTab, thumbnails.size, visible, loadThumbnails])

  const [bottomTab, setBottomTab] = useState<"toc" | "bookmarks">("toc")

  return (
    <ReaderSidePanelFrame visible={visible} side="left">
      <ReaderSidePanelHeader title="目录" icon={List} />

      <div className="flex border-b border-reader-chrome-border">
        <button
          type="button"
          className="reader-chrome-tab"
          data-active={activeTab === "chapters" ? "true" : undefined}
          onClick={() => setActiveTab("chapters")}
        >
          章节
        </button>
        <button
          type="button"
          className="reader-chrome-tab"
          data-active={activeTab === "thumbs" ? "true" : undefined}
          onClick={() => setActiveTab("thumbs")}
        >
          缩略图
        </button>
      </div>

      {activeTab === "chapters" && (
        <div className="flex-1 overflow-y-auto py-2">
          {entries.length > 0 ? (
            entries.map((entry) => {
              const isExactMatch = entry.pageIndex === currentPage
              return (
                <button
                  key={`${entry.label}-${entry.pageIndex}`}
                  type="button"
                  onClick={() => onSelectPage(entry.pageIndex)}
                  className={cn(
                    "reader-toc-row",
                    isExactMatch && "toc-item-active",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  <span className="shrink-0 font-mono text-[11px] text-reader-chrome-muted">
                    P.{entry.pageIndex + 1}
                  </span>
                </button>
              )
            })
          ) : (
            <div className="px-5 py-8 text-center text-sm text-reader-chrome-muted">
              暂无章节信息
            </div>
          )}
        </div>
      )}

      {activeTab === "thumbs" && (
        <div className="flex-1 overflow-y-auto p-3">
          {loadingThumbs ? (
            <div className="flex items-center justify-center py-8 text-sm text-reader-chrome-muted">
              正在加载缩略图…
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {Array.from(thumbnails.entries()).map(([idx, url]) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectPage(idx)}
                  className={cn(
                    "relative aspect-[0.7] overflow-hidden rounded border-2 border-transparent bg-transparent p-0 transition-colors",
                    idx === currentPage
                      ? "border-reader-chrome-active"
                      : "hover:border-reader-chrome-border",
                  )}
                >
                  <img
                    src={url}
                    alt={`Page ${idx + 1}`}
                    className="size-full object-cover"
                    draggable={false}
                  />
                  <span className="absolute bottom-1 right-1 rounded bg-black/50 px-1.5 py-px font-mono text-[10px] text-white/60">
                    {idx + 1}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex border-t border-reader-chrome-border">
        <button
          type="button"
          className="reader-chrome-tab"
          data-active={bottomTab === "toc" ? "true" : undefined}
          onClick={() => setBottomTab("toc")}
        >
          目录
        </button>
        <button
          type="button"
          className="reader-chrome-tab"
          data-active={bottomTab === "bookmarks" ? "true" : undefined}
          onClick={() => setBottomTab("bookmarks")}
        >
          书签
        </button>
      </div>
    </ReaderSidePanelFrame>
  )
}
