import type { Locator } from "@my-reader/readium"
import type { ReaderNavigationHistory } from "@my-reader/tools/reader-navigation-history"
import { useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"
import { StyleSheet, View } from "react-native"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import { ReaderChapterLabel } from "./reader/chrome/ReaderChapterLabel"
import { ReaderFloatingIconButton } from "./reader/chrome/ReaderFloatingIconButton"
import {
  READER_FLOATING_BUTTON_LEFT,
  READER_FLOATING_BUTTON_RIGHT,
  READER_FLOATING_BUTTON_SIZE,
} from "./reader/chrome/readerChromeConstants"

export function ReaderNavigationButtons({
  history,
  chromeVisible,
  insetsTop,
  title,
  palette,
  getLocationLabel,
  onNavigate,
}: {
  history: ReaderNavigationHistory
  chromeVisible: boolean
  insetsTop: number
  title?: string | null
  palette: ReaderChromePalette
  getLocationLabel: (locator: Locator) => string
  onNavigate: (locator: Locator) => void
}) {
  const { t } = useTranslation()
  const { entries, index, remoteHint } = useSyncExternalStore(
    history.subscribe,
    history.getSnapshot,
  )
  const buttons = ([-1, 1] as const).map((direction) => {
    const target = entries[index + direction]
    const locationLabel = target ? getLocationLabel(target as Locator) : ""
    const label = t(
      direction === -1 ? "reader.navigationBack" : "reader.navigationForward",
    )
    return (
      <ReaderFloatingIconButton
        key={direction}
        accessibilityLabel={`${label}, ${locationLabel}`}
        label={locationLabel}
        labelPosition={direction === -1 ? "after" : "before"}
        icon={direction === -1 ? "historyBack" : "historyForward"}
        testID={
          direction === -1 ? "reader-history-back" : "reader-history-forward"
        }
        visible={
          Boolean(target) && (chromeVisible || (direction === 1 && remoteHint))
        }
        palette={palette}
        onPress={() => {
          const locator = history.move(direction)
          if (locator) onNavigate(locator as Locator)
        }}
      />
    )
  })
  return (
    <View
      pointerEvents="box-none"
      style={[styles.controls, { top: insetsTop }]}
    >
      {buttons[0]}
      <ReaderChapterLabel
        title={chromeVisible ? title : undefined}
        palette={palette}
      />
      {buttons[1]}
    </View>
  )
}

const styles = StyleSheet.create({
  controls: {
    position: "absolute",
    left: READER_FLOATING_BUTTON_LEFT + READER_FLOATING_BUTTON_SIZE + 8,
    right: READER_FLOATING_BUTTON_RIGHT + READER_FLOATING_BUTTON_SIZE + 8,
    height: READER_FLOATING_BUTTON_SIZE,
    flexDirection: "row",
    alignItems: "center",
    direction: "ltr",
    gap: 8,
  },
})
