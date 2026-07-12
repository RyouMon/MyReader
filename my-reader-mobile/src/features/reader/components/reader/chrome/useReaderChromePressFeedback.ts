import { useCallback } from "react"
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"

import {
  READER_FLOATING_BUTTON_PRESS_DURATION_MS,
  READER_FLOATING_BUTTON_PRESS_SCALE,
  READER_FLOATING_BUTTON_VISIBLE_SCALE,
} from "./readerChromeConstants"

export function useReaderChromePressFeedback() {
  const pressScale = useSharedValue(READER_FLOATING_BUTTON_VISIBLE_SCALE)

  const pressFeedbackStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }))

  const handlePressIn = useCallback(() => {
    pressScale.set(
      withTiming(READER_FLOATING_BUTTON_PRESS_SCALE, {
        duration: READER_FLOATING_BUTTON_PRESS_DURATION_MS,
      }),
    )
  }, [pressScale])

  const handlePressOut = useCallback(() => {
    pressScale.set(
      withTiming(READER_FLOATING_BUTTON_VISIBLE_SCALE, {
        duration: READER_FLOATING_BUTTON_PRESS_DURATION_MS,
      }),
    )
  }, [pressScale])

  return {
    pressScale,
    pressFeedbackStyle,
    handlePressIn,
    handlePressOut,
  }
}
