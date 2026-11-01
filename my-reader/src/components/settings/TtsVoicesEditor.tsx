import { useTtsRemoval } from "@/hooks/useTtsRemovalConfirmation"
import { Loader2, Play, Plus, Square, Trash2 } from "lucide-react"
import type { ReactNode } from "react"
import { FormTextField } from "@/components/common/FormTextField"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { useTtsProviderTest } from "@/hooks/useTtsProviderTest"
import {
  modelVoices,
  ttsDraftInput,
  type TtsProviderDraft,
} from "@/lib/tts-provider-draft"
import type { TtsModelDto, UpsertTtsProviderInput } from "@/lib/tauri-specta"

export function TtsVoicesEditor({
  draft,
  model,
  disabled,
  actions,
  fieldErrors,
  onChange,
}: {
  draft: TtsProviderDraft
  model?: TtsModelDto
  disabled?: boolean
  actions?: ReactNode
  fieldErrors?: Record<string, string>
  onChange: (voices: string[]) => void
}) {
  const { t } = useTranslation()
  const confirmRemoval = useTtsRemoval()
  const scoped = modelVoices(draft)
  const voices = scoped ? (model?.voices ?? []) : draft.voices
  const updateId = (index: number, id: string) => {
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
  const prefix = scoped ? model?.id || "shared" : "shared"
  return (
    <section
      className="flex flex-col gap-3"
      aria-label={t("providerEditor.voices")}
    >
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-medium">{t("providerEditor.voices")}</h4>
        <div className="flex items-center gap-2">
          {actions}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onChange([...voices, ""])}
          >
            <Plus data-icon="inline-start" />
            {t("providerEditor.addVoice")}
          </Button>
        </div>
      </div>
      <FieldGroup className="gap-4">
        {voices.map((voice, index) => (
          <VoiceRow
            key={`${prefix}-${index}`}
            prefix={`${prefix}-${index}`}
            index={index}
            voice={voice}
            disabled={disabled}
            fieldError={fieldErrors?.[`${prefix}-${index}-voice-id`]}
            input={ttsDraftInput(draft, model, voice)}
            canPlay={Boolean(voice.trim() && model?.model.trim())}
            onIdChange={(id) => updateId(index, id)}
            onRemove={() => void remove(index)}
          />
        ))}
      </FieldGroup>
    </section>
  )
}

function VoiceRow({
  prefix,
  index,
  voice,
  disabled,
  fieldError,
  input,
  canPlay,
  onIdChange,
  onRemove,
}: {
  prefix: string
  index: number
  voice: string
  disabled?: boolean
  fieldError?: string
  input: UpsertTtsProviderInput
  canPlay: boolean
  onIdChange: (id: string) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const { state, error, test, stop } = useTtsProviderTest(input)
  const active = state === "testing" || state === "playing"
  const label = voice || index + 1
  const playLabel = `${t(active ? "settings.speech.stopPreview" : "ttsSettings.test")} ${label}`
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <FormTextField
          id={`${prefix}-voice-id`}
          label={t("providerEditor.voiceId")}
          value={voice}
          required
          fullWidth
          disabled={disabled}
          error={Boolean(fieldError || error)}
          helperText={fieldError || error}
          onChange={(event) => onIdChange(event.target.value)}
        />
        <div className="flex w-20 shrink-0 items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled || !canPlay}
            aria-label={playLabel}
            title={playLabel}
            onClick={() =>
              active ? stop() : void test(t("settings.speech.previewText"))
            }
          >
            {state === "testing" ? (
              <Loader2 className="animate-spin" />
            ) : state === "playing" ? (
              <Square />
            ) : (
              <Play />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={`${t("providerEditor.removeVoice")} ${label}`}
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </div>
  )
}
