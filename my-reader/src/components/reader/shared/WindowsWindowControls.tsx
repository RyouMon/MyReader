import { isTauri } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { Copy, Minus, Square, X } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

const buttonClass =
  "inline-flex h-full w-8 items-center justify-center text-reader-chrome-fg/80 hover:bg-reader-chrome-fg/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-reader-chrome-active sm:w-12"

export function WindowsWindowControls({
  onClose,
  onMinimize,
  onToggleMaximize,
}: {
  onClose: () => void
  onMinimize: () => void
  onToggleMaximize: () => void
}) {
  const { t } = useTranslation()
  const [maximized, setMaximized] = useState(false)

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
        console.error("Failed to sync Windows reader maximized state:", e)
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
        console.error("Failed to listen to Windows reader resize events:", e)
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
        <Minus className="size-3" strokeWidth={1.5} aria-hidden />
      </button>
      <button
        type="button"
        className={buttonClass}
        title={maximizeLabel}
        aria-label={maximizeLabel}
        onClick={onToggleMaximize}
      >
        {maximized ? (
          <Copy className="size-3" strokeWidth={1.5} aria-hidden />
        ) : (
          <Square className="size-3" strokeWidth={1.5} aria-hidden />
        )}
      </button>
      <button
        type="button"
        className={cn(buttonClass, "hover:bg-danger hover:text-ink-inverse")}
        title={t("reader.close")}
        aria-label={t("reader.close")}
        onClick={onClose}
      >
        <X className="size-3" strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  )
}
