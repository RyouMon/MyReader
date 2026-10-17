import type {
  ReaderNavigationHistory,
  NavigationDirection,
} from "@my-reader/tools/reader-navigation-history"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import { Undo2, Redo2 } from "lucide-react"
import { useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"

export function ReaderNavigationButtons({
  history,
  chromeVisible,
  getLocationLabel,
  onNavigate,
}: {
  history: ReaderNavigationHistory
  chromeVisible: boolean
  getLocationLabel: (locator: ReaderLocator) => string
  onNavigate: (locator: ReaderLocator) => void
}) {
  const { t } = useTranslation()
  const { entries, index, remoteHint } = useSyncExternalStore(
    history.subscribe,
    history.getSnapshot,
  )
  return (
    <div className="pointer-events-none absolute inset-x-4 top-0 bottom-4 grid grid-cols-2 items-center gap-4">
      {([-1, 1] as const).map((direction: NavigationDirection) => {
        const target = entries[index + direction]
        if (!target || (!chromeVisible && !(direction === 1 && remoteHint)))
          return null
        const Icon = direction === -1 ? Undo2 : Redo2
        const label = t(
          direction === -1
            ? "reader.navigationBack"
            : "reader.navigationForward",
        )
        const locationLabel = getLocationLabel(target)
        const accessibilityLabel = `${label}, ${locationLabel}`
        return (
          <button
            key={direction}
            type="button"
            dir="ltr"
            aria-label={accessibilityLabel}
            title={accessibilityLabel}
            className={`reader-chrome-icon-btn pointer-events-auto row-start-1 h-7 w-auto min-w-7 max-w-2/3 gap-1.5 rounded-full px-2.5 text-xs font-medium tabular-nums ${direction === -1 ? "col-start-1 justify-self-start" : "col-start-2 justify-self-end"}`}
            onClick={() => {
              const locator = history.move(direction)
              if (locator) onNavigate(locator)
            }}
          >
            {direction === -1 && <Icon className="size-3 shrink-0" />}
            <span dir="auto" className="truncate">
              {locationLabel}
            </span>
            {direction === 1 && <Icon className="size-3 shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}
