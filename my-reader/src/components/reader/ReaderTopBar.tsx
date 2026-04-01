import {
  ArrowLeft,
  Bookmark,
  List,
  Maximize,
  Minimize,
  Settings,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { cn } from "@/lib/utils"

interface ReaderTopBarProps {
  visible: boolean
  bookTitle: string
  chapterTitle: string
  bookmarked: boolean
  onBack: () => void
  onToggleToc: () => void
  onToggleBookmark: () => void
  onToggleSettings: () => void
}

export function ReaderTopBar({
  visible,
  bookTitle,
  chapterTitle,
  bookmarked,
  onBack,
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
        "absolute inset-x-0 top-0 z-50 flex h-[52px] items-center gap-3 border-b px-5 transition-opacity duration-300 ease-out",
        visible ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
      style={{
        background:
          "color-mix(in srgb, var(--reader-chrome-bg) 92%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderColor: "var(--reader-chrome-border)",
        transition:
          "opacity 300ms ease-out, background 350ms ease, border-color 350ms ease",
      }}
    >
      <button
        type="button"
        onClick={onBack}
        className="group/back flex items-center gap-1.5 rounded-lg border-none px-3.5 py-[7px] text-[13.5px] transition-all"
        style={{
          background: "transparent",
          color: "var(--reader-chrome-muted)",
          fontFamily: "inherit",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--reader-chrome-hover)"
          e.currentTarget.style.color = "var(--reader-chrome-fg)"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent"
          e.currentTarget.style.color = "var(--reader-chrome-muted)"
        }}
      >
        <ArrowLeft className="size-4 transition-transform group-hover/back:-translate-x-0.5" />
        返回
      </button>

      <div
        className="min-w-0 flex-1 truncate text-center text-sm font-medium"
        style={{
          fontFamily: "'Lora', 'Noto Serif SC', serif",
          color: "var(--reader-chrome-fg)",
        }}
      >
        {bookTitle}
        <span
          className="mx-1.5"
          style={{ color: "var(--reader-chrome-muted)" }}
        >
          ·
        </span>
        {chapterTitle}
      </div>

      <div className="flex items-center gap-0.5">
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
      className="flex size-9 items-center justify-center rounded-lg border-none transition-all active:scale-95"
      style={{
        background: "transparent",
        color: active
          ? "var(--reader-chrome-active)"
          : "var(--reader-chrome-muted)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--reader-chrome-hover)"
        if (!active) e.currentTarget.style.color = "var(--reader-chrome-fg)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent"
        if (!active) e.currentTarget.style.color = "var(--reader-chrome-muted)"
      }}
    >
      {children}
    </button>
  )
}
