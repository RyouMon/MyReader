import { useEffect } from "react"
import { Pressable, StyleSheet } from "react-native"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated"
import { useTranslation } from "react-i18next"

import {
  type ReaderChromePalette,
  underlayFromSurface,
} from "@/src/design/reader-chrome-palette"
import {
  READER_FLOATING_BUTTON_ELEVATION,
  READER_FLOATING_BUTTON_ENTER_DURATION_MS,
  READER_FLOATING_BUTTON_EXIT_DURATION_MS,
  READER_FLOATING_BUTTON_HIDDEN_SCALE,
  READER_FLOATING_BUTTON_HIT_SLOP,
  READER_FLOATING_BUTTON_ICON_SIZE,
  READER_FLOATING_BUTTON_LEFT,
  READER_FLOATING_BUTTON_RADIUS,
  READER_FLOATING_BUTTON_SHADOW_COLOR,
  READER_FLOATING_BUTTON_SHADOW_OFFSET_X,
  READER_FLOATING_BUTTON_SHADOW_OFFSET_Y,
  READER_FLOATING_BUTTON_SHADOW_OPACITY,
  READER_FLOATING_BUTTON_SHADOW_RADIUS,
  READER_FLOATING_BUTTON_SIZE,
  READER_FLOATING_BUTTON_SPRING_DAMPING,
  READER_FLOATING_BUTTON_SPRING_STIFFNESS,
  READER_FLOATING_BUTTON_VISIBLE_DELAY_MS,
  READER_FLOATING_BUTTON_VISIBLE_SCALE,
} from "./readerChromeConstants"
import { ChromeState } from "./chrome-state"
import { ReaderChromeIcon } from "./ReaderChromeIcon"
import { useReaderChromePressFeedback } from "./useReaderChromePressFeedback"

export function readerBookmarkButtonVisible(
  chromeState: ChromeState,
  bookmarked: boolean,
): boolean {
  return chromeState !== ChromeState.Reading || bookmarked
}

export function readerBookmarkIconActiveState(
  current: boolean,
  bookmarked: boolean,
  visible: boolean,
): boolean {
  return visible ? bookmarked : current
}

type Props = {
  bookmarked: boolean
  disabled: boolean
  iconOnly: boolean
  insetsTop: number
  visible: boolean
  palette: ReaderChromePalette
  onPress: () => void
}

export default function ReaderBookmarkButton({
  bookmarked,
  disabled,
  iconOnly,
  insetsTop,
  visible,
  palette,
  onPress,
}: Props) {
  const { t } = useTranslation()
  const opacity = useSharedValue(0)
  const surfaceOpacity = useSharedValue(iconOnly ? 0 : 1)
  const bookmarkActive = useSharedValue(bookmarked ? 1 : 0)
  const scale = useSharedValue(READER_FLOATING_BUTTON_HIDDEN_SCALE)
  const { pressScale, handlePressIn, handlePressOut } =
    useReaderChromePressFeedback()

  useEffect(() => {
    bookmarkActive.value = readerBookmarkIconActiveState(
      bookmarkActive.value === 1,
      bookmarked,
      visible,
    )
      ? 1
      : 0
  }, [bookmarkActive, bookmarked, visible])

  useEffect(() => {
    if (visible) {
      opacity.value = withDelay(
        READER_FLOATING_BUTTON_VISIBLE_DELAY_MS,
        withTiming(1, { duration: READER_FLOATING_BUTTON_ENTER_DURATION_MS }),
      )
      scale.value = withDelay(
        READER_FLOATING_BUTTON_VISIBLE_DELAY_MS,
        withSpring(READER_FLOATING_BUTTON_VISIBLE_SCALE, {
          stiffness: READER_FLOATING_BUTTON_SPRING_STIFFNESS,
          damping: READER_FLOATING_BUTTON_SPRING_DAMPING,
        }),
      )
    } else {
      opacity.value = withTiming(0, {
        duration: READER_FLOATING_BUTTON_EXIT_DURATION_MS,
      })
      scale.value = withTiming(READER_FLOATING_BUTTON_HIDDEN_SCALE, {
        duration: READER_FLOATING_BUTTON_EXIT_DURATION_MS,
      })
      handlePressOut()
    }
  }, [handlePressOut, opacity, scale, visible])

  useEffect(() => {
    surfaceOpacity.value = withTiming(iconOnly ? 0 : 1, {
      duration: iconOnly
        ? READER_FLOATING_BUTTON_EXIT_DURATION_MS
        : READER_FLOATING_BUTTON_ENTER_DURATION_MS,
    })
  }, [iconOnly, surfaceOpacity])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value * pressScale.value }],
  }))
  const surfaceAnimatedStyle = useAnimatedStyle(() => ({
    opacity: surfaceOpacity.value,
  }))
  const inactiveIconAnimatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - bookmarkActive.value,
  }))
  const activeIconAnimatedStyle = useAnimatedStyle(() => ({
    opacity: bookmarkActive.value,
  }))

  return (
    <Animated.View
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      pointerEvents={visible ? "auto" : "none"}
      testID="reader-bookmark-button"
      style={[
        styles.button,
        {
          left: READER_FLOATING_BUTTON_LEFT,
          top: insetsTop,
        },
        animatedStyle,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        testID="reader-bookmark-surface"
        style={[
          StyleSheet.absoluteFill,
          styles.surface,
          { backgroundColor: palette.actionSurface },
          surfaceAnimatedStyle,
        ]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(
          bookmarked
            ? "reader.bookmarks.removeCurrent"
            : "reader.bookmarks.addCurrent",
        )}
        accessibilityState={{ disabled, selected: bookmarked }}
        android_ripple={
          iconOnly
            ? undefined
            : {
                color: underlayFromSurface(palette.actionSurface, palette.bg),
              }
        }
        disabled={disabled || !visible}
        hitSlop={READER_FLOATING_BUTTON_HIT_SLOP}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.pressable}
      >
        <Animated.View
          pointerEvents="none"
          testID="reader-bookmark-icon-inactive"
          style={[styles.iconLayer, inactiveIconAnimatedStyle]}
        >
          <ReaderChromeIcon
            name="bookmark"
            size={READER_FLOATING_BUTTON_ICON_SIZE}
            color={palette.actionText}
          />
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          testID="reader-bookmark-icon-active"
          style={[styles.iconLayer, activeIconAnimatedStyle]}
        >
          <ReaderChromeIcon
            name="bookmarkActive"
            size={READER_FLOATING_BUTTON_ICON_SIZE}
            color={palette.accentText}
          />
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    zIndex: 1,
    width: READER_FLOATING_BUTTON_SIZE,
    height: READER_FLOATING_BUTTON_SIZE,
    borderRadius: READER_FLOATING_BUTTON_RADIUS,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  surface: {
    borderRadius: READER_FLOATING_BUTTON_RADIUS,
    borderCurve: "continuous",
    shadowColor: READER_FLOATING_BUTTON_SHADOW_COLOR,
    shadowOpacity: READER_FLOATING_BUTTON_SHADOW_OPACITY,
    shadowRadius: READER_FLOATING_BUTTON_SHADOW_RADIUS,
    shadowOffset: {
      width: READER_FLOATING_BUTTON_SHADOW_OFFSET_X,
      height: READER_FLOATING_BUTTON_SHADOW_OFFSET_Y,
    },
    elevation: READER_FLOATING_BUTTON_ELEVATION,
  },
  pressable: {
    width: READER_FLOATING_BUTTON_SIZE,
    height: READER_FLOATING_BUTTON_SIZE,
    borderRadius: READER_FLOATING_BUTTON_RADIUS,
    borderCurve: "continuous",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  iconLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
})
