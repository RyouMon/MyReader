import { useEffect } from "react"
import { StyleSheet, View, type ViewProps } from "react-native"
import Reanimated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated"

type SkeletonProps = ViewProps & {
  animated?: boolean
  pulseDurationMs?: number
  pulseMaxOpacity?: number
  pulseMinOpacity?: number
}

/**
 * React Native Reusables-style loading placeholder.
 *
 * The opacity pulse runs on Reanimated's UI thread. Keep it configurable
 * because cover loading skeletons appear inside recycled FlashList cells and
 * must be easy to disable when profiling scroll cost.
 */
export function Skeleton({
  animated = false,
  pulseDurationMs = 750,
  pulseMaxOpacity = 1,
  pulseMinOpacity = 0.4,
  style,
  ...props
}: SkeletonProps) {
  const opacity = useSharedValue(pulseMaxOpacity)
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  useEffect(() => {
    if (!animated) {
      cancelAnimation(opacity)
      opacity.value = pulseMaxOpacity
      return
    }

    opacity.value = withRepeat(
      withSequence(
        withTiming(pulseMinOpacity, { duration: pulseDurationMs }),
        withTiming(pulseMaxOpacity, { duration: pulseDurationMs }),
      ),
      -1,
      false,
    )

    return () => {
      cancelAnimation(opacity)
    }
  }, [animated, opacity, pulseDurationMs, pulseMaxOpacity, pulseMinOpacity])

  if (animated) {
    return (
      <Reanimated.View {...props} style={[styles.root, style, animatedStyle]} />
    )
  }

  return (
    <View
      {...props}
      style={[styles.root, style, { opacity: pulseMinOpacity }]}
    />
  )
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "rgba(122, 107, 93, 0.18)",
    borderRadius: 6,
  },
})
