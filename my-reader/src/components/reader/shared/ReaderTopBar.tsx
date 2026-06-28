import { Bookmark, List, Maximize, Minimize, Search, Type } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

interface ReaderTopBarProps {
  visible: boolean
  bookTitle: string
  chapterTitle: string
  bookmarked: boolean
  onToggleToc: () => void
  onToggleBookmark: () => void
  onToggleSettings: () => void
  /** 指针离开顶栏（例如移入 iframe 正文）时触发，用于延迟隐藏工具栏。 */
  scheduleChromeHide?: () => void
}

export function ReaderTopBar({
  visible,
  bookTitle,
  chapterTitle,
  bookmarked,
  onToggleToc,
  onToggleBookmark,
  onToggleSettings,
  scheduleChromeHide,
}: ReaderTopBarProps) {
  const { t } = useTranslation()
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
        "reader-chrome-frost absolute inset-x-0 top-0 z-50 grid h-11 grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 transition-opacity duration-300 ease-out",
        visible ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
      onPointerLeave={
        visible && scheduleChromeHide
          ? () => {
              scheduleChromeHide()
            }
          : undefined
      }
    >
      <div className="flex min-w-0 items-center justify-start gap-0.5">
        <TopBarButton title={t("reader.toc")} onClick={onToggleToc}>
          <List className="size-[18px]" />
        </TopBarButton>
        <TopBarButton
          title={
            isFullscreen ? t("reader.exitFullscreen") : t("reader.fullscreen")
          }
          onClick={toggleFullscreen}
        >
          {isFullscreen ? (
            <Minimize className="size-[18px]" />
          ) : (
            <Maximize className="size-[18px]" />
          )}
        </TopBarButton>
      </div>

      <div className="min-w-0 max-w-[min(100vw-14rem,42rem)] truncate text-center text-[13px] text-reader-chrome-fg">
        {chapterTitle || bookTitle}
      </div>

      <div className="flex items-center justify-end gap-0.5">
        <TopBarButton title={t("reader.fontSize")} onClick={onToggleSettings}>
          <Type className="size-[18px]" />
        </TopBarButton>
        <TopBarButton title={t("reader.search")} onClick={() => {}}>
          <Search className="size-[18px]" />
        </TopBarButton>
        <TopBarButton
          title={t("reader.bookmark")}
          onClick={onToggleBookmark}
          active={bookmarked}
        >
          <Bookmark className="size-[18px]" />
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
