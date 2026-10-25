import { Loader2, Play, Plus, Square, Trash2 } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { GroupList, GroupListItem } from "@/components/common/GroupList"
import { StatusNotice } from "@/components/common/StatusNotice"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
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
  readOnly,
  disabled,
  embedded,
  actions,
  onChange,
}: {
  draft: TtsProviderDraft
  model?: TtsModelDto
  readOnly?: boolean
  disabled?: boolean
  embedded?: boolean
  actions?: ReactNode
  onChange: (voices: string[], names: Record<string, string>) => void
}) {
  const { t } = useTranslation()
  const scoped = modelVoices(draft)
  const voices = scoped ? (model?.voices ?? []) : draft.voices
  const names = (scoped ? model?.voiceNames : draft.voiceNames) ?? {}
  const updateId = (index: number, id: string) => {
    const next = [...voices]
    next[index] = id
    const nextNames = { ...names, [id]: names[voices[index]] ?? "" }
    if (!next.includes(voices[index])) delete nextNames[voices[index]]
    onChange(next, nextNames)
  }
  const prefix = model?.id || "shared"
  return (
    <section
      className={
        embedded
          ? "flex flex-col gap-3 border-l border-transparent pl-3"
          : "flex flex-col gap-3"
      }
      aria-label={t("providerEditor.voices")}
    >
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-medium">{t("providerEditor.voices")}</h4>
        {actions}
      </div>
      <GroupList
        className={
          embedded
            ? "overflow-visible rounded-none border-0 bg-transparent"
            : undefined
        }
      >
        {voices.map((voice, index) => (
          <GroupListItem
            key={`${prefix}-${index}`}
            className={embedded ? "border-b-0 px-0 first:pt-0" : "border-b-0"}
          >
            <VoiceRow
              prefix={`${prefix}-${index}`}
              index={index}
              voice={voice}
              name={names[voice] ?? ""}
              readOnly={readOnly}
              disabled={disabled}
              input={ttsDraftInput(draft, model, voice)}
              canPlay={Boolean(voice.trim() && model?.model.trim())}
              onIdChange={(id) => updateId(index, id)}
              onNameChange={(name) =>
                onChange(voices, { ...names, [voice]: name })
              }
              onRemove={() => {
                const nextNames = { ...names }
                delete nextNames[voice]
                onChange(
                  voices.filter((_, i) => i !== index),
                  nextNames,
                )
              }}
            />
          </GroupListItem>
        ))}
        {!readOnly ? (
          <GroupListItem
            className={
              embedded ? "flex justify-end px-0 pb-0" : "flex justify-end"
            }
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => onChange([...voices, ""], names)}
            >
              <Plus data-icon="inline-start" />
              {t("providerEditor.addVoice")}
            </Button>
          </GroupListItem>
        ) : null}
      </GroupList>
    </section>
  )
}

function VoiceRow({
  prefix,
  index,
  voice,
  name,
  readOnly,
  disabled,
  input,
  canPlay,
  onIdChange,
  onNameChange,
  onRemove,
}: {
  prefix: string
  index: number
  voice: string
  name: string
  readOnly?: boolean
  disabled?: boolean
  input: UpsertTtsProviderInput
  canPlay: boolean
  onIdChange: (id: string) => void
  onNameChange: (name: string) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const { state, error, test, stop } = useTtsProviderTest(input)
  const active = state === "testing" || state === "playing"
  const label = name || voice || index + 1
  const playLabel = `${t(active ? "settings.speech.stopPreview" : "ttsSettings.test")} ${label}`
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <FieldGroup className="grid min-w-0 flex-1 grid-cols-2 gap-3">
          <Field>
            <FieldLabel
              className={index ? "sr-only" : "border-l border-transparent pl-3"}
              htmlFor={`${prefix}-voice-id`}
            >
              {t("providerEditor.voiceId")}
            </FieldLabel>
            <Input
              id={`${prefix}-voice-id`}
              value={voice}
              readOnly={readOnly}
              disabled={disabled}
              placeholder={t("providerEditor.voiceId")}
              onChange={(event) => onIdChange(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel
              className={index ? "sr-only" : "border-l border-transparent pl-3"}
              htmlFor={`${prefix}-voice-name`}
            >
              {t("providerEditor.displayName")}
            </FieldLabel>
            <Input
              id={`${prefix}-voice-name`}
              value={name}
              readOnly={readOnly}
              disabled={disabled}
              placeholder={voice || t("providerEditor.displayName")}
              onChange={(event) => onNameChange(event.target.value)}
            />
          </Field>
        </FieldGroup>
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
          {!readOnly ? (
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
          ) : null}
        </div>
      </div>
      {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
    </div>
  )
}
