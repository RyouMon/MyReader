import { isTauri } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { Bookmark, List, Settings } from "lucide-react"
import type { ReactNode, PointerEvent as ReactPointerEvent } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { isMacPlatform } from "@/lib/platform"
import {
  releaseReaderTrafficLightsToSystemChrome,
  setReaderTrafficLightsVisible,
} from "@/lib/readerTrafficLights"
import { cn } from "@/lib/utils"

interface ReaderTopBarProps {
  visible: boolean
  bookTitle: string
  chapterTitle: string
  bookmarked: boolean
  tocOpen?: boolean
  settingsOpen?: boolean
  previewNativeMacFullscreen?: boolean
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
  tocOpen,
  settingsOpen,
  previewNativeMacFullscreen = false,
  onToggleToc,
  onToggleBookmark,
  onToggleSettings,
  scheduleChromeHide,
}: ReaderTopBarProps) {
  const { t } = useTranslation()
  const [useNativeMacWindowControls, setUseNativeMacWindowControls] =
    useState(false)
  const [isNativeMacFullscreen, setIsNativeMacFullscreen] = useState(false)
  const isNativeMacFullscreenRef = useRef(false)
  const effectiveUseNativeMacWindowControls =
    previewNativeMacFullscreen || useNativeMacWindowControls
  const effectiveNativeMacFullscreen =
    previewNativeMacFullscreen || isNativeMacFullscreen
  const useMacWindowSpacing = previewNativeMacFullscreen || isMacPlatform()

  useEffect(() => {
    if (previewNativeMacFullscreen) {
      setUseNativeMacWindowControls(false)
      return
    }
    if (!isTauri() || !isMacPlatform()) {
      setUseNativeMacWindowControls(false)
      return
    }

    let canceled = false
    const win = getCurrentWindow()

    async function syncNativeMacTitleBar(): Promise<void> {
      try {
        if (!(await win.isDecorated())) {
          await win.setDecorations(true)
        }
        await win.setTitleBarStyle("overlay")
        const decorated = await win.isDecorated()
        if (!canceled) {
          setUseNativeMacWindowControls(decorated)
        }
      } catch (e) {
        console.error("Failed to sync native macOS reader title bar:", e)
        if (!canceled) {
          setUseNativeMacWindowControls(false)
        }
      }
    }

    void syncNativeMacTitleBar()

    return () => {
      canceled = true
    }
  }, [previewNativeMacFullscreen])

  useEffect(() => {
    isNativeMacFullscreenRef.current = effectiveNativeMacFullscreen
  }, [effectiveNativeMacFullscreen])

  useEffect(() => {
    if (previewNativeMacFullscreen) {
      setIsNativeMacFullscreen(false)
      return
    }
    if (!isTauri() || !isMacPlatform()) {
      setIsNativeMacFullscreen(false)
      return
    }

    let canceled = false
    let unlistenResize: (() => void) | undefined
    const win = getCurrentWindow()

    async function syncFullscreenState(): Promise<void> {
      try {
        const fullscreen = await win.isFullscreen()
        if (!canceled) {
          setIsNativeMacFullscreen(fullscreen)
        }
      } catch (e) {
        console.error("Failed to sync macOS reader fullscreen state:", e)
        if (!canceled) {
          setIsNativeMacFullscreen(false)
        }
      }
    }

    void syncFullscreenState()
    void win
      .onResized(() => {
        void syncFullscreenState()
      })
      .then((unlisten) => {
        if (canceled) {
          unlisten()
          return
        }
        unlistenResize = unlisten
      })
      .catch((e) => {
        console.error("Failed to listen to macOS reader resize events:", e)
      })

    return () => {
      canceled = true
      unlistenResize?.()
    }
  }, [previewNativeMacFullscreen])

  useEffect(() => {
    if (previewNativeMacFullscreen) return
    if (!useNativeMacWindowControls) return

    if (isNativeMacFullscreen) {
      void releaseReaderTrafficLightsToSystemChrome().catch((e) => {
        console.error(
          "Failed to release macOS traffic lights to system chrome:",
          e,
        )
      })
      return
    }

    void setReaderTrafficLightsVisible(visible).catch((e) => {
      console.error("Failed to sync native macOS traffic lights visibility:", e)
    })
  }, [
    isNativeMacFullscreen,
    previewNativeMacFullscreen,
    useNativeMacWindowControls,
    visible,
  ])

  useEffect(() => {
    if (previewNativeMacFullscreen) return
    if (!useNativeMacWindowControls) return

    return () => {
      const restore = isNativeMacFullscreenRef.current
        ? releaseReaderTrafficLightsToSystemChrome
        : () => setReaderTrafficLightsVisible(true)

      void restore().catch((e) => {
        console.error("Failed to restore native macOS traffic lights:", e)
      })
    }
  }, [previewNativeMacFullscreen, useNativeMacWindowControls])

  const closeWindow = useCallback(() => {
    if (!isTauri()) return
    void getCurrentWindow().close()
  }, [])

  const minimizeWindow = useCallback(() => {
    if (!isTauri()) return
    void getCurrentWindow().minimize()
  }, [])

  const toggleMaximizeWindow = useCallback(() => {
    if (!isTauri()) return
    void getCurrentWindow().toggleMaximize()
  }, [])

  const startWindowDrag = useCallback(() => {
    if (!isTauri()) return
    void getCurrentWindow().startDragging()
  }, [])

  const startWindowDragFromHeader = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      const target = event.target
      if (!(target instanceof Element)) return
      if (
        target.closest(
          'button,a,input,select,textarea,[role="button"],[data-reader-window-no-drag="true"]',
        )
      ) {
        return
      }
      event.preventDefault()
      startWindowDrag()
    },
    [startWindowDrag],
  )
  const chromeVisibilityClass = cn(
    "transition-opacity duration-300 ease-out",
    visible ? "opacity-100" : "opacity-0",
  )
  const visibleChapterTitle = chapterTitle.trim()

  return (
    <header
      className={cn(
        "reader-window-header z-50 grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 pr-[9px]",
        useMacWindowSpacing ? "pl-[9px]" : "pl-5",
        !visible && "pointer-events-none",
      )}
      onPointerDown={startWindowDragFromHeader}
      onPointerLeave={
        visible && scheduleChromeHide
          ? () => {
              scheduleChromeHide()
            }
          : undefined
      }
    >
      <div
        className={cn(
          "relative z-10 flex min-w-0 items-center justify-start",
          useMacWindowSpacing ? "gap-4" : "gap-5",
          chromeVisibilityClass,
        )}
      >
        {effectiveUseNativeMacWindowControls &&
        !effectiveNativeMacFullscreen ? (
          <div aria-hidden className="h-3 w-[4.625rem] shrink-0" />
        ) : !effectiveUseNativeMacWindowControls ? (
          <MacWindowControls
            closeLabel={t("reader.close")}
            minimizeLabel={t("reader.minimize")}
            zoomLabel={t("reader.maximize")}
            onClose={closeWindow}
            onMinimize={minimizeWindow}
            onZoom={toggleMaximizeWindow}
          />
        ) : null}
        <TopBarButton
          title={t("reader.toc")}
          onClick={onToggleToc}
          active={tocOpen}
          chromeVisible={visible}
        >
          <List className="size-[17px]" />
        </TopBarButton>
      </div>

      <div
        className={cn(
          "relative z-10 h-full w-[min(42rem,calc(100vw-20rem))] min-w-0 overflow-hidden text-center",
          chromeVisibilityClass,
        )}
      >
        <span className="absolute inset-x-0 top-1/2 block w-full -translate-y-1/2 select-none truncate text-sm font-semibold leading-4 text-reader-chrome-fg/80">
          {bookTitle}
        </span>
        {visibleChapterTitle ? (
          <span className="absolute inset-x-0 top-[36px] block w-full select-none truncate text-xs font-medium leading-3 text-reader-chrome-muted/80">
            {visibleChapterTitle}
          </span>
        ) : null}
      </div>

      <div className="relative z-10 flex items-center justify-end gap-[9px]">
        <TopBarButton
          title={t("reader.settings")}
          onClick={onToggleSettings}
          active={settingsOpen}
          chromeVisible={visible}
        >
          <Settings className="size-[17px]" />
        </TopBarButton>
        <TopBarButton
          title={t("reader.bookmark")}
          onClick={onToggleBookmark}
          active={bookmarked}
          chromeVisible={visible}
          keepActiveIconVisible
        >
          <Bookmark
            className="size-[17px]"
            fill={bookmarked ? "currentColor" : "none"}
          />
        </TopBarButton>
      </div>
    </header>
  )
}

function TopBarButton({
  title,
  onClick,
  active,
  chromeVisible = true,
  keepActiveIconVisible = false,
  children,
}: {
  title: string
  onClick: () => void
  active?: boolean
  chromeVisible?: boolean
  keepActiveIconVisible?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="reader-chrome-icon-btn"
      data-active={active ? "true" : undefined}
      data-chrome-visible={chromeVisible ? "true" : "false"}
      data-keep-active-icon={keepActiveIconVisible ? "true" : undefined}
      data-shape="circle"
    >
      {children}
    </button>
  )
}

function MacWindowControls({
  closeLabel,
  minimizeLabel,
  zoomLabel,
  onClose,
  onMinimize,
  onZoom,
}: {
  closeLabel: string
  minimizeLabel: string
  zoomLabel: string
  onClose: () => void
  onMinimize: () => void
  onZoom: () => void
}) {
  return (
    <div className="reader-window-controls">
      <button
        type="button"
        className="reader-window-dot reader-window-dot-close"
        title={closeLabel}
        aria-label={closeLabel}
        onClick={onClose}
      >
        <span className="reader-window-control-icon" aria-hidden />
      </button>
      <button
        type="button"
        className="reader-window-dot reader-window-dot-minimize"
        title={minimizeLabel}
        aria-label={minimizeLabel}
        onClick={onMinimize}
      >
        <span className="reader-window-control-icon" aria-hidden />
      </button>
      <button
        type="button"
        className="reader-window-dot reader-window-dot-zoom"
        title={zoomLabel}
        aria-label={zoomLabel}
        onClick={onZoom}
      >
        <svg
          className="reader-window-control-icon"
          viewBox="0 0 12 12"
          aria-hidden
        >
          <path d="M3 1.75h3.75v1.1H4.88l2.35 2.35-.78.78L4.1 3.63V5.5H3V1.75Zm6 8.5H5.25v-1.1h1.87L4.77 6.8l.78-.78L7.9 8.37V6.5H9v3.75Z" />
        </svg>
      </button>
    </div>
  )
}
