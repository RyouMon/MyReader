import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Button, IconButton, SectionLabel } from "@/src/components"
import { useThemePalette } from "@/src/design/tokens"
import {
  previewInput,
  usesModelVoices,
  type TtsProviderDraft,
} from "@/src/domain/tts/tts-provider-draft"
import { useTtsVoicePreview } from "@/src/domain/tts/use-tts-voice-preview"
import type { MobileTtsModel } from "@/src/services/core/tts"
import { Text, View } from "@/tw"
import { ProviderTextField } from "./provider-text-field"

export function TtsVoicesEditor({
  draft,
  model,
  readOnly,
  actions,
  onChange,
}: {
  draft: TtsProviderDraft
  model?: MobileTtsModel
  readOnly?: boolean
  actions?: ReactNode
  onChange: (voices: string[]) => void
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const scoped = usesModelVoices(draft)
  const voices = scoped ? (model?.voices ?? []) : draft.voices
  const preview = useTtsVoicePreview(JSON.stringify([draft, model?.id]))
  const rename = (index: number, id: string) => {
    const next = [...voices]
    next[index] = id
    onChange(next)
  }
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-2">
        <SectionLabel>{t("providerEditor.voices")}</SectionLabel>
        <View className="flex-row items-center gap-1">
          {actions}
          {!readOnly ? (
            <Button
              title={t("providerEditor.addVoice")}
              size="sm"
              variant="ghost"
              icon="add"
              onPress={() => onChange([...voices, ""])}
            />
          ) : null}
        </View>
      </View>
      {voices.map((voice, index) => {
        const active = preview.active === index
        const label = voice || String(index + 1)
        return (
          <View key={index} className="flex-row items-center gap-1">
            <View className="min-w-0 flex-1 flex-row gap-2">
              <View className="min-w-0 flex-1">
                <ProviderTextField
                  label={t("providerEditor.voiceId")}
                  testID={`tts-voice-id-${index}`}
                  required
                  value={voice}
                  editable={!readOnly}
                  placeholder={t("providerEditor.voiceId")}
                  onChangeText={(id) => rename(index, id)}
                />
              </View>
            </View>
            <View className="flex-row">
              <IconButton
                label={`${t(active ? "settings.tts.previewPlaying" : "settings.tts.previewAction")} ${label}`}
                disabled={
                  !voice.trim() ||
                  !model?.model.trim() ||
                  !draft.endpoint.trim()
                }
                onPress={() =>
                  active
                    ? preview.stop()
                    : void preview.play(
                        index,
                        previewInput(draft, model, voice),
                        t("settings.tts.previewText"),
                      )
                }
                icon={active ? "stop" : "play-arrow"}
                tone="primary"
                size="sm"
                loading={active && preview.state !== "playing"}
              />
              {!readOnly ? (
                <IconButton
                  label={`${t("providerEditor.removeVoice")} ${label}`}
                  icon="delete-outline"
                  tone="danger"
                  size="sm"
                  onPress={() => onChange(voices.filter((_, i) => i !== index))}
                />
              ) : null}
            </View>
          </View>
        )
      })}
      {preview.error ? (
        <Text
          selectable
          accessibilityRole="alert"
          className="px-4 text-sm"
          style={{ color: palette.danger }}
        >
          {preview.error}
        </Text>
      ) : null}
    </View>
  )
}
