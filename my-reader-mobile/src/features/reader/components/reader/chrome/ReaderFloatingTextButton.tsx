import { useEffect } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated"

import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"

import {
  READER_FLOATING_BUTTON_ELEVATION,
  READER_FLOATING_BUTTON_ENTER_DURATION_MS,
  READER_FLOATING_BUTTON_EXIT_DURATION_MS,
  READER_FLOATING_BUTTON_HIDDEN_SCALE,
  READER_FLOATING_BUTTON_HIT_SLOP,
  READER_FLOATING_BUTTON_LEFT,
  READER_FLOATING_BUTTON_RIGHT,
  READER_FLOATING_BUTTON_SHADOW_COLOR,
  READER_FLOATING_BUTTON_SHADOW_OFFSET_X,
  READER_FLOATING_BUTTON_SHADOW_OFFSET_Y,
  READER_FLOATING_BUTTON_SHADOW_OPACITY,
  READER_FLOATING_BUTTON_SHADOW_RADIUS,
  READER_FLOATING_BUTTON_SPRING_DAMPING,
  READER_FLOATING_BUTTON_SPRING_STIFFNESS,
  READER_FLOATING_BUTTON_VISIBLE_DELAY_MS,
  READER_FLOATING_BUTTON_VISIBLE_SCALE,
} from "./readerChromeConstants"
import { useReaderChromePressFeedback } from "./useReaderChromePressFeedback"

type Props = {
  accessibilityLabel: string
  bottom: number
  label: string
  onPress: () => void
  palette: ReaderChromePalette
  placement?: "center" | "leading" | "trailing"
  visible: boolean
  width: number
}

export function ReaderFloatingTextButton({
  accessibilityLabel,
  bottom,
  label,
  onPress,
  palette,
  placement = "center",
  visible,
  width,
}: Props) {
  const visibleScale = useSharedValue(READER_FLOATING_BUTTON_HIDDEN_SCALE)
  const visibleOpacity = useSharedValue(0)
  const { pressScale, handlePressIn, handlePressOut } =
    useReaderChromePressFeedback()

  useEffect(() => {
    if (visible) {
      visibleOpacity.value = withDelay(
        READER_FLOATING_BUTTON_VISIBLE_DELAY_MS,
        withTiming(1, { duration: READER_FLOATING_BUTTON_ENTER_DURATION_MS }),
      )
      visibleScale.value = withDelay(
        READER_FLOATING_BUTTON_VISIBLE_DELAY_MS,
        withSpring(READER_FLOATING_BUTTON_VISIBLE_SCALE, {
          stiffness: READER_FLOATING_BUTTON_SPRING_STIFFNESS,
          damping: READER_FLOATING_BUTTON_SPRING_DAMPING,
        }),
      )
    } else {
      visibleOpacity.value = withTiming(0, {
        duration: READER_FLOATING_BUTTON_EXIT_DURATION_MS,
      })
      visibleScale.value = withTiming(READER_FLOATING_BUTTON_HIDDEN_SCALE, {
        duration: READER_FLOATING_BUTTON_EXIT_DURATION_MS,
      })
      handlePressOut()
    }
  }, [handlePressOut, visible, visibleOpacity, visibleScale])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: visibleOpacity.value,
    transform: [{ scale: visibleScale.value * pressScale.value }],
  }))

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.anchor,
        placement === "leading" && styles.leadingAnchor,
        placement === "trailing" && styles.trailingAnchor,
        { bottom },
      ]}
    >
      <Animated.View
        pointerEvents={visible ? "auto" : "none"}
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
        style={animatedStyle}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          disabled={!visible}
          hitSlop={READER_FLOATING_BUTTON_HIT_SLOP}
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={[
            styles.button,
            { width, backgroundColor: palette.actionSurface },
          ]}
        >
          <Text style={[styles.label, { color: palette.actionText }]}>
            {label}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  anchor: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  leadingAnchor: {
    alignItems: "flex-start",
    paddingLeft: READER_FLOATING_BUTTON_LEFT,
  },
  trailingAnchor: {
    alignItems: "flex-end",
    paddingRight: READER_FLOATING_BUTTON_RIGHT,
  },
  button: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 999,
    shadowColor: READER_FLOATING_BUTTON_SHADOW_COLOR,
    shadowOpacity: READER_FLOATING_BUTTON_SHADOW_OPACITY,
    shadowRadius: READER_FLOATING_BUTTON_SHADOW_RADIUS,
    shadowOffset: {
      width: READER_FLOATING_BUTTON_SHADOW_OFFSET_X,
      height: READER_FLOATING_BUTTON_SHADOW_OFFSET_Y,
    },
    elevation: READER_FLOATING_BUTTON_ELEVATION,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 20,
  },
})
