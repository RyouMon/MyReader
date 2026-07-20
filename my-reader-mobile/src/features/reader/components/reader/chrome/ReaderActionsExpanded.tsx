import { type ReactNode, useEffect } from "react"
import { useTranslation } from "react-i18next"
import {
  Pressable,
  View as RNView,
  StyleSheet,
  useWindowDimensions,
} from "react-native"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"

import {
  type ReaderChromePalette,
  underlayFromSurface,
} from "@/src/design/reader-chrome-palette"
import { Text } from "@/tw"
import { ReaderChromeIcon } from "./ReaderChromeIcon"
import { ReaderTocProgressAction } from "./ReaderTocProgressAction"
import type {
  ReaderProgressDirection,
  ReaderProgressPreview,
} from "./reader-progress-scrubber"
import {
  READER_EXPANDED_ACTION_BOTTOM_OFFSET,
  READER_EXPANDED_ACTION_ICON_SIZE,
  READER_EXPANDED_ACTION_PADDING_HORIZONTAL,
  READER_EXPANDED_ACTION_PADDING_VERTICAL,
  READER_EXPANDED_ACTION_RADIUS,
  READER_EXPANDED_ACTION_RIGHT,
  READER_EXPANDED_ACTION_SAFE_BOTTOM_MIN,
  READER_EXPANDED_ACTION_SHEET_ELEVATION,
  READER_EXPANDED_ACTION_SHEET_SHADOW_COLOR,
  READER_EXPANDED_ACTION_SHEET_SHADOW_OFFSET_X,
  READER_EXPANDED_ACTION_SHEET_SHADOW_OFFSET_Y,
  READER_EXPANDED_ACTION_SHEET_SHADOW_OPACITY,
  READER_EXPANDED_ACTION_SHEET_SHADOW_RADIUS,
  READER_EXPANDED_ACTION_STACK_GAP,
  readerExpandedActionWidth,
} from "./readerChromeConstants"
import { useReaderChromePressFeedback } from "./useReaderChromePressFeedback"

type Props = {
  insetsBottom: number
  visible: boolean
  currentPositionIndex: number
  positionCount: number
  progressPercent: number
  readingProgression: ReaderProgressDirection
  palette: ReaderChromePalette
  showSearchAction: boolean
  showBookmarksAndNotesAction: boolean
  onOpenToc: () => void
  onOpenBookmarksAndNotes: () => void
  onOpenSearch: () => void
  onOpenSettings: () => void
  onPreviewPosition: (positionIndex: number) => ReaderProgressPreview
  onCommitPosition: (positionIndex: number) => void
}

type ExpandedActionButtonProps = {
  accessibilityLabel: string
  actionPillWidth: number
  children: ReactNode
  disabled?: boolean
  palette: ReaderChromePalette
  onPress: () => void
}

function ExpandedActionButton({
  accessibilityLabel,
  actionPillWidth,
  children,
  disabled = false,
  palette,
  onPress,
}: ExpandedActionButtonProps) {
  const { pressFeedbackStyle, handlePressIn, handlePressOut } =
    useReaderChromePressFeedback()

  return (
    <Animated.View style={pressFeedbackStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        android_ripple={{
          color: underlayFromSurface(palette.actionSurface, palette.bg),
        }}
        disabled={disabled}
        style={[
          styles.pillButton,
          {
            backgroundColor: palette.actionSurface,
            width: actionPillWidth,
          },
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {children}
      </Pressable>
    </Animated.View>
  )
}

export default function ReaderActionsExpanded({
  insetsBottom,
  visible,
  currentPositionIndex,
  positionCount,
  progressPercent,
  readingProgression,
  palette,
  showSearchAction,
  showBookmarksAndNotesAction,
  onOpenToc,
  onOpenBookmarksAndNotes,
  onOpenSearch,
  onOpenSettings,
  onPreviewPosition,
  onCommitPosition,
}: Props) {
  const { t } = useTranslation()
  const { width: windowWidth } = useWindowDimensions()
  const translateY = useSharedValue(8)
  const scale = useSharedValue(0.95)
  const opacity = useSharedValue(0)

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 200 })
      translateY.value = withTiming(0, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      })
      scale.value = withTiming(1, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      })
    } else {
      opacity.value = withTiming(0, { duration: 150 })
      translateY.value = withTiming(8, { duration: 150 })
      scale.value = withTiming(0.95, { duration: 150 })
    }
  }, [opacity, scale, translateY, visible])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
    opacity: opacity.value,
  }))
  const actionPillWidth = readerExpandedActionWidth(windowWidth)

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          right: READER_EXPANDED_ACTION_RIGHT,
          bottom:
            Math.max(insetsBottom, READER_EXPANDED_ACTION_SAFE_BOTTOM_MIN) +
            READER_EXPANDED_ACTION_BOTTOM_OFFSET,
        },
        animatedStyle,
      ]}
      pointerEvents={visible ? "auto" : "none"}
    >
      <RNView style={[styles.pillContainer, styles.sheetShadow]}>
        <ReaderTocProgressAction
          accessibilityLabel={t("reader.navigation")}
          actionPillWidth={actionPillWidth}
          currentPositionIndex={currentPositionIndex}
          positionCount={positionCount}
          progressPercent={progressPercent}
          readingProgression={readingProgression}
          palette={palette}
          onOpenToc={onOpenToc}
          onPreviewPosition={onPreviewPosition}
          onCommitPosition={onCommitPosition}
        />

        {showBookmarksAndNotesAction ? (
          <ExpandedActionButton
            accessibilityLabel={t("reader.annotations.title")}
            actionPillWidth={actionPillWidth}
            palette={palette}
            onPress={onOpenBookmarksAndNotes}
          >
            <RNView
              style={[styles.pillInner, styles.pillContent]}
              accessibilityElementsHidden={true}
            >
              <Text
                className="text-lg font-semibold"
                style={{ color: palette.actionText }}
              >
                {t("reader.annotations.title")}
              </Text>
              <ReaderChromeIcon
                name="annotations"
                size={READER_EXPANDED_ACTION_ICON_SIZE}
                color={palette.actionText}
              />
            </RNView>
          </ExpandedActionButton>
        ) : null}

        {showSearchAction ? (
          <ExpandedActionButton
            accessibilityLabel={t("reader.search.title")}
            actionPillWidth={actionPillWidth}
            palette={palette}
            onPress={onOpenSearch}
          >
            <RNView
              style={[styles.pillInner, styles.pillContent]}
              accessibilityElementsHidden={true}
            >
              <Text
                className="text-lg font-semibold"
                style={{ color: palette.actionText }}
              >
                {t("reader.search.title")}
              </Text>
              <ReaderChromeIcon
                name="search"
                size={READER_EXPANDED_ACTION_ICON_SIZE}
                color={palette.actionText}
              />
            </RNView>
          </ExpandedActionButton>
        ) : null}

        <ExpandedActionButton
          accessibilityLabel={t("reader.settings")}
          actionPillWidth={actionPillWidth}
          palette={palette}
          onPress={onOpenSettings}
        >
          <RNView
            style={[styles.pillInner, styles.pillContent]}
            accessibilityElementsHidden={true}
          >
            <Text
              className="text-lg font-semibold"
              style={{ color: palette.actionText }}
            >
              {t("reader.settings")}
            </Text>
            <ReaderChromeIcon
              name="settings"
              size={READER_EXPANDED_ACTION_ICON_SIZE}
              color={palette.actionText}
            />
          </RNView>
        </ExpandedActionButton>
      </RNView>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  pillContainer: {
    flexDirection: "column",
    gap: READER_EXPANDED_ACTION_STACK_GAP,
  },
  sheetShadow: {
    shadowColor: READER_EXPANDED_ACTION_SHEET_SHADOW_COLOR,
    shadowOpacity: READER_EXPANDED_ACTION_SHEET_SHADOW_OPACITY,
    shadowRadius: READER_EXPANDED_ACTION_SHEET_SHADOW_RADIUS,
    shadowOffset: {
      width: READER_EXPANDED_ACTION_SHEET_SHADOW_OFFSET_X,
      height: READER_EXPANDED_ACTION_SHEET_SHADOW_OFFSET_Y,
    },
    elevation: READER_EXPANDED_ACTION_SHEET_ELEVATION,
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
  pillContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
})
