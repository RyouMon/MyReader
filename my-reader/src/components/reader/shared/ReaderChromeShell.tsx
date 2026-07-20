import { readerChromePalette } from "@my-reader/tools/reader-chrome-palette"
import { readerThemePresetFor } from "@my-reader/tools/reader-themes"
import {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  useEffect,
  useMemo,
} from "react"
import { ReaderPanelsBackdrop } from "@/components/reader/shared/ReaderPanelsBackdrop"
import { ReaderTopBar } from "@/components/reader/shared/ReaderTopBar"
import { ReadingChromeEdgeZones } from "@/components/reader/shared/ReadingChromeEdgeZones"
import { cn } from "@/lib/utils"

const READER_ROOT_LAYOUT =
  "reader-window-root relative flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden"

export type ReaderChromeTopBarConfig = {
  bookTitle: string
  chapterTitle: string
  bookmarked: boolean
  bookmarkDisabled?: boolean
  tocOpen?: boolean
  bookmarksOpen?: boolean
  annotationsOpen?: boolean
  searchOpen?: boolean
  settingsOpen?: boolean
  showReaderActions?: boolean
  previewNativeMacFullscreen?: boolean
  onToggleToc: () => void
  onToggleBookmarks?: () => void
  onToggleAnnotations?: () => void
  onToggleSearch?: () => void
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
  bookmarkPanel?: ReactNode
  annotationsPanel?: ReactNode
  searchPanel?: ReactNode
  settingsPanel: ReactNode
  /** 插在正文区域之前（如 EPUB 宿主 iframe 的全局样式）。 */
  beforeMain?: ReactNode
  main: ReactNode
  /** 底栏；无则省略。 */
  bottomChrome?: ReactNode
  /** 底部状态栏（页码、进度文字），轻量悬浮风格。 */
  bottomStatusBar?: ReactNode
  /** 叠在正文区上的左右翻页按钮。 */
  edgeTurnOverlays?: ReactNode
  /** 追加在根布局 class 上。 */
  rootClassName?: string
  /** 任一侧栏展开时显示顶栏下方的点击蒙层并调用关闭。 */
  panelsOpen?: boolean
  onClosePanels?: () => void
  /** 当前阅读主题，用于设置 data-reader-theme 以驱动工具栏颜色。 */
  theme?: string
  readerMode?: "fixed-layout"
  /** 固定版式阅读画布背景；写入外壳变量，确保侧栏打开时也能即时更新。 */
  readerBackgroundColor?: string
}

type ReaderChromeStyle = CSSProperties &
  Record<`--reader-${string}`, string> & {
    "--viewer-bg"?: string
  }

export function readerChromeThemeStyle(
  theme?: string,
  readerMode?: "fixed-layout",
): ReaderChromeStyle | undefined {
  if (!theme || readerMode === "fixed-layout") return undefined

  const preset = readerThemePresetFor(theme)
  const palette = readerChromePalette(
    preset.foregroundColor,
    preset.backgroundColor,
  )

  return {
    "--reader-chrome-bg": palette.bg,
    "--reader-chrome-fg": palette.text,
    "--reader-chrome-muted": palette.textMuted,
    "--reader-chrome-border": palette.border,
    "--reader-chrome-hover": palette.segmentIdle,
    "--reader-chrome-active": palette.accent,
    "--reader-chrome-action-surface": palette.actionSurface,
    "--reader-chrome-action-text": palette.actionText,
    "--reader-chrome-segment-idle": palette.segmentIdle,
    "--reader-chrome-segment-active": palette.segmentActive,
    "--reader-chrome-toc-row-idle": "transparent",
    "--reader-chrome-toc-row-hover": palette.segmentIdle,
    "--reader-chrome-toc-row-active": palette.tocRowActive,
    "--reader-chrome-slider-track": palette.sliderTrack,
    "--reader-panel-bg": palette.sheetSurface,
  }
}

/**
 * EPUB / 漫画 / PDF 共用的阅读器外壳：顶栏、目录与设置侧栏、正文槽、底栏、边缘唤出条带。
 * 三种模式仅侧栏 / `main` / `bottomChrome` / `edgeTurnOverlays` 不同，工具栏显隐逻辑一致。
 */
export function ReaderChromeShell({
  readerRootRef,
  chromeVisible,
  showChrome,
  scheduleChromeHide,
  expandBottomForTts = false,
  topBar,
  tocPanel,
  bookmarkPanel,
  annotationsPanel,
  searchPanel,
  settingsPanel,
  beforeMain,
  main,
  bottomChrome,
  bottomStatusBar,
  edgeTurnOverlays,
  rootClassName,
  panelsOpen = false,
  onClosePanels,
  theme,
  readerMode,
  readerBackgroundColor,
}: ReaderChromeShellProps) {
  const chromeThemeStyle = useMemo(() => {
    const themeStyle = readerChromeThemeStyle(theme, readerMode)
    if (!readerBackgroundColor) return themeStyle
    return {
      ...themeStyle,
      "--reader-bg": readerBackgroundColor,
      "--viewer-bg": readerBackgroundColor,
    }
  }, [readerBackgroundColor, readerMode, theme])

  const onReaderRootPointerLeave = (e: ReactPointerEvent<HTMLDivElement>) => {
    const next = e.relatedTarget
    if (next instanceof Node && e.currentTarget.contains(next)) return
    scheduleChromeHide()
  }

  useEffect(() => {
    if (!panelsOpen || !onClosePanels) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClosePanels()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [panelsOpen, onClosePanels])

  return (
    <div
      ref={readerRootRef}
      className={cn(READER_ROOT_LAYOUT, rootClassName)}
      data-reader-theme={theme || undefined}
      data-reader-mode={readerMode}
      style={chromeThemeStyle}
      onPointerLeave={onReaderRootPointerLeave}
    >
      <section
        className="reader-window-paper relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        data-reader-theme={theme || undefined}
        data-reader-mode={readerMode}
        data-reader-chrome-visible={chromeVisible}
        style={chromeThemeStyle}
      >
        <ReaderTopBar
          bookTitle={topBar.bookTitle}
          chapterTitle={topBar.chapterTitle}
          visible={chromeVisible}
          bookmarked={topBar.bookmarked}
          bookmarkDisabled={topBar.bookmarkDisabled}
          tocOpen={topBar.tocOpen}
          bookmarksOpen={topBar.bookmarksOpen}
          annotationsOpen={topBar.annotationsOpen}
          searchOpen={topBar.searchOpen}
          settingsOpen={topBar.settingsOpen}
          showReaderActions={topBar.showReaderActions}
          previewNativeMacFullscreen={topBar.previewNativeMacFullscreen}
          onToggleToc={topBar.onToggleToc}
          onToggleBookmarks={topBar.onToggleBookmarks}
          onToggleAnnotations={topBar.onToggleAnnotations}
          onToggleSearch={topBar.onToggleSearch}
          onToggleBookmark={topBar.onToggleBookmark}
          onToggleSettings={topBar.onToggleSettings}
          scheduleChromeHide={scheduleChromeHide}
        />
        {panelsOpen && onClosePanels ? (
          <ReaderPanelsBackdrop onClose={onClosePanels} />
        ) : null}
        <div className="reader-window-content relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {readerMode === "fixed-layout" && readerBackgroundColor ? (
            <div
              key={readerBackgroundColor}
              aria-hidden="true"
              className="reader-fixed-layout-background pointer-events-none absolute inset-0 z-0"
              style={{ backgroundColor: readerBackgroundColor }}
            />
          ) : null}
          {beforeMain}
          {main}
          {bottomChrome}
          {edgeTurnOverlays}
        </div>
        {bottomStatusBar ? (
          <div
            className="reader-window-footer z-[51] w-full"
            onPointerLeave={chromeVisible ? scheduleChromeHide : undefined}
          >
            {bottomStatusBar}
          </div>
        ) : null}
        {tocPanel}
        {bookmarkPanel}
        {annotationsPanel}
        {searchPanel}
        {settingsPanel}
        <ReadingChromeEdgeZones
          passThrough={chromeVisible}
          onReveal={showChrome}
          expandBottomForTts={expandBottomForTts}
        />
      </section>
    </div>
  )
}
