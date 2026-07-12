import { useEffect, useMemo } from "react"
import { Gesture } from "react-native-gesture-handler"
import {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"

import {
  clampReaderPositionIndex,
  type ReaderProgressDirection,
  readerPositionIndexForScrubberTranslation,
  readerProgressOffset,
  readerProgressPercentForPosition,
} from "./reader-progress-scrubber"
import {
  READER_FLOATING_BUTTON_PRESS_DURATION_MS,
  READER_FLOATING_BUTTON_PRESS_SCALE,
  READER_FLOATING_BUTTON_VISIBLE_SCALE,
} from "./readerChromeConstants"
import { useReaderChromePressFeedback } from "./useReaderChromePressFeedback"

const SCRUB_ACTIVATION_DISTANCE = 8
const SCRUB_VERTICAL_TOLERANCE = 16

type Options = {
  width: number
  direction: ReaderProgressDirection
  currentPositionIndex: number
  positionCount: number
  progressPercent: number
  onPreviewPosition: (positionIndex: number) => void
  onCommitPosition: (positionIndex: number) => void
  onCancel: () => void
  onTap: () => void
}

function animatePressScale(
  pressScale: SharedValue<number>,
  targetScale: number,
) {
  "worklet"
  pressScale.set(
    withTiming(targetScale, {
      duration: READER_FLOATING_BUTTON_PRESS_DURATION_MS,
    }),
  )
}

export function useReaderProgressScrubGesture({
  width,
  direction,
  currentPositionIndex,
  positionCount,
  progressPercent,
  onPreviewPosition,
  onCommitPosition,
  onCancel,
  onTap,
}: Options) {
  const { pressScale, pressFeedbackStyle } = useReaderChromePressFeedback()
  const startPositionIndex = useSharedValue(currentPositionIndex)
  const previewPositionIndex = useSharedValue(currentPositionIndex)
  const animatedProgressPercent = useSharedValue(progressPercent)

  useEffect(() => {
    animatedProgressPercent.set(progressPercent)
  }, [animatedProgressPercent, progressPercent])

  const gesture = useMemo(() => {
    const scrub = Gesture.Pan()
      .activeOffsetX([-SCRUB_ACTIVATION_DISTANCE, SCRUB_ACTIVATION_DISTANCE])
      .failOffsetY([-SCRUB_VERTICAL_TOLERANCE, SCRUB_VERTICAL_TOLERANCE])
      .onStart(() => {
        const initialPositionIndex = clampReaderPositionIndex(
          currentPositionIndex,
          positionCount,
        )
        startPositionIndex.set(initialPositionIndex)
        previewPositionIndex.set(initialPositionIndex)
        animatedProgressPercent.set(
          readerProgressPercentForPosition(initialPositionIndex, positionCount),
        )
        pressScale.set(READER_FLOATING_BUTTON_VISIBLE_SCALE)
        scheduleOnRN(onPreviewPosition, initialPositionIndex)
      })
      .onUpdate((event) => {
        const nextPositionIndex = readerPositionIndexForScrubberTranslation(
          startPositionIndex.get(),
          event.translationX,
          width,
          positionCount,
          direction,
        )
        animatedProgressPercent.set(
          readerProgressPercentForPosition(nextPositionIndex, positionCount),
        )
        if (previewPositionIndex.get() === nextPositionIndex) return

        previewPositionIndex.set(nextPositionIndex)
        scheduleOnRN(onPreviewPosition, nextPositionIndex)
      })
      .onEnd(() => {
        scheduleOnRN(onCommitPosition, previewPositionIndex.get())
      })
      .onFinalize((_event, success) => {
        animatePressScale(pressScale, READER_FLOATING_BUTTON_VISIBLE_SCALE)
        if (!success) {
          animatedProgressPercent.set(progressPercent)
          scheduleOnRN(onCancel)
        }
      })

    const tap = Gesture.Tap()
      .maxDistance(SCRUB_ACTIVATION_DISTANCE)
      .onBegin(() => {
        animatePressScale(pressScale, READER_FLOATING_BUTTON_PRESS_SCALE)
      })
      .onEnd((_event, success) => {
        if (success) scheduleOnRN(onTap)
      })
      .onFinalize(() => {
        animatePressScale(pressScale, READER_FLOATING_BUTTON_VISIBLE_SCALE)
      })

    return Gesture.Exclusive(scrub, tap)
  }, [
    animatedProgressPercent,
    currentPositionIndex,
    direction,
    onCancel,
    onCommitPosition,
    onPreviewPosition,
    onTap,
    positionCount,
    pressScale,
    previewPositionIndex,
    progressPercent,
    startPositionIndex,
    width,
  ])

  const progressFillStyle = useAnimatedStyle(() => ({
    width: readerProgressOffset(width, animatedProgressPercent.get()),
  }))

  return { gesture, pressFeedbackStyle, progressFillStyle }
}
