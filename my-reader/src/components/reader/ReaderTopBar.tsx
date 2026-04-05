import { Bookmark, List, Maximize, Minimize, Settings } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { cn } from "@/lib/utils"

interface ReaderTopBarProps {
  visible: boolean
  bookTitle: string
  chapterTitle: string
  bookmarked: boolean
  onToggleToc: () => void
  onToggleBookmark: () => void
  onToggleSettings: () => void
}

export function ReaderTopBar({
  visible,
  bookTitle,
  chapterTitle,
  bookmarked,
  onToggleToc,
  onToggleBookmark,
  onToggleSettings,
}: ReaderTopBarProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      document.documentElement.requestFullscreen()
    }
  }, [])

  return (
    <header
      className={cn(
        "reader-chrome-frost absolute inset-x-0 top-0 z-50 grid h-[52px] grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-reader-chrome-border px-5 transition-opacity duration-300 ease-out",
        visible ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
    >
      <div className="flex min-w-0 items-center justify-start gap-0.5">
        <TopBarButton title="目录" onClick={onToggleToc}>
          <List className="size-[18px]" />
        </TopBarButton>
        <TopBarButton
          title="书签"
          onClick={onToggleBookmark}
          active={bookmarked}
        >
          <Bookmark className="size-[18px]" />
        </TopBarButton>
      </div>

      <div className="font-serif min-w-0 max-w-[min(100vw-12rem,42rem)] truncate text-center text-sm font-medium text-reader-chrome-fg">
        {bookTitle}
        <span className="mx-1.5 text-reader-chrome-muted">·</span>
        {chapterTitle}
      </div>

      <div className="flex items-center justify-end gap-0.5">
        <TopBarButton title="设置" onClick={onToggleSettings}>
          <Settings className="size-[18px]" />
        </TopBarButton>
        <TopBarButton title="全屏" onClick={toggleFullscreen}>
          {isFullscreen ? (
            <Minimize className="size-[18px]" />
          ) : (
            <Maximize className="size-[18px]" />
          )}
        </TopBarButton>
      </div>
    </header>
  )
}

function TopBarButton({
  title,
  onClick,
  active,
  children,
}: {
  title: string
  onClick: () => void
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="reader-chrome-icon-btn"
      data-active={active ? "true" : undefined}
    >
      {children}
    </button>
  )
}
