import { useTranslation } from "react-i18next"
import { Button } from "@/src/components"
import { useThemePalette, type ThemePalette } from "@/src/design/tokens"
import { Text, View } from "@/tw"

export function TtsPreviewControls({
  state,
  canPreview = true,
  onStart,
  onStop,
  colors,
}: {
  state: "idle" | "generating" | "loading" | "playing"
  canPreview?: boolean
  onStart: () => void
  onStop: () => void
  colors?: Partial<ThemePalette>
}) {
  const { t } = useTranslation()
  const palette = { ...useThemePalette(), ...colors }
  const title = t(
    state === "generating" || state === "loading"
      ? "settings.tts.previewGenerating"
      : state === "playing"
        ? "settings.tts.previewPlaying"
        : "settings.tts.previewAction",
  )
  return (
    <View className="gap-3">
      <Text className="px-4 text-base" style={{ color: palette.textMuted }}>
        {t("settings.tts.previewText")}
      </Text>
      <Button
        title={title}
        icon={{
          ios: state === "idle" ? "play" : "stop",
          android: state === "idle" ? "play-arrow" : "stop",
        }}
        disabled={state === "idle" && !canPreview}
        onPress={state === "idle" ? onStart : onStop}
        colors={{
          backgroundColor: palette.primary,
          borderColor: palette.primary,
          textColor: palette.primaryForeground,
          underlayColor: palette.secondary,
        }}
      />
    </View>
  )
}
