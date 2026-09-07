import type { TtsPlaybackState } from "@my-reader/readium"
import { useTranslation } from "react-i18next"
import { StyleSheet, useWindowDimensions, View } from "react-native"

import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"

import { ReaderFloatingIconButton } from "./ReaderFloatingIconButton"
import { ReaderFloatingTextButton } from "./ReaderFloatingTextButton"
import {
  READER_FLOATING_BUTTON_BOTTOM,
  READER_FLOATING_BUTTON_LEFT,
  READER_FLOATING_BUTTON_RIGHT,
  READER_FLOATING_BUTTON_SIZE,
} from "./readerChromeConstants"

type Props = {
  visible: boolean
  expanded: boolean
  state: TtsPlaybackState | null
  remote: boolean
  playFromCurrentPosition: boolean
  palette: ReaderChromePalette
  onExpand: () => void
  onPlay: () => void
  onPause: () => void
  onPrevious: () => void
  onNext: () => void
  onStop: () => void
  onMore: () => void
  onPlayFromCurrentPosition: () => void
}

export function ReaderTtsControls({
  visible,
  expanded,
  state,
  remote,
  playFromCurrentPosition,
  palette,
  onExpand,
  onPlay,
  onPause,
  onPrevious,
  onNext,
  onStop,
  onMore,
  onPlayFromCurrentPosition,
}: Props) {
  const { t } = useTranslation()
  const { width: windowWidth } = useWindowDimensions()
  const busy = state?.state === "loading"
  const playing = state?.state === "playing"
  const loadingLabel = t(
    remote ? "reader.tts.states.generating" : "reader.tts.states.loading",
  )
  const playbackControlsVisible = visible && expanded
  const playFromCurrentPositionVisible =
    playbackControlsVisible && playFromCurrentPosition
  const anchorStep =
    (windowWidth -
      READER_FLOATING_BUTTON_LEFT -
      READER_FLOATING_BUTTON_RIGHT -
      READER_FLOATING_BUTTON_SIZE) /
    4

  return (
    <View
      testID="reader-tts-player"
      accessibilityRole={playbackControlsVisible ? "toolbar" : undefined}
      accessibilityLabel={
        playbackControlsVisible ? t("reader.tts.controls") : undefined
      }
      pointerEvents="box-none"
      style={styles.controls}
    >
      <ReaderFloatingTextButton
        accessibilityLabel={t("reader.tts.playFromCurrentPosition")}
        bottom={READER_FLOATING_BUTTON_SIZE + 12}
        label={t("reader.tts.playFromCurrentPosition")}
        onPress={onPlayFromCurrentPosition}
        palette={palette}
        visible={playFromCurrentPositionVisible}
      />

      <ReaderFloatingIconButton
        accessibilityLabel={t(
          expanded ? "reader.tts.stop" : "reader.tts.openControls",
        )}
        icon={expanded ? "stop" : "tts"}
        onPress={expanded ? onStop : onExpand}
        palette={palette}
        position={{ left: READER_FLOATING_BUTTON_LEFT, top: 0 }}
        visible={visible}
      />

      <ReaderFloatingIconButton
        accessibilityLabel={t("reader.tts.previous")}
        disabled={busy || !state || state.canGoPrevious === false}
        icon="previous"
        onPress={onPrevious}
        palette={palette}
        position={{ left: READER_FLOATING_BUTTON_LEFT + anchorStep, top: 0 }}
        visible={playbackControlsVisible}
      />

      <ReaderFloatingIconButton
        accessibilityLabel={
          busy
            ? loadingLabel
            : t(playing ? "reader.tts.pause" : "reader.tts.play")
        }
        icon={playing ? "pause" : "play"}
        loading={busy}
        onPress={playing ? onPause : onPlay}
        palette={palette}
        position={{
          left: READER_FLOATING_BUTTON_LEFT + anchorStep * 2,
          top: 0,
        }}
        visible={playbackControlsVisible}
      />

      <ReaderFloatingIconButton
        accessibilityLabel={t("reader.tts.next")}
        disabled={busy || !state || state.canGoNext === false}
        icon="next"
        onPress={onNext}
        palette={palette}
        position={{
          left: READER_FLOATING_BUTTON_LEFT + anchorStep * 3,
          top: 0,
        }}
        visible={playbackControlsVisible}
      />

      <ReaderFloatingIconButton
        accessibilityLabel={t("reader.chrome.moreActions")}
        icon="more"
        onPress={onMore}
        palette={palette}
        position={{ right: READER_FLOATING_BUTTON_RIGHT, top: 0 }}
        visible={visible}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  controls: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: READER_FLOATING_BUTTON_BOTTOM,
    height: READER_FLOATING_BUTTON_SIZE,
  },
})
