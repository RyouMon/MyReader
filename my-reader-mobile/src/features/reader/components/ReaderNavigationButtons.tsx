import type { Locator } from "@my-reader/readium"
import type { ReaderNavigationHistory } from "@my-reader/tools/reader-navigation-history"
import { useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import { ReaderFloatingIconButton } from "./reader/chrome/ReaderFloatingIconButton"

export function ReaderNavigationButtons({
  history,
  chromeVisible,
  palette,
  insetsBottom,
  onNavigate,
}: {
  history: ReaderNavigationHistory
  chromeVisible: boolean
  palette: ReaderChromePalette
  insetsBottom: number
  onNavigate: (locator: Locator) => void
}) {
  const { t } = useTranslation()
  const { entries, index, remoteHint } = useSyncExternalStore(
    history.subscribe,
    history.getSnapshot,
  )
  return (
    <>
      {([-1, 1] as const).map((direction) => (
        <ReaderFloatingIconButton
          key={direction}
          accessibilityLabel={t(
            direction === -1
              ? "reader.navigationBack"
              : "reader.navigationForward",
          )}
          icon={direction === -1 ? "historyBack" : "historyForward"}
          testID={
            direction === -1 ? "reader-history-back" : "reader-history-forward"
          }
          visible={
            Boolean(entries[index + direction]) &&
            (chromeVisible || (direction === 1 && remoteHint))
          }
          palette={palette}
          position={{
            bottom: insetsBottom + 72,
            ...(direction === -1 ? { left: 16 } : { right: 16 }),
          }}
          onPress={() => {
            const locator = history.move(direction)
            if (locator) onNavigate(locator as Locator)
          }}
        />
      ))}
    </>
  )
}
