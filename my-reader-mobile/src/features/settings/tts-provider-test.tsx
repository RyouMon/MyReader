import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/src/components"
import { useThemePalette } from "@/src/design/tokens"
import {
  testTtsProvider,
  type UpsertMobileTtsProfileInput,
} from "@/src/services/core/tts"
import { errorMessage } from "@/src/i18n/error-message"
import { Text, View } from "@/tw"

export function TtsProviderTest({
  input,
  disabled = false,
}: {
  input: UpsertMobileTtsProfileInput
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const [state, setState] = useState<"idle" | "testing" | "success">("idle")
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  useEffect(() => {
    setState("idle")
    setError(null)
    return () => {
      request.current?.abort()
      request.current = null
    }
  }, [input])
  const test = async () => {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    setState("testing")
    setError(null)
    try {
      await testTtsProvider(
        input,
        t("settings.tts.previewText"),
        controller.signal,
      )
      if (!controller.signal.aborted) setState("success")
    } catch (error) {
      if (controller.signal.aborted) return
      setState("idle")
      setError(errorMessage(error))
    } finally {
      if (request.current === controller) request.current = null
    }
  }
  return (
    <View className="gap-3">
      <Button
        variant="secondary"
        title={t(
          state === "testing" ? "ttsSettings.testing" : "ttsSettings.test",
        )}
        disabled={disabled || state === "testing"}
        onPress={() => void test()}
      />
      {state === "success" ? (
        <Text accessibilityRole="alert" style={{ color: palette.primary }}>
          {t("ttsSettings.testSucceeded")}
        </Text>
      ) : null}
      {error ? (
        <Text
          selectable
          accessibilityRole="alert"
          style={{ color: palette.danger }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  )
}
