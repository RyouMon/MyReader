import { useTtsRemoval } from "@/src/domain/tts/use-tts-removal-confirmation"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  Button,
  IconButton,
  FormInputRow,
  SectionLabel,
} from "@/src/components"
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
import type { useFormValidation } from "@/src/components/ui/use-form-validation"

export function TtsVoicesEditor({
  draft,
  model,
  validation,
  actions,
  onChange,
}: {
  draft: TtsProviderDraft
  model?: MobileTtsModel
  validation: ReturnType<typeof useFormValidation>
  actions?: ReactNode
  onChange: (voices: string[]) => void
}) {
  const { t } = useTranslation()
  const confirmRemoval = useTtsRemoval()
  const palette = useThemePalette()
  const scoped = usesModelVoices(draft)
  const voices = scoped ? (model?.voices ?? []) : draft.voices
  const group = scoped ? model?.id : "shared"
  const preview = useTtsVoicePreview(JSON.stringify([draft, model?.id]))
  const rename = (index: number, id: string) => {
    const next = [...voices]
    next[index] = id
    onChange(next)
  }
  const remove = async (index: number) => {
    const next = voices.filter((_, i) => i !== index)
    const provider = scoped
      ? {
          ...draft,
          models: draft.models.map((item) =>
            item.id === model?.id ? { ...item, voices: next } : item,
          ),
        }
      : { ...draft, voices: next }
    if (await confirmRemoval(provider, voices[index])) onChange(next)
  }
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-2">
        <SectionLabel>{t("providerEditor.voices")}</SectionLabel>
        <View className="flex-row items-center gap-1">
          {actions}

          <Button
            title={t("providerEditor.addVoice")}
            size="sm"
            variant="ghost"
            icon={{ ios: "plus", android: "add" }}
            onPress={() => onChange([...voices, ""])}
          />
        </View>
      </View>
      {validation.field(`${group}.voices`).error ? (
        <Text
          accessibilityRole="alert"
          className="px-4 text-sm"
          style={{ color: palette.danger }}
        >
          {validation.field(`${group}.voices`).error}
        </Text>
      ) : null}
      {voices.map((voice, index) => {
        const active = preview.active === index
        const label = voice || String(index + 1)
        return (
          <FormInputRow
            key={index}
            actions={
              <>
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
                  icon={{
                    ios: active ? "stop" : "play",
                    android: active ? "stop" : "play-arrow",
                  }}
                  tone="primary"
                  size="sm"
                  loading={active && preview.state !== "playing"}
                />

                <IconButton
                  label={`${t("providerEditor.removeVoice")} ${label}`}
                  icon={{ ios: "trash", android: "delete-outline" }}
                  tone="danger"
                  size="sm"
                  onPress={() => void remove(index)}
                />
              </>
            }
          >
            <ProviderTextField
              label={t("providerEditor.voiceId")}
              testID={`tts-voice-id-${index}`}
              required
              value={voice}
              {...validation.field(`${group}.voice.${index}`)}
              onChangeText={(id) => rename(index, id)}
            />
          </FormInputRow>
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
