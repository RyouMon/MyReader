import { isTauri } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { type CSSProperties, type ReactNode, useEffect, useState } from "react"
import AppSidebarToggle from "@/components/library/AppSidebarToggle"
import { Separator } from "@/components/ui/separator"
import { useSidebar } from "@/components/ui/sidebar"
import { isMacPlatform, isWindowsPlatform } from "@/lib/platform"
import { cn } from "@/lib/utils"
import { WindowsWindowControls } from "./WindowsWindowControls"

function runWindowAction(action: "close" | "minimize" | "toggleMaximize") {
  if (!isTauri()) return
  void getCurrentWindow()
    [action]()
    .catch((error) => {
      console.error(`Failed to ${action} main window:`, error)
    })
}

export default function AppTitleBar({
  showSidebarToggle = true,
  libraryControls,
  detailControls,
  detailVisible = Boolean(detailControls),
}: {
  showSidebarToggle?: boolean
  libraryControls?: ReactNode
  detailControls?: ReactNode
  detailVisible?: boolean
}) {
  const windows = isWindowsPlatform()
  const mac = isMacPlatform()
  const windowFocused = useWindowsWindowFocus(windows)
  const { open, isMobile, forceCollapsed } = useSidebar()
  const sidebarExpanded = open && !isMobile && !forceCollapsed
  const hasControls =
    showSidebarToggle && Boolean(libraryControls || detailControls)
  const sidebarWidth = sidebarExpanded
    ? "var(--sidebar-width)"
    : "var(--sidebar-width-icon)"

  return (
    <header
      data-tauri-drag-region
      data-testid="app-titlebar"
      data-window-focused={windowFocused}
      className={cn(
        "relative z-60 flex shrink-0 select-none items-center border-b border-border bg-background pointer-events-auto",
        windows ? "app-titlebar-windows h-8" : "h-11",
      )}
      style={
        {
          "--titlebar-leading-inset": `max(0px, ${mac ? "7.5rem" : "2.5rem"} - ${sidebarWidth})`,
          "--titlebar-trailing-inset": windows ? "9rem" : "0px",
        } as CSSProperties
      }
    >
      <div
        data-tauri-drag-region
        className={cn(
          "absolute inset-y-0 start-0 z-10 flex items-center",
          mac ? "pl-21" : "pl-1",
        )}
      >
        {showSidebarToggle ? <AppSidebarToggle /> : null}
      </div>
      {hasControls ? (
        <div data-tauri-drag-region className="flex h-full min-w-0 flex-1">
          <div
            data-tauri-drag-region
            className="relative h-full shrink-0 transition-[width] duration-200 ease-linear"
            style={{ width: sidebarWidth }}
          >
            {sidebarExpanded ? (
              <Separator
                orientation="vertical"
                className="pointer-events-none absolute end-0 top-1/2 -translate-y-1/2 data-[orientation=vertical]:h-5"
              />
            ) : null}
          </div>
          <TitleBarSections
            libraryControls={libraryControls}
            detailControls={detailControls}
            detailVisible={detailVisible}
          />
        </div>
      ) : null}
      <div data-tauri-drag-region className="absolute top-0 end-0 flex h-8">
        {windows ? (
          <WindowsWindowControls
            variant="app"
            onClose={() => runWindowAction("close")}
            onMinimize={() => runWindowAction("minimize")}
            onToggleMaximize={() => runWindowAction("toggleMaximize")}
          />
        ) : null}
      </div>
    </header>
  )
}

function useWindowsWindowFocus(enabled: boolean) {
  const [focused, setFocused] = useState(true)

  useEffect(() => {
    if (!enabled || !isTauri()) return
    const win = getCurrentWindow()
    let canceled = false
    let unlisten: (() => void) | undefined

    void win
      .isFocused()
      .then((value) => {
        if (!canceled) setFocused(value)
      })
      .catch((error) => {
        console.error("Failed to read main window focus:", error)
      })
    void win
      .onFocusChanged(({ payload }) => {
        if (!canceled) setFocused(payload)
      })
      .then((listener) => {
        if (canceled) listener()
        else unlisten = listener
      })
      .catch((error) => {
        console.error("Failed to listen to main window focus:", error)
      })

    return () => {
      canceled = true
      unlisten?.()
    }
  }, [enabled])

  return focused
}

function TitleBarSections({
  libraryControls,
  detailControls,
  detailVisible,
}: {
  libraryControls?: ReactNode
  detailControls?: ReactNode
  detailVisible: boolean
}) {
  return (
    <div data-tauri-drag-region className="flex h-full min-w-0 flex-1">
      {libraryControls ? (
        <div
          data-tauri-drag-region
          data-testid="library-titlebar"
          className={cn(
            "flex h-full min-w-0 flex-1 items-center ps-(--titlebar-leading-inset)",
            detailVisible && "w-1/2 flex-none",
            !detailControls && "pe-(--titlebar-trailing-inset)",
          )}
        >
          {libraryControls}
        </div>
      ) : null}
      {detailControls ? (
        <div
          data-tauri-drag-region
          data-testid="detail-titlebar"
          className={cn(
            "relative flex h-full min-w-0 items-center pe-(--titlebar-trailing-inset)",
            detailVisible && libraryControls && "w-1/2 flex-none",
            !detailVisible && "shrink-0",
            !libraryControls && "flex-1 ps-(--titlebar-leading-inset)",
          )}
        >
          {detailVisible && libraryControls ? (
            <Separator
              orientation="vertical"
              className="pointer-events-none absolute start-0 top-1/2 -translate-y-1/2 data-[orientation=vertical]:h-5"
            />
          ) : null}
          {detailControls}
        </div>
      ) : null}
    </div>
  )
}
