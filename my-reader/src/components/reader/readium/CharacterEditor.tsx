import { useQuery } from "@tanstack/react-query"
import { type CSSProperties, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { FormSelect, FormSelectItem } from "@/components/common/FormSelect"
import { FormTextField } from "@/components/common/FormTextField"
import { SaveButton } from "@/components/common/SaveButton"
import { TtsPreviewButton } from "@/components/common/TtsPreviewButton"
import { VoiceSelect } from "@/components/common/VoiceSelect"
import {
  READER_SETTINGS_CONTENT_CLASS,
  ReaderSidePanelFooter,
  ReaderSidePanelScrollArea,
} from "@/components/reader/shared/ReaderSidePanelChrome"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup } from "@/components/ui/field"
import { useTtsPreviewPlayer } from "@/hooks/useTtsPreviewPlayer"
import { errorMessage } from "@/lib/error-presentation"
import { api } from "@/lib/tauri-api"
import type {
  BookCharacterDto,
  TtsConfigDto,
  TtsVoiceRefDto,
} from "@/lib/tauri-specta"

export function CharacterEditor({
  character,
  config,
  readingVoice,
  themeStyle,
  saving,
  error,
  onSave,
  onCancel,
}: {
  character: BookCharacterDto
  config: TtsConfigDto
  readingVoice: TtsVoiceRefDto
  themeStyle?: CSSProperties
  saving: boolean
  error?: string
  onSave: (value: BookCharacterDto) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(character)
  const [nicknames, setNicknames] = useState(character.nicknames.join(", "))
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([])
  const [previewError, setPreviewError] = useState<string | null>(null)
  const effectiveVoice = draft.voice ?? readingVoice
  const { preview, previewing, previewVoiceId, stopPreview } =
    useTtsPreviewPlayer({
      config,
      engineId:
        effectiveVoice.engine === "provider"
          ? effectiveVoice.profileId
          : "system",
      voiceId: effectiveVoice.voiceId,
      instructions: draft.instructions,
      systemVoices,
      onError: setPreviewError,
    })
  const provider =
    draft.voice?.engine === "provider" ? draft.voice.profileId : null
  const voices = useQuery({
    queryKey: ["tts-voices", provider],
    queryFn: () => api.listTtsVoices(provider!),
    enabled: Boolean(provider),
  })
  useEffect(() => {
    const update = () =>
      setSystemVoices(window.speechSynthesis?.getVoices() ?? [])
    update()
    window.speechSynthesis?.addEventListener("voiceschanged", update)
    return () =>
      window.speechSynthesis?.removeEventListener("voiceschanged", update)
  }, [])
  const voiceSelected = !draft.voice || Boolean(draft.voice.voiceId.trim())
  const valid = Boolean(draft.name.trim() && voiceSelected)
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      style={themeStyle}
      onSubmit={(event) => {
        event.preventDefault()
        if (valid) {
          stopPreview()
          onSave({
            ...draft,
            nicknames: nicknames
              .split(/[,，\n]/u)
              .map((value) => value.trim())
              .filter(Boolean),
          })
        }
      }}
    >
      <ReaderSidePanelScrollArea className={READER_SETTINGS_CONTENT_CLASS}>
        <div className="flex flex-col gap-3">
          {error ? <FieldError>{error}</FieldError> : null}
          <FieldGroup>
            {draft.id !== "narrator" ? (
              <>
                <FormTextField
                  id="character-name"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                  required
                  label={t("narration.name")}
                />
                <FormTextField
                  id="character-nicknames"
                  value={nicknames}
                  onChange={(event) => setNicknames(event.target.value)}
                  label={t("narration.nicknames")}
                />
                <FormTextField
                  id="character-description"
                  value={draft.description}
                  onChange={(event) =>
                    setDraft({ ...draft, description: event.target.value })
                  }
                  label={t("narration.description")}
                />
              </>
            ) : null}
            <Field>
              <FormSelect
                themeStyle={themeStyle}
                value={provider ?? (draft.voice ? "system" : "default")}
                onValueChange={(value) =>
                  setDraft({
                    ...draft,
                    voice:
                      value === "default"
                        ? null
                        : value === "system"
                          ? { engine: "system", voiceId: "" }
                          : {
                              engine: "provider",
                              profileId: value,
                              voiceId: "",
                            },
                  })
                }
                id="character-provider"
                label={t("narration.provider")}
                className="w-full"
              >
                <FormSelectItem value="default">
                  {t("narration.defaultModel")}
                </FormSelectItem>
                <FormSelectItem value="system">
                  {t("narration.system")}
                </FormSelectItem>
                {config.profiles.map((profile) => (
                  <FormSelectItem key={profile.id} value={profile.id}>
                    {`${profile.name}/${profile.model}`}
                  </FormSelectItem>
                ))}
              </FormSelect>
            </Field>
            {draft.voice ? (
              <Field>
                <VoiceSelect
                  themeStyle={themeStyle}
                  value={draft.voice.voiceId}
                  required
                  onValueChange={(voiceId) =>
                    setDraft({
                      ...draft,
                      voice: {
                        ...draft.voice!,
                        voiceId,
                      },
                    })
                  }
                  id="character-voice"
                  label={t("narration.voice")}
                  className="w-full"
                  previewVoiceId={previewVoiceId}
                  onPreview={(id) => void preview(id)}
                  onStopPreview={stopPreview}
                  options={
                    provider
                      ? (voices.data ?? []).map((voice) => ({
                          value: voice.id,
                          label: voice.id,
                        }))
                      : systemVoices.map((voice) => ({
                          value: voice.voiceURI,
                          label: voice.name,
                        }))
                  }
                />
              </Field>
            ) : null}
            {voices.error ? (
              <FieldError>{errorMessage(voices.error)}</FieldError>
            ) : null}
            <FormTextField
              id="character-instructions"
              value={draft.instructions}
              disabled={draft.voice?.engine === "system"}
              onChange={(event) =>
                setDraft({ ...draft, instructions: event.target.value })
              }
              label={t("narration.instructions")}
            />
          </FieldGroup>
          {draft.source ? (
            <a
              className="text-xs text-primary underline"
              href={draft.source.url}
              target="_blank"
              rel="noreferrer"
            >
              {draft.source.title}
            </a>
          ) : null}
          {previewError ? <FieldError>{previewError}</FieldError> : null}
        </div>
      </ReaderSidePanelScrollArea>
      <ReaderSidePanelFooter>
        <TtsPreviewButton
          previewing={previewing}
          disabled={
            saving ||
            !voiceSelected ||
            (effectiveVoice.engine === "provider" &&
              !effectiveVoice.voiceId.trim())
          }
          onClick={() => (previewing ? stopPreview() : void preview())}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              stopPreview()
              onCancel()
            }}
          >
            {t("llm.cancel")}
          </Button>
          <SaveButton disabled={!valid} saving={saving} />
        </div>
      </ReaderSidePanelFooter>
    </form>
  )
}
