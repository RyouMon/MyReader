import { List } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { cn } from "@/lib/utils"
import type { ChapterData } from "@/lib/rendition"

interface ComicTocEntry {
  label: string
  pageIndex: number
}

interface ComicTocPanelProps {
  visible: boolean
  entries: ComicTocEntry[]
  currentPage: number
  totalPages: number
  onSelectPage: (pageIndex: number) => void
  getPageImage: (index: number) => Promise<ChapterData | null>
}

type TabId = "chapters" | "thumbs"

export function ComicTocPanel({
  visible,
  entries,
  currentPage,
  totalPages,
  onSelectPage,
  getPageImage,
}: ComicTocPanelProps) {
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
    <aside
      className="absolute inset-y-0 left-0 z-60 flex w-[320px] flex-col transition-all duration-300 ease-out"
      style={{
        background: "#222",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "8px 0 24px rgba(0,0,0,0.30)",
        transform: visible ? "translateX(0)" : "translateX(-100%)",
        opacity: visible ? 1 : 0,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 border-b px-5 py-4 text-[15px] font-semibold"
        style={{
          fontFamily: "'Lora', 'Noto Serif SC', serif",
          color: "rgba(255,255,255,0.85)",
          borderColor: "rgba(255,255,255,0.08)",
        }}
      >
        <List className="size-[18px] opacity-50" />
        目录
      </div>

      {/* Tabs */}
      <div
        className="flex"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <TabButton
          active={activeTab === "chapters"}
          onClick={() => setActiveTab("chapters")}
        >
          章节
        </TabButton>
        <TabButton
          active={activeTab === "thumbs"}
          onClick={() => setActiveTab("thumbs")}
        >
          缩略图
        </TabButton>
      </div>

      {/* Chapter list */}
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
                    "relative flex w-full items-center gap-2.5 px-5 py-2.5 text-left text-[13.5px] transition-all",
                    isExactMatch && "font-semibold",
                  )}
                  style={{
                    color: isExactMatch
                      ? "var(--reader-chrome-active)"
                      : "rgba(255,255,255,0.65)",
                    background: isExactMatch
                      ? "rgba(181, 101, 29, 0.08)"
                      : "transparent",
                    border: "none",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => {
                    if (!isExactMatch)
                      e.currentTarget.style.background =
                        "rgba(255,255,255,0.04)"
                  }}
                  onMouseLeave={(e) => {
                    if (!isExactMatch)
                      e.currentTarget.style.background = "transparent"
                  }}
                >
                  {isExactMatch && (
                    <span
                      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r"
                      style={{ background: "var(--reader-chrome-active)" }}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  <span
                    className="shrink-0 font-mono text-[11px]"
                    style={{ color: "rgba(255,255,255,0.3)" }}
                  >
                    P.{entry.pageIndex + 1}
                  </span>
                </button>
              )
            })
          ) : (
            <div
              className="px-5 py-8 text-center text-sm"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              暂无章节信息
            </div>
          )}
        </div>
      )}

      {/* Thumbnail grid */}
      {activeTab === "thumbs" && (
        <div className="flex-1 overflow-y-auto p-3">
          {loadingThumbs ? (
            <div
              className="flex items-center justify-center py-8 text-sm"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              正在加载缩略图…
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {Array.from(thumbnails.entries()).map(([idx, url]) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectPage(idx)}
                  className="relative overflow-hidden rounded transition-all"
                  style={{
                    aspectRatio: "0.7",
                    border:
                      idx === currentPage
                        ? "2px solid var(--reader-chrome-active)"
                        : "2px solid transparent",
                    cursor: "pointer",
                    background: "none",
                    padding: 0,
                  }}
                  onMouseEnter={(e) => {
                    if (idx !== currentPage)
                      e.currentTarget.style.borderColor =
                        "rgba(255,255,255,0.3)"
                  }}
                  onMouseLeave={(e) => {
                    if (idx !== currentPage)
                      e.currentTarget.style.borderColor = "transparent"
                  }}
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

      {/* Bottom tabs */}
      <div
        className="flex"
        style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
      >
        <BottomTabBtn
          active={bottomTab === "toc"}
          onClick={() => setBottomTab("toc")}
        >
          目录
        </BottomTabBtn>
        <BottomTabBtn
          active={bottomTab === "bookmarks"}
          onClick={() => setBottomTab("bookmarks")}
        >
          书签
        </BottomTabBtn>
      </div>
    </aside>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 border-none py-2.5 text-center text-[12.5px] transition-all"
      style={{
        background: "transparent",
        color: active
          ? "var(--reader-chrome-active)"
          : "rgba(255,255,255,0.45)",
        fontWeight: active ? 600 : 400,
        fontFamily: "inherit",
        boxShadow: active
          ? "inset 0 -2px 0 var(--reader-chrome-active)"
          : "none",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.04)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent"
      }}
    >
      {children}
    </button>
  )
}

function BottomTabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 border-none py-3 text-center text-[12.5px] transition-all"
      style={{
        background: "transparent",
        color: active
          ? "var(--reader-chrome-active)"
          : "rgba(255,255,255,0.45)",
        fontWeight: active ? 600 : 400,
        fontFamily: "inherit",
        boxShadow: active
          ? "inset 0 -2px 0 var(--reader-chrome-active)"
          : "none",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.04)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent"
      }}
    >
      {children}
    </button>
  )
}
