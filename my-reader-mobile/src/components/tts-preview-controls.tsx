import { useTranslation } from "react-i18next"
import {
  Button,
  IconButton,
  type ButtonProps,
} from "@/src/components/ui/button"
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
  return (
    <View className="gap-3">
      <Text className="px-4 text-base" style={{ color: palette.textMuted }}>
        {t("settings.tts.previewText")}
      </Text>
      <TtsPreviewButton
        state={state}
        canPreview={canPreview}
        onStart={onStart}
        onStop={onStop}
        colors={colors}
      />
    </View>
  )
}

export function TtsPreviewButton({
  state,
  canPreview = true,
  onStart,
  onStop,
  colors,
  variant = "primary",
  size = "md",
  iconOnly = false,
}: {
  state: "idle" | "generating" | "loading" | "playing"
  canPreview?: boolean
  onStart: () => void
  onStop: () => void
  colors?: Partial<ThemePalette>
  variant?: ButtonProps["variant"]
  size?: ButtonProps["size"]
  iconOnly?: boolean
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
  if (iconOnly)
    return (
      <IconButton
        label={title}
        icon={{
          ios: state === "idle" ? "play" : "stop",
          android: state === "idle" ? "play-arrow" : "stop",
        }}
        colors={palette}
        tone="primary"
        disabled={state === "idle" && !canPreview}
        onPress={state === "idle" ? onStart : onStop}
      />
    )
  return (
    <Button
      title={title}
      variant={variant}
      size={size}
      icon={{
        ios: state === "idle" ? "play" : "stop",
        android: state === "idle" ? "play-arrow" : "stop",
      }}
      disabled={state === "idle" && !canPreview}
      onPress={state === "idle" ? onStart : onStop}
      colors={
        variant === "primary"
          ? {
              backgroundColor: palette.primary,
              borderColor: palette.primary,
              textColor: palette.primaryForeground,
              underlayColor: palette.secondary,
            }
          : { textColor: palette.primary, underlayColor: palette.secondary }
      }
    />
  )
}
