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
  onNavigate,
}: {
  history: ReaderNavigationHistory
  chromeVisible: boolean
  onNavigate: (locator: ReaderLocator) => void
}) {
  const { t } = useTranslation()
  const { entries, index, remoteHint } = useSyncExternalStore(
    history.subscribe,
    history.getSnapshot,
  )
  return (
    <>
      {([-1, 1] as const).map((direction: NavigationDirection) => {
        if (
          !entries[index + direction] ||
          (!chromeVisible && !(direction === 1 && remoteHint))
        )
          return null
        const Icon = direction === -1 ? Undo2 : Redo2
        const label = t(
          direction === -1
            ? "reader.navigationBack"
            : "reader.navigationForward",
        )
        return (
          <button
            key={direction}
            type="button"
            aria-label={label}
            title={label}
            className={`absolute bottom-14 z-[52] flex size-11 items-center justify-center rounded-full border border-reader-chrome-border bg-[var(--reader-chrome-action-surface)] text-[var(--reader-chrome-action-text)] shadow-md hover:bg-[var(--reader-chrome-hover)] ${direction === -1 ? "left-4" : "right-4"}`}
            onClick={() => {
              const locator = history.move(direction)
              if (locator) onNavigate(locator)
            }}
          >
            <Icon className="size-5" />
          </button>
        )
      })}
    </>
  )
}
