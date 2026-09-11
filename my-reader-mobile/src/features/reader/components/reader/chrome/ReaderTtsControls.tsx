import type { TtsPlaybackState } from "@my-reader/readium"
import { useTranslation } from "react-i18next"
import { StyleSheet, useWindowDimensions, View } from "react-native"

import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"

import { ReaderFloatingIconButton } from "./ReaderFloatingIconButton"
import { ReaderFloatingTextButton } from "./ReaderFloatingTextButton"
import {
  READER_FLOATING_BUTTON_BOTTOM,
  READER_FLOATING_BUTTON_LEFT,
  READER_FLOATING_BUTTON_SIZE,
  readerTtsControlLayout,
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
  onPlayFromCurrentPosition: () => void
  onReturnToPlaybackPosition: () => void
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
  onPlayFromCurrentPosition,
  onReturnToPlaybackPosition,
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
  const { anchorStep, detachedActionWidth } =
    readerTtsControlLayout(windowWidth)

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
        placement="leading"
        visible={playFromCurrentPositionVisible}
        width={detachedActionWidth}
      />
      <ReaderFloatingTextButton
        accessibilityLabel={t("reader.tts.returnToPlaybackPosition")}
        bottom={READER_FLOATING_BUTTON_SIZE + 12}
        label={t("reader.tts.returnToPlaybackPosition")}
        onPress={onReturnToPlaybackPosition}
        palette={palette}
        placement="trailing"
        visible={playFromCurrentPositionVisible}
        width={detachedActionWidth}
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
