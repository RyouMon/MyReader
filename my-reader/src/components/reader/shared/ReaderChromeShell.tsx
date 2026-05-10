import { ReaderPanelsBackdrop } from "@/components/reader/shared/ReaderPanelsBackdrop"
import { ReadingChromeEdgeZones } from "@/components/reader/shared/ReadingChromeEdgeZones"
import { ReaderTopBar } from "@/components/reader/shared/ReaderTopBar"
import { cn } from "@/lib/utils"
import type { PointerEvent as ReactPointerEvent, ReactNode, Ref } from "react"

const READER_ROOT_LAYOUT =
  "relative flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden bg-background"

export type ReaderChromeTopBarConfig = {
  bookTitle: string
  chapterTitle: string
  bookmarked: boolean
  onToggleToc: () => void
  onToggleBookmark: () => void
  onToggleSettings: () => void
}

export type ReaderChromeShellProps = {
  readerRootRef: Ref<HTMLDivElement>
  chromeVisible: boolean
  showChrome: () => void
  /** 指针离开阅读器根或顶栏时延迟隐藏工具栏（与 `useReadingChrome` 的 `scheduleChromeHide` 一致）。 */
  scheduleChromeHide: () => void
  expandBottomForTts?: boolean
  topBar: ReaderChromeTopBarConfig
  tocPanel: ReactNode
  settingsPanel: ReactNode
  /** 插在正文区域之前（如 EPUB 宿主 iframe 的全局样式）。 */
  beforeMain?: ReactNode
  main: ReactNode
  /** 底栏；无则省略。 */
  bottomChrome?: ReactNode
  /** 底部状态栏（页码、进度文字），轻量悬浮风格。 */
  bottomStatusBar?: ReactNode
  /** 叠在正文区上的左右边缘翻页（须放在 `relative` 阅读区内，由调用方包一层 `relative` 或经此槽置于内容槽末尾）。 */
  edgeTurnOverlays?: ReactNode
  /** 追加在根布局 class 上。 */
  rootClassName?: string
  /** 目录或设置展开时显示顶栏下方的点击蒙层并调用关闭。 */
  panelsOpen?: boolean
  onClosePanels?: () => void
}

/**
 * EPUB / 漫画 / PDF 共用的阅读器外壳：顶栏、目录与设置侧栏、正文槽、底栏、边缘唤出条带。
 * 三种模式仅 `tocPanel` / `settingsPanel` / `main` / `bottomChrome` / `edgeTurnOverlays` 不同，工具栏显隐逻辑一致。
 */
export function ReaderChromeShell({
  readerRootRef,
  chromeVisible,
  showChrome,
  scheduleChromeHide,
  expandBottomForTts = false,
  topBar,
  tocPanel,
  settingsPanel,
  beforeMain,
  main,
  bottomChrome,
  bottomStatusBar,
  edgeTurnOverlays,
  rootClassName,
  panelsOpen = false,
  onClosePanels,
}: ReaderChromeShellProps) {
  const onReaderRootPointerLeave = (e: ReactPointerEvent<HTMLDivElement>) => {
    const next = e.relatedTarget
    if (next instanceof Node && e.currentTarget.contains(next)) return
    scheduleChromeHide()
  }

  return (
    <div
      ref={readerRootRef}
      className={cn(READER_ROOT_LAYOUT, rootClassName)}
      onPointerLeave={onReaderRootPointerLeave}
    >
      <ReaderTopBar
        bookTitle={topBar.bookTitle}
        chapterTitle={topBar.chapterTitle}
        visible={chromeVisible}
        bookmarked={topBar.bookmarked}
        onToggleToc={topBar.onToggleToc}
        onToggleBookmark={topBar.onToggleBookmark}
        onToggleSettings={topBar.onToggleSettings}
        scheduleChromeHide={scheduleChromeHide}
      />
      {panelsOpen && onClosePanels ? (
        <ReaderPanelsBackdrop onClose={onClosePanels} />
      ) : null}
      <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {beforeMain}
        {main}
        {bottomChrome}
        {bottomStatusBar}
        {edgeTurnOverlays}
      </div>
      {tocPanel}
      {settingsPanel}
      <ReadingChromeEdgeZones
        passThrough={chromeVisible}
        onReveal={showChrome}
        expandBottomForTts={expandBottomForTts}
      />
    </div>
  )
}
