import type { TtsPlaybackState } from "@my-reader/readium"
import { useTranslation } from "react-i18next"
import { StyleSheet, useWindowDimensions, View } from "react-native"

import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import type { ReaderTtsViewportRelation } from "@/src/features/reader/tts/reader-tts"

import { ReaderFloatingIconButton } from "./ReaderFloatingIconButton"
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
  viewportRelation: ReaderTtsViewportRelation
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
  viewportRelation,
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
  const { left, right } = navigationActions({
    viewportRelation,
    onPrevious,
    onNext,
    onPlayFromCurrentPosition,
    onReturnToPlaybackPosition,
  })
  const busy = state?.state === "loading"
  const playing = state?.state === "playing"
  const loadingLabel = t(
    remote ? "reader.tts.states.generating" : "reader.tts.states.loading",
  )
  const playbackControlsVisible = visible && expanded
  const { anchorStep } = readerTtsControlLayout(windowWidth)

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
        testID="reader-tts-left-action"
        accessibilityLabel={t(left.label)}
        disabled={
          busy ||
          !state ||
          (viewportRelation === null && state.canGoPrevious === false)
        }
        icon={left.icon}
        onPress={left.onPress}
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
        testID="reader-tts-right-action"
        accessibilityLabel={t(right.label)}
        disabled={
          busy ||
          !state ||
          (viewportRelation === null && state.canGoNext === false)
        }
        icon={right.icon}
        onPress={right.onPress}
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

function navigationActions({
  viewportRelation,
  onPrevious,
  onNext,
  onPlayFromCurrentPosition,
  onReturnToPlaybackPosition,
}: Pick<
  Props,
  | "viewportRelation"
  | "onPrevious"
  | "onNext"
  | "onPlayFromCurrentPosition"
  | "onReturnToPlaybackPosition"
>) {
  if (viewportRelation === "after") {
    return {
      left: {
        icon: "returnBackward",
        label: "reader.tts.returnToPlaybackPosition",
        onPress: onReturnToPlaybackPosition,
      },
      right: {
        icon: "fastForward",
        label: "reader.tts.playFromCurrentPosition",
        onPress: onPlayFromCurrentPosition,
      },
    } as const
  }
  if (viewportRelation === "before") {
    return {
      left: {
        icon: "rewind",
        label: "reader.tts.playFromCurrentPosition",
        onPress: onPlayFromCurrentPosition,
      },
      right: {
        icon: "returnForward",
        label: "reader.tts.returnToPlaybackPosition",
        onPress: onReturnToPlaybackPosition,
      },
    } as const
  }
  return {
    left: {
      icon: "previous",
      label: "reader.tts.previous",
      onPress: onPrevious,
    },
    right: { icon: "next", label: "reader.tts.next", onPress: onNext },
  } as const
}
