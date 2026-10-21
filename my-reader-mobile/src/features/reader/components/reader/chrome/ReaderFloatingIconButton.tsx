import { useEffect, useState } from "react"
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
import { Text } from "@/tw"

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

const LABELED_BUTTON_SIZE = 44
const LABELED_ICON_SIZE = 14

type ReaderFloatingIconButtonProps = {
  accessibilityLabel: string
  disabled?: boolean
  icon: ReaderChromeIconName
  loading?: boolean
  label?: string
  labelPosition?: "before" | "after"
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
  label: nextLabel,
  labelPosition = "after",
  onPress,
  palette,
  position,
  testID,
  visible,
}: ReaderFloatingIconButtonProps) {
  const label = useRetainedLabel(nextLabel, visible)
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
      display: visible || visibleOpacity.value > 0 ? "flex" : "none",
    }),
    [disabledOpacity, visible],
  )
  const interactive = visible && !disabled && !loading
  const contentKey = loading ? "loading" : icon
  const iconSize = label ? LABELED_ICON_SIZE : READER_FLOATING_BUTTON_ICON_SIZE

  return (
    <Animated.View
      style={[
        styles.button,
        label ? styles.labeledButton : null,
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
        accessibilityState={{ busy: loading, disabled: !interactive }}
        disabled={!interactive}
        hitSlop={READER_FLOATING_BUTTON_HIT_SLOP}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.pressable,
          label ? styles.labeledPressable : null,
          label && labelPosition === "before" ? styles.labelBefore : null,
        ]}
      >
        <Animated.View
          key={contentKey}
          testID="reader-floating-icon-transition"
          entering={FadeIn.duration(READER_FLOATING_BUTTON_ENTER_DURATION_MS)}
          exiting={FadeOut.duration(READER_FLOATING_BUTTON_EXIT_DURATION_MS)}
          pointerEvents="none"
          style={label ? styles.labeledIcon : styles.iconContent}
        >
          {loading ? (
            <ActivityIndicator size="small" color={palette.actionText} />
          ) : (
            <ReaderChromeIcon
              name={icon}
              size={iconSize}
              color={palette.actionText}
            />
          )}
        </Animated.View>
        {label ? (
          <Text
            className="shrink text-sm font-medium tabular-nums"
            style={{ color: palette.actionText }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {label}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  )
}

function useRetainedLabel(label: string | undefined, visible: boolean) {
  const [displayedLabel, setDisplayedLabel] = useState(label)
  // Keep content and geometry intact while the whole button fades out.
  if (visible && displayedLabel !== label) {
    setDisplayedLabel(label)
  }
  return displayedLabel
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
  labeledButton: {
    width: "auto",
    minWidth: LABELED_BUTTON_SIZE,
    maxWidth: "100%",
    height: LABELED_BUTTON_SIZE,
    borderRadius: LABELED_BUTTON_SIZE / 2,
    borderCurve: "continuous",
  },
  labeledPressable: {
    width: "auto",
    minWidth: LABELED_BUTTON_SIZE,
    maxWidth: "100%",
    height: LABELED_BUTTON_SIZE,
    flexDirection: "row",
    direction: "ltr",
    gap: 4,
    paddingHorizontal: 12,
  },
  labelBefore: {
    flexDirection: "row-reverse",
  },
  labeledIcon: {
    width: LABELED_ICON_SIZE,
    height: LABELED_ICON_SIZE,
    flexShrink: 0,
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
