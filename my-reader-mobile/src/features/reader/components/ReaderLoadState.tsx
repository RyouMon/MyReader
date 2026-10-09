import { memo } from "react"
import { ActivityIndicator, StatusBar, type StatusBarStyle } from "react-native"
import { useTranslation } from "react-i18next"
import { useTheme } from "@/src/design/tokens"
import { READER_CHROME } from "@/src/design/reader-tokens"
import type { useBookLoader } from "@/src/hooks/use-book-loader"
import { Pressable, Text, View } from "@/tw"

const ERROR_BACK_BUTTON_BORDER_COLOR = READER_CHROME.border

export function ReaderLoadState({
  loadState,
  resolveReadingPositionConflict,
  statusBarStyle,
  themeBgColor,
  themeFgColor,
  handleBack,
}: Pick<
  ReturnType<typeof useBookLoader>,
  "loadState" | "resolveReadingPositionConflict"
> & {
  statusBarStyle: StatusBarStyle
  themeBgColor: string
  themeFgColor: string
  handleBack: () => void
}) {
  const { t, i18n } = useTranslation()
  const { palette, colorScheme } = useTheme()
  if (loadState.status === "position-conflict") {
    return (
      <View
        className="flex-1 justify-center px-5"
        style={{ backgroundColor: palette.background }}
      >
        <StatusBar hidden={false} barStyle={statusBarStyle} />
        <View
          className="rounded-2xl border p-5"
          style={{
            backgroundColor: palette.surface,
            borderColor: palette.border,
          }}
        >
          <Text
            className="text-lg font-semibold"
            style={{ color: palette.text }}
          >
            {t("reader.positionConflictTitle")}
          </Text>
          <Text className="mt-2 text-sm" style={{ color: palette.textMuted }}>
            {t("reader.positionConflictDescription")}
          </Text>
          <View className="mt-4 gap-2">
            {loadState.candidates.map((candidate) => {
              const progression = candidate.displayProgression
              return (
                <Pressable
                  key={candidate.operationId}
                  accessibilityRole="button"
                  className="rounded-xl border px-4 py-3"
                  style={{ borderColor: palette.border }}
                  onPress={() => {
                    void resolveReadingPositionConflict(candidate.operationId)
                  }}
                >
                  <Text
                    className="text-base font-medium"
                    style={{ color: palette.text }}
                  >
                    {progression === null
                      ? t("reader.positionConflictUnknownProgress")
                      : `${Math.round(progression * 100)}%`}
                  </Text>
                  <Text
                    className="mt-1 text-sm"
                    style={{ color: palette.textMuted }}
                  >
                    {new Date(candidate.recordedAt).toLocaleString(
                      i18n.resolvedLanguage ?? i18n.language,
                    )}
                    {" · "}
                    {candidate.replicaId.slice(0, 8)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            className="mt-3 items-center py-3"
            onPress={() => {
              void resolveReadingPositionConflict(null)
            }}
          >
            <Text
              className="text-sm font-medium"
              style={{ color: palette.textMuted }}
            >
              {t("reader.positionConflictLater")}
            </Text>
          </Pressable>
        </View>
      </View>
    )
  }
  if (loadState.status === "error") {
    return (
      <View
        className="flex-1 w-full items-center justify-center px-7"
        style={{ backgroundColor: palette.background }}
      >
        <StatusBar
          hidden={false}
          barStyle={colorScheme === "dark" ? "light-content" : "dark-content"}
        />
        <View
          className="w-full max-w-[400px] items-center py-7 px-[22px] rounded-2xl border"
          style={{
            backgroundColor: READER_CHROME.errorCardBg,
            borderColor: READER_CHROME.errorCardBorder,
          }}
        >
          <Text
            className="text-center text-lg font-bold mb-3"
            style={{ color: READER_CHROME.textStrong }}
          >
            {t("reader.cannotOpen")}
          </Text>
          <Text
            className="text-center text-base"
            style={{ color: READER_CHROME.textSecondary }}
          >
            {loadState.message}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("reader.back")}
            className="mt-[22px] py-3 px-7 rounded-full border"
            style={{
              backgroundColor: READER_CHROME.surfaceIdle,
              borderColor: ERROR_BACK_BUTTON_BORDER_COLOR,
            }}
            onPress={handleBack}
          >
            <Text
              className="text-base font-semibold"
              style={{ color: READER_CHROME.textStrong }}
            >
              {t("reader.back")}
            </Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <View className="flex-1" style={{ backgroundColor: themeBgColor }}>
      <StatusBar hidden={false} barStyle={statusBarStyle} />
      <ReaderLoadingSurface
        backgroundColor={themeBgColor}
        foregroundColor={themeFgColor}
      />
    </View>
  )
}

export const DomReaderFallback = memo(function DomReaderFallback({
  backgroundColor,
  foregroundColor,
}: {
  backgroundColor: string
  foregroundColor: string
}) {
  return (
    <ReaderLoadingSurface
      backgroundColor={backgroundColor}
      foregroundColor={foregroundColor}
    />
  )
})

export const ReaderLoadingSurface = memo(function ReaderLoadingSurface({
  backgroundColor,
  foregroundColor,
}: {
  backgroundColor: string
  foregroundColor: string
}) {
  const mutedColor = alphaColor(foregroundColor, 0.34)

  return (
    <View className="flex-1" style={{ backgroundColor }}>
      <View className="absolute inset-0 items-center justify-center px-10">
        <ActivityIndicator size="small" color={mutedColor} />
      </View>
    </View>
  )
})

function alphaColor(hex: string, alpha: number) {
  const value = hex.replace("#", "")
  if (value.length !== 6) return `rgba(244,238,230,${alpha})`
  const rgb = Number.parseInt(value, 16)
  if (!Number.isFinite(rgb)) return `rgba(244,238,230,${alpha})`
  return `rgba(${(rgb >> 16) & 255},${(rgb >> 8) & 255},${rgb & 255},${alpha})`
}
