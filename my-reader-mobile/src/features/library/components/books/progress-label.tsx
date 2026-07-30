import { memo } from "react"
import { useTranslation } from "react-i18next"
import {
  readingProgressDisplay,
  type ReadingProgressDisplayLabels,
} from "@my-reader/tools/reading-progress"
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native"

import { useThemePalette } from "@/src/design/tokens"
import type { BookProgressSnapshot } from "./book-cover"

export type ProgressLabelColors = {
  primary: string
  success: string
  successSoft: string
  surface: string
  textMuted: string
}

export type ProgressLabelLabels = ReadingProgressDisplayLabels

export function getProgressDisplay(
  progress: BookProgressSnapshot | undefined,
  labelsOrT: ProgressLabelLabels | ((key: string) => string),
): ReturnType<typeof readingProgressDisplay> {
  const labels =
    typeof labelsOrT === "function"
      ? {
          finished: labelsOrT("bookRow.finished"),
          unread: labelsOrT("bookRow.unread"),
        }
      : labelsOrT

  return readingProgressDisplay(progress, labels)
}

type ProgressLabelProps = {
  progress?: BookProgressSnapshot
}

type ProgressLabelBaseProps = ProgressLabelProps & {
  colors: ProgressLabelColors
  labels: ProgressLabelLabels
}

function ProgressLabelBaseImpl({
  colors,
  labels,
  progress,
}: ProgressLabelBaseProps) {
  // Grid cells use this Base variant so progress badges do not subscribe to
  // theme/i18n contexts or resolve NativeWind classes during scroll.
  const { text, isUnread, isFinished, isStatusLabel } = getProgressDisplay(
    progress,
    labels,
  )

  if (isStatusLabel) {
    const backgroundColor = isUnread
      ? colors.surface
      : isFinished
        ? colors.successSoft
        : "rgba(217,119,87,0.14)"
    const color = isUnread
      ? colors.textMuted
      : isFinished
        ? colors.success
        : colors.primary
    const badgeStyle: ViewStyle = { backgroundColor }
    const labelStyle: TextStyle = { color }

    return (
      <View style={[styles.badge, badgeStyle]}>
        <Text
          style={[styles.badgeText, labelStyle]}
          maxFontSizeMultiplier={1.3}
        >
          {text}
        </Text>
      </View>
    )
  }

  return (
    <Text style={{ color: colors.textMuted }} maxFontSizeMultiplier={1.3}>
      {text}
    </Text>
  )
}

export const ProgressLabelBase = memo(ProgressLabelBaseImpl)

function ProgressLabelImpl({ progress }: ProgressLabelProps) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  return (
    <ProgressLabelBase
      progress={progress}
      colors={{
        primary: palette.primary,
        success: palette.success,
        successSoft: palette.successSoft,
        surface: palette.surface,
        textMuted: palette.textMuted,
      }}
      labels={{
        finished: t("bookRow.finished"),
        unread: t("bookRow.unread"),
      }}
    />
  )
}

const ProgressLabel = memo(ProgressLabelImpl)

export { ProgressLabel }

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 14,
  },
})
