import { useCallback, useEffect, useState } from "react"
import { View as RNView, StyleSheet } from "react-native"
import { GestureDetector } from "react-native-gesture-handler"
import Animated from "react-native-reanimated"

import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import { Text } from "@/tw"
import { ReaderChromeIcon } from "./ReaderChromeIcon"
import {
  clampReaderPositionIndex,
  type ReaderProgressDirection,
  type ReaderProgressPreview,
  readerProgressOffset,
  readerProgressPercentForPosition,
} from "./reader-progress-scrubber"
import {
  READER_EXPANDED_ACTION_ICON_SIZE,
  READER_EXPANDED_ACTION_PADDING_HORIZONTAL,
  READER_EXPANDED_ACTION_PADDING_VERTICAL,
  READER_EXPANDED_ACTION_RADIUS,
  READER_EXPANDED_ACTION_SHEET_SHADOW_COLOR,
  READER_EXPANDED_ACTION_TEXT_GAP,
} from "./readerChromeConstants"
import { useReaderProgressScrubGesture } from "./useReaderProgressScrubGesture"

type DragPreview = ReaderProgressPreview & {
  committed: boolean
  positionIndex: number
}

type Props = {
  accessibilityLabel: string
  actionPillWidth: number
  readingProgression: ReaderProgressDirection
  currentPositionIndex: number
  positionCount: number
  palette: ReaderChromePalette
  onOpenToc: () => void
  onPreviewPosition: (positionIndex: number) => ReaderProgressPreview
  onCommitPosition: (positionIndex: number) => void
}

export function ReaderTocProgressAction({
  accessibilityLabel,
  actionPillWidth,
  readingProgression,
  currentPositionIndex,
  positionCount,
  palette,
  onOpenToc,
  onPreviewPosition,
  onCommitPosition,
}: Props) {
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)

  const showPreview = useCallback(
    (positionIndex: number) => {
      setDragPreview({
        committed: false,
        positionIndex,
        ...onPreviewPosition(positionIndex),
      })
    },
    [onPreviewPosition],
  )

  const commitScrub = useCallback(
    (positionIndex: number) => {
      setDragPreview((current) => {
        if (positionIndex === currentPositionIndex) return null
        if (current?.positionIndex === positionIndex) {
          return { ...current, committed: true }
        }
        return {
          committed: true,
          positionIndex,
          ...onPreviewPosition(positionIndex),
        }
      })
      onCommitPosition(positionIndex)
    },
    [currentPositionIndex, onCommitPosition, onPreviewPosition],
  )

  const cancelScrub = useCallback(() => {
    setDragPreview(null)
  }, [])

  const pendingPositionIndex = dragPreview?.committed
    ? dragPreview.positionIndex
    : null
  const readerReachedCommittedPosition =
    pendingPositionIndex !== null &&
    currentPositionIndex === pendingPositionIndex
  useEffect(() => {
    if (!readerReachedCommittedPosition) return
    const frame = requestAnimationFrame(() => setDragPreview(null))
    return () => cancelAnimationFrame(frame)
  }, [readerReachedCommittedPosition])

  const visibleDragPreview = readerReachedCommittedPosition ? null : dragPreview
  const isDragging = visibleDragPreview?.committed === false
  const isRtl = readingProgression === "rtl"
  const currentProgress = readerProgressPercentForPosition(
    currentPositionIndex,
    positionCount,
  )
  const originalProgressOffset = readerProgressOffset(
    actionPillWidth,
    currentProgress,
    readingProgression,
  )
  const displayProgress = visibleDragPreview
    ? readerProgressPercentForPosition(
        visibleDragPreview.positionIndex,
        positionCount,
      )
    : currentProgress

  const { gesture, pressFeedbackStyle, progressFillStyle } =
    useReaderProgressScrubGesture({
      width: actionPillWidth,
      direction: readingProgression,
      currentPositionIndex,
      positionCount,
      progressPercent: displayProgress,
      onPreviewPosition: showPreview,
      onCommitPosition: commitScrub,
      onCancel: cancelScrub,
      onTap: onOpenToc,
    })

  return (
    <Animated.View style={pressFeedbackStyle}>
      <GestureDetector gesture={gesture}>
        <RNView
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={accessibilityLabel}
          accessibilityValue={{
            min: 1,
            max: Math.max(1, positionCount),
            now: Math.min(
              Math.max(1, currentPositionIndex + 1),
              Math.max(1, positionCount),
            ),
            text: `${currentPositionIndex + 1} / ${positionCount}`,
          }}
          accessibilityActions={[
            { name: "activate" },
            { name: "increment" },
            { name: "decrement" },
          ]}
          onAccessibilityAction={(event) => {
            const { actionName } = event.nativeEvent
            if (actionName === "activate") {
              onOpenToc()
              return
            }
            if (actionName === "increment") {
              onCommitPosition(
                clampReaderPositionIndex(
                  currentPositionIndex + 1,
                  positionCount,
                ),
              )
              return
            }
            if (actionName === "decrement") {
              onCommitPosition(
                clampReaderPositionIndex(
                  currentPositionIndex - 1,
                  positionCount,
                ),
              )
            }
          }}
          style={{ width: actionPillWidth }}
        >
          {visibleDragPreview ? (
            <RNView
              pointerEvents="none"
              style={[
                styles.previewBubble,
                {
                  backgroundColor: palette.sheetSurface,
                  borderColor: palette.border,
                  width: actionPillWidth,
                },
              ]}
            >
              {visibleDragPreview.chapterTitle ? (
                <Text
                  className="text-center text-lg font-semibold"
                  style={{ color: palette.text }}
                  numberOfLines={2}
                >
                  {visibleDragPreview.chapterTitle}
                </Text>
              ) : null}
              <Text
                className="text-center text-lg font-semibold"
                style={{ color: palette.textMuted }}
                numberOfLines={1}
              >
                {visibleDragPreview.positionLabel}
              </Text>
            </RNView>
          ) : null}

          <RNView
            accessibilityElementsHidden
            style={[
              styles.pillButton,
              {
                backgroundColor: palette.actionSurface,
                width: actionPillWidth,
              },
            ]}
          >
            <RNView style={styles.pillFill} pointerEvents="none">
              <Animated.View
                style={[
                  styles.pillFillBar,
                  isRtl ? styles.progressFromRight : styles.progressFromLeft,
                  progressFillStyle,
                  { backgroundColor: palette.progressFill },
                ]}
              />
            </RNView>

            <RNView style={styles.pillInner}>
              <TocPillContent
                label={accessibilityLabel}
                progressPercent={Math.round(displayProgress)}
                color={palette.actionText}
              />
            </RNView>

            <Animated.View
              style={[
                styles.progressTextClip,
                isRtl ? styles.progressFromRight : styles.progressFromLeft,
                progressFillStyle,
              ]}
              pointerEvents="none"
            >
              <RNView
                style={[
                  styles.pillInner,
                  { width: actionPillWidth },
                  isRtl ? styles.progressContentFromRight : null,
                ]}
              >
                <TocPillContent
                  label={accessibilityLabel}
                  progressPercent={Math.round(displayProgress)}
                  color={palette.progressText}
                />
              </RNView>
            </Animated.View>

            {isDragging ? (
              <RNView
                testID="reader-progress-origin-marker"
                pointerEvents="none"
                style={[
                  styles.originMarker,
                  {
                    backgroundColor: palette.accent,
                    left: originalProgressOffset,
                  },
                ]}
              />
            ) : null}
          </RNView>
        </RNView>
      </GestureDetector>
    </Animated.View>
  )
}

function TocPillContent({
  label,
  progressPercent,
  color,
}: {
  label: string
  progressPercent: number
  color: string
}) {
  return (
    <RNView style={styles.pillContent}>
      <RNView style={styles.tocLabelGroup}>
        <Text className="text-lg font-semibold" style={{ color }}>
          {label}
        </Text>
        <Text className="text-lg font-semibold" style={{ color }}>
          {progressPercent}%
        </Text>
      </RNView>
      <ReaderChromeIcon
        name="toc"
        size={READER_EXPANDED_ACTION_ICON_SIZE}
        color={color}
      />
    </RNView>
  )
}

const styles = StyleSheet.create({
  previewBubble: {
    position: "absolute",
    bottom: "100%",
    marginBottom: 10,
    gap: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: READER_EXPANDED_ACTION_RADIUS,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: READER_EXPANDED_ACTION_SHEET_SHADOW_COLOR,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  pillButton: {
    position: "relative",
    overflow: "hidden",
    borderRadius: READER_EXPANDED_ACTION_RADIUS,
  },
  pillInner: {
    paddingHorizontal: READER_EXPANDED_ACTION_PADDING_HORIZONTAL,
    paddingVertical: READER_EXPANDED_ACTION_PADDING_VERTICAL,
  },
  pillFill: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  pillFillBar: {
    position: "absolute",
    top: 0,
    bottom: 0,
    height: "100%",
  },
  progressFromLeft: {
    left: 0,
  },
  progressFromRight: {
    right: 0,
  },
  progressContentFromRight: {
    position: "absolute",
    right: 0,
  },
  originMarker: {
    position: "absolute",
    top: 6,
    bottom: 6,
    width: 2,
    borderRadius: 1,
    opacity: 0.72,
    transform: [{ translateX: -1 }],
  },
  pillContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tocLabelGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: READER_EXPANDED_ACTION_TEXT_GAP,
    flex: 1,
  },
  progressTextClip: {
    position: "absolute",
    top: 0,
    bottom: 0,
    overflow: "hidden",
  },
})
