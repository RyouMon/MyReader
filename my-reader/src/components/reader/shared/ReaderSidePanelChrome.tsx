import type { LucideIcon } from "lucide-react"
import { X } from "lucide-react"
import { type CSSProperties, type ReactNode, useRef } from "react"
import { useTranslation } from "react-i18next"
import { useOverlayScrollbar } from "@/hooks/use-overlay-scrollbar"
import { cn } from "@/lib/utils"

type ReaderSidePanelFrameProps = {
  visible: boolean
  /** 左侧（目录等）或右侧（设置等）滑入方向与阴影。 */
  side: "left" | "right"
  children: ReactNode
}

export const READER_SETTINGS_CONTENT_CLASS =
  "reader-chrome-muted space-y-5 px-4 py-4 text-xs leading-relaxed"
export const READER_SETTINGS_LABEL_CLASS =
  "text-xs font-medium leading-4 tracking-normal text-reader-chrome-muted"
export const READER_SETTINGS_VALUE_CLASS =
  "text-xs font-medium leading-4 tracking-normal tabular-nums text-reader-chrome-fg/80"
export const READER_SETTINGS_OPTION_CLASS =
  "h-9 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-md border px-2 py-2 text-[13px] font-medium leading-4 transition-colors"

export function readerSettingsOptionStateClass(active: boolean): string {
  return active
    ? "border-reader-chrome-border bg-[var(--reader-chrome-segment-active)] text-reader-chrome-active hover:brightness-[0.98]"
    : "border-transparent bg-[var(--reader-chrome-segment-idle)] text-reader-chrome-muted hover:text-reader-chrome-fg hover:brightness-[0.98]"
}

/**
 * 阅读器侧栏 aside：定位、宽度、滑入动画与边框；正文滚动由 `ReaderSidePanelScrollArea` 承担。
 */
export function ReaderSidePanelFrame({
  visible,
  side,
  children,
}: ReaderSidePanelFrameProps) {
  const isLeft = side === "left"
  const style: CSSProperties = {
    opacity: visible ? 1 : 0,
    pointerEvents: visible ? "auto" : "none",
    transform: visible
      ? "translateX(0)"
      : `translateX(${isLeft ? "-" : ""}100%)`,
  }

  return (
    <aside
      data-side={side}
      data-visible={visible ? "true" : "false"}
      style={style}
      className={cn(
        "reader-chrome-panel-aside absolute top-[52px] bottom-[22px] z-[60] flex w-[min(20rem,calc(100%-4.75rem))] flex-col overflow-hidden rounded-2xl border sm:w-[21rem]",
        isLeft
          ? "reader-chrome-panel-shadow-l start-[9px] border-reader-chrome-border"
          : "reader-chrome-panel-shadow-r end-[9px] border-reader-chrome-border",
      )}
    >
      {children}
    </aside>
  )
}

type ReaderSidePanelHeaderProps = {
  title: string
  icon: LucideIcon
  onClose?: () => void
  showCloseButton?: boolean
}

export function ReaderSidePanelHeader({
  title,
  icon: Icon,
  onClose,
  showCloseButton = false,
}: ReaderSidePanelHeaderProps) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[52px] shrink-0 items-center justify-between gap-2 border-b border-reader-chrome-border px-4 py-3 text-sm font-semibold text-reader-chrome-fg">
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon className="size-4 shrink-0 opacity-60" />
        <span className="truncate">{title}</span>
      </div>
      {showCloseButton && onClose ? (
        <button
          type="button"
          className="reader-chrome-icon-btn shrink-0"
          title={t("reader.closePanel")}
          aria-label={t("reader.closePanel")}
          onClick={onClose}
        >
          <X className="size-[18px]" />
        </button>
      ) : null}
    </div>
  )
}

type ReaderSidePanelScrollAreaProps = {
  children: ReactNode
  className?: string
}

/** 侧栏共用的 OverlayScrollbars 纵向滚动区域。 */
export function ReaderSidePanelScrollArea({
  children,
  className,
}: ReaderSidePanelScrollAreaProps) {
  const scrollHostRef = useRef<HTMLDivElement>(null)
  const scrollViewportRef = useRef<HTMLDivElement>(null)

  useOverlayScrollbar(scrollHostRef, scrollViewportRef)

  return (
    <div
      ref={scrollHostRef}
      className="min-h-0 flex-1"
      data-overlayscrollbars-initialize
    >
      <div
        ref={scrollViewportRef}
        className="myreader-overlay-viewport h-full min-h-0 overflow-x-hidden overflow-y-auto"
      >
        <div className={className}>{children}</div>
      </div>
    </div>
  )
}
