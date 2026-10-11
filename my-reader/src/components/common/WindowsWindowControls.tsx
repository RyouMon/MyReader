import { isTauri } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

export function WindowsWindowControls({
  variant = "reader",
  onClose,
  onMinimize,
  onToggleMaximize,
}: {
  variant?: "app" | "reader"
  onClose: () => void
  onMinimize: () => void
  onToggleMaximize: () => void
}) {
  const { t } = useTranslation()
  const [maximized, setMaximized] = useState(false)
  const buttonClass = cn(
    "inline-flex h-full items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2",
    variant === "reader"
      ? "w-8 text-reader-chrome-fg/80 hover:bg-reader-chrome-fg/10 active:bg-reader-chrome-fg/20 focus-visible:outline-reader-chrome-active sm:w-12"
      : "w-12 text-foreground hover:bg-foreground/10 active:bg-foreground/15 focus-visible:outline-ring",
  )

  useEffect(() => {
    if (!isTauri()) return
    const win = getCurrentWindow()
    let canceled = false
    let unlistenResize: (() => void) | undefined

    async function syncMaximized(): Promise<void> {
      try {
        const value = await win.isMaximized()
        if (!canceled) setMaximized(value)
      } catch (e) {
        console.error("Failed to sync Windows maximized state:", e)
      }
    }

    void syncMaximized()
    void win
      .onResized(() => {
        void syncMaximized()
      })
      .then((unlisten) => {
        if (canceled) {
          unlisten()
        } else {
          unlistenResize = unlisten
        }
      })
      .catch((e) => {
        console.error("Failed to listen to Windows resize events:", e)
      })

    return () => {
      canceled = true
      unlistenResize?.()
    }
  }, [])

  const maximizeLabel = t(maximized ? "reader.restore" : "reader.maximize")
  return (
    <div className="flex h-full items-center">
      <button
        type="button"
        className={buttonClass}
        title={t("reader.minimize")}
        aria-label={t("reader.minimize")}
        onClick={onMinimize}
      >
        <WindowsCaptionIcon action="minimize" />
      </button>
      <button
        type="button"
        className={buttonClass}
        title={maximizeLabel}
        aria-label={maximizeLabel}
        onClick={onToggleMaximize}
      >
        <WindowsCaptionIcon action={maximized ? "restore" : "maximize"} />
      </button>
      <button
        type="button"
        className={cn(buttonClass, "windows-caption-close")}
        title={t("reader.close")}
        aria-label={t("reader.close")}
        onClick={onClose}
      >
        <WindowsCaptionIcon action="close" />
      </button>
    </div>
  )
}

const CAPTION_ICON_PATHS = {
  minimize: "M0 5.5h10",
  maximize:
    "M1.5.5h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z",
  restore:
    "M2.5 2.5v-1a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1M1.5 2.5h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z",
  close: "m.5.5 9 9m0-9-9 9",
}

function WindowsCaptionIcon({
  action,
}: {
  action: keyof typeof CAPTION_ICON_PATHS
}) {
  return (
    <svg
      className="size-2.5"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d={CAPTION_ICON_PATHS[action]} />
    </svg>
  )
}
