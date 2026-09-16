import { useEffect } from "react"
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type ViewStyle,
} from "react-native"
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated"

import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"

import {
  READER_FLOATING_BUTTON_ENTER_DURATION_MS,
  READER_FLOATING_BUTTON_ELEVATION,
  READER_FLOATING_BUTTON_EXIT_DURATION_MS,
  READER_FLOATING_BUTTON_HIDDEN_SCALE,
  READER_FLOATING_BUTTON_HIT_SLOP,
  READER_FLOATING_BUTTON_ICON_SIZE,
  READER_FLOATING_BUTTON_RADIUS,
  READER_FLOATING_BUTTON_SIZE,
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
import { ReaderChromeIcon, type ReaderChromeIconName } from "./ReaderChromeIcon"
import { useReaderChromePressFeedback } from "./useReaderChromePressFeedback"

type ReaderFloatingIconButtonProps = {
  accessibilityLabel: string
  disabled?: boolean
  icon: ReaderChromeIconName
  loading?: boolean
  onPress: () => void
  palette: ReaderChromePalette
  position?: Pick<ViewStyle, "bottom" | "left" | "right" | "top">
  testID?: string
  visible: boolean
}

export function ReaderFloatingIconButton({
  accessibilityLabel,
  disabled = false,
  icon,
  loading = false,
  onPress,
  palette,
  position,
  testID,
  visible,
}: ReaderFloatingIconButtonProps) {
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

  const disabledOpacity = disabled ? 0.42 : 1
  const animatedStyle = useAnimatedStyle(
    () => ({
      transform: [{ scale: visibleScale.value * pressScale.value }],
      opacity: visibleOpacity.value * disabledOpacity,
    }),
    [disabledOpacity],
  )
  const interactive = visible && !disabled && !loading
  const contentKey = loading ? "loading" : icon

  return (
    <Animated.View
      style={[
        styles.button,
        position ? styles.floating : null,
        position,
        { backgroundColor: palette.actionSurface },
        animatedStyle,
      ]}
      pointerEvents={visible ? "auto" : "none"}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
    >
      <Pressable
        testID={testID}
        accessibilityRole={loading ? "progressbar" : "button"}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={
          loading ? { busy: true, disabled: true } : { disabled: !interactive }
        }
        disabled={!interactive}
        hitSlop={READER_FLOATING_BUTTON_HIT_SLOP}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.pressable}
      >
        <Animated.View
          key={contentKey}
          testID="reader-floating-icon-transition"
          entering={FadeIn.duration(READER_FLOATING_BUTTON_ENTER_DURATION_MS)}
          exiting={FadeOut.duration(READER_FLOATING_BUTTON_EXIT_DURATION_MS)}
          pointerEvents="none"
          style={styles.iconContent}
        >
          {loading ? (
            <ActivityIndicator size="small" color={palette.actionText} />
          ) : (
            <ReaderChromeIcon
              name={icon}
              size={READER_FLOATING_BUTTON_ICON_SIZE}
              color={palette.actionText}
            />
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  button: {
    width: READER_FLOATING_BUTTON_SIZE,
    height: READER_FLOATING_BUTTON_SIZE,
    borderRadius: READER_FLOATING_BUTTON_RADIUS,
    shadowColor: READER_FLOATING_BUTTON_SHADOW_COLOR,
    shadowOpacity: READER_FLOATING_BUTTON_SHADOW_OPACITY,
    shadowRadius: READER_FLOATING_BUTTON_SHADOW_RADIUS,
    shadowOffset: {
      width: READER_FLOATING_BUTTON_SHADOW_OFFSET_X,
      height: READER_FLOATING_BUTTON_SHADOW_OFFSET_Y,
    },
    elevation: READER_FLOATING_BUTTON_ELEVATION,
    alignItems: "center",
    justifyContent: "center",
  },
  floating: {
    position: "absolute",
  },
  pressable: {
    width: READER_FLOATING_BUTTON_SIZE,
    height: READER_FLOATING_BUTTON_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  iconContent: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
})
