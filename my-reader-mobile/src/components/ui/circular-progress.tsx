import { useEffect } from "react"
import Reanimated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated"
import Svg, { Circle } from "react-native-svg"

import { useThemePalette } from "@/src/design/tokens"

const AnimatedCircle = Reanimated.createAnimatedComponent(Circle)

type CircularProgressProps = {
  progress: number
  indeterminate?: boolean
  size?: number
  strokeWidth?: number
  color?: string
  trackColor?: string
}

/**
 * Animated circular progress ring.
 * - indeterminate: shows a 5% arc rotating clockwise (spinner style)
 * - determinate: shows progress arc with animated transitions on change
 */
export function CircularProgress({
  progress,
  indeterminate = false,
  size = 14,
  strokeWidth = 1.5,
  color,
  trackColor,
}: CircularProgressProps) {
  const palette = useThemePalette()
  const resolvedColor = color ?? palette.primary
  const resolvedTrackColor = trackColor ?? "rgba(0,0,0,0.12)"

  const half = size / 2
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const arcLength = indeterminate
    ? 0.1 * circumference
    : Math.min(1, Math.max(0, progress)) * circumference
  const targetOffset = circumference - arcLength

  const animatedOffset = useSharedValue(circumference)
  const rotation = useSharedValue(0)

  // Animate offset when progress or indeterminate changes
  useEffect(() => {
    animatedOffset.value = withTiming(targetOffset, { duration: 300 })
  }, [animatedOffset, targetOffset])

  // Handle rotation animation
  useEffect(() => {
    if (indeterminate) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 800, easing: Easing.linear }),
        -1,
        false,
      )
    } else {
      cancelAnimation(rotation)
      rotation.value = withTiming(0, { duration: 150 })
    }
  }, [indeterminate, rotation])

  const circleProps = useAnimatedProps(() => ({
    strokeDashoffset: animatedOffset.value,
  }))

  const rotationStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }))

  return (
    <Reanimated.View style={[{ width: size, height: size }, rotationStyle]}>
      <Svg width={size} height={size}>
        <Circle
          cx={half}
          cy={half}
          r={radius}
          stroke={resolvedTrackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={half}
          cy={half}
          r={radius}
          stroke={resolvedColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={circleProps}
          strokeLinecap="round"
          transform={`rotate(-90, ${half}, ${half})`}
        />
      </Svg>
    </Reanimated.View>
  )
}
