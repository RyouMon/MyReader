import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Animated as RNAnimated,
  Platform,
  StyleSheet,
  useWindowDimensions,
} from "react-native"

import { useThemePalette } from "@/src/design/tokens"
import {
  clearActiveReaderOpenTransition,
  getActiveReaderOpenTransition,
  subscribeReaderOpenTransition,
  type ReaderOpenTransition,
} from "@/src/features/reader/reader-open-transition"
import { Image, Text, View } from "@/tw"

const OPEN_MS = 780
const EXPAND_DONE = 0.68

export function ReaderOpenTransitionHost() {
  const [transition, setTransition] = useState(getActiveReaderOpenTransition)
  const { width, height } = useWindowDimensions()

  useEffect(() => {
    return subscribeReaderOpenTransition(() => {
      setTransition(getActiveReaderOpenTransition())
    })
  }, [])

  const handleFinished = useCallback(
    async (finishedTransition: ReaderOpenTransition) => {
      clearActiveReaderOpenTransition()
      finishedTransition.onFinished?.()
    },
    [],
  )

  if (!transition || width <= 0 || height <= 0) return null

  return (
    <ReaderOpenTransitionOverlay
      key={transition.createdAt}
      transition={transition}
      width={width}
      height={height}
      onFinished={handleFinished}
    />
  )
}

function ReaderOpenTransitionOverlay({
  transition,
  width,
  height,
  onFinished,
}: {
  transition: ReaderOpenTransition
  width: number
  height: number
  onFinished: (finishedTransition: ReaderOpenTransition) => Promise<void>
}) {
  const palette = useThemePalette()
  const progress = useMemo(() => new RNAnimated.Value(0), [])

  useEffect(() => {
    const animation = RNAnimated.timing(progress, {
      toValue: 1,
      duration: OPEN_MS,
      useNativeDriver: true,
    })

    animation.start(({ finished }) => {
      if (finished) void onFinished(transition)
    })

    return () => animation.stop()
  }, [onFinished, progress, transition])

  const sourceWidth = clamp(transition.frame.width, 1, width)
  const sourceHeight = clamp(transition.frame.height, 1, height)
  const sourceX = clamp(transition.frame.x, 0, width - sourceWidth)
  const sourceY = clamp(transition.frame.y, 0, height - sourceHeight)
  const sourceCenterX = sourceX + sourceWidth / 2
  const sourceCenterY = sourceY + sourceHeight / 2
  const targetCenterX = width / 2
  const targetCenterY = height / 2
  const startScaleX = clamp(sourceWidth / width, 0.05, 1)
  const startScaleY = clamp(sourceHeight / height, 0.05, 1)
  const deltaX = sourceCenterX - targetCenterX
  const deltaY = sourceCenterY - targetCenterY
  const isClosing = transition.direction === "close"

  const translateX = progress.interpolate({
    inputRange: [0, EXPAND_DONE],
    outputRange: isClosing ? [0, deltaX] : [deltaX, 0],
    extrapolate: "clamp",
  })
  const translateY = progress.interpolate({
    inputRange: [0, EXPAND_DONE],
    outputRange: isClosing ? [0, deltaY] : [deltaY, 0],
    extrapolate: "clamp",
  })
  const scaleX = progress.interpolate({
    inputRange: [0, EXPAND_DONE],
    outputRange: isClosing ? [1, startScaleX] : [startScaleX, 1],
    extrapolate: "clamp",
  })
  const scaleY = progress.interpolate({
    inputRange: [0, EXPAND_DONE],
    outputRange: isClosing ? [1, startScaleY] : [startScaleY, 1],
    extrapolate: "clamp",
  })
  const isIOS = Platform.OS === "ios"
  const openCoverAngles = isIOS
    ? ["0deg", "-4deg", "-38deg", "-92deg", "-112deg"]
    : ["0deg", "-8deg", "-72deg", "-166deg", "-178deg"]
  const closeCoverAngles = isIOS
    ? ["-112deg", "-92deg", "-38deg", "-4deg", "0deg"]
    : ["-178deg", "-166deg", "-72deg", "-8deg", "0deg"]
  const coverRotateY = progress.interpolate({
    inputRange: [0, 0.12, 0.54, 0.9, 1],
    outputRange: isClosing ? closeCoverAngles : openCoverAngles,
    extrapolate: "clamp",
  })
  const coverOpacity = progress.interpolate({
    inputRange: [0, 0.88, 1],
    outputRange: isClosing ? [1, 1, 1] : [1, 1, 0],
    extrapolate: "clamp",
  })
  const overlayOpacity = progress.interpolate({
    inputRange: [0, 0.9, 1],
    outputRange: [1, 1, 0],
    extrapolate: "clamp",
  })

  return (
    <RNAnimated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: "transparent",
          opacity: overlayOpacity,
          elevation: 9999,
          zIndex: 9999,
        },
      ]}
    >
      <RNAnimated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: "transparent",
            overflow: "visible",
            transform: [
              { perspective: 1200 },
              { translateX },
              { translateY },
              { scaleX },
              { scaleY },
            ],
          },
        ]}
      >
        {!isClosing ? (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: palette.background,
                overflow: "hidden",
              },
            ]}
          >
            <View
              className="h-full w-full"
              style={{
                paddingHorizontal: Math.max(24, width * 0.1),
                paddingTop: Math.max(48, height * 0.12),
                backgroundColor: palette.background,
              }}
            >
              {Array.from({ length: 12 }).map((_, index) => (
                <View
                  key={index}
                  className="mb-3 h-2 rounded-full"
                  style={{
                    width: `${index % 4 === 3 ? 62 : 100}%`,
                    backgroundColor: palette.border,
                    opacity: 0.42,
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}

        <RNAnimated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: coverOpacity,
              backgroundColor: "#4A3728",
              transform: [
                { perspective: 1200 },
                { translateX: -width / 2 },
                { rotateY: coverRotateY },
                { translateX: width / 2 },
              ],
            },
          ]}
        >
          {transition.coverImageUri ? (
            <Image
              source={transition.coverImageUri}
              style={{ width, height }}
              contentFit="fill"
              cachePolicy="memory-disk"
              recyclingKey={`reader-open-${transition.bookId}`}
            />
          ) : (
            <View
              className="h-full w-full items-center justify-center px-8"
              style={{ backgroundColor: "#4A3728" }}
            >
              <Text
                className="text-center text-xl font-semibold"
                style={{ color: palette.textOnPrimary }}
                numberOfLines={4}
              >
                {transition.title}
              </Text>
            </View>
          )}
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: "rgba(0,0,0,0.18)",
                width: Math.max(12, width * 0.08),
              },
            ]}
          />
        </RNAnimated.View>
      </RNAnimated.View>
    </RNAnimated.View>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
