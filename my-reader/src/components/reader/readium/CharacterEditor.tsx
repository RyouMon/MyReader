import { useEffect, useState, type CSSProperties } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { SaveButton } from "@/components/common/SaveButton"
import { FormTextField } from "@/components/common/FormTextField"
import { FormSelect, FormSelectItem } from "@/components/common/FormSelect"
import { Field, FieldGroup, FieldError } from "@/components/ui/field"
import { api } from "@/lib/tauri-api"
import { errorMessage } from "@/lib/error-presentation"
import type { BookCharacterDto, TtsConfigDto } from "@/lib/tauri-specta"

export function CharacterEditor({
  character,
  config,
  themeStyle,
  saving,
  onSave,
  onCancel,
}: {
  character: BookCharacterDto
  config: TtsConfigDto
  themeStyle?: CSSProperties
  saving: boolean
  onSave: (value: BookCharacterDto) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(character)
  const [nicknames, setNicknames] = useState(character.nicknames.join(", "))
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([])
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
  const valid = Boolean(
    draft.name.trim() && (!provider || draft.voice?.voiceId),
  )
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (valid)
          onSave({
            ...draft,
            nicknames: nicknames
              .split(/[,，\n]/u)
              .map((value) => value.trim())
              .filter(Boolean),
          })
      }}
    >
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
            value={
              provider ??
              (draft.voice?.engine === "system" ? "system" : "default")
            }
            onValueChange={(value) =>
              setDraft({
                ...draft,
                voice:
                  value === "default"
                    ? null
                    : value === "system"
                      ? { engine: "system", voiceId: "" }
                      : { engine: "provider", profileId: value, voiceId: "" },
              })
            }
            id="character-provider"
            label={t("narration.provider")}
            className="w-full"
          >
            <FormSelectItem value="default">
              {t("narration.defaultVoice")}
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
            <FormSelect
              themeStyle={themeStyle}
              value={draft.voice.voiceId || "default"}
              onValueChange={(voiceId) =>
                setDraft({
                  ...draft,
                  voice: {
                    ...draft.voice!,
                    voiceId: voiceId === "default" ? "" : voiceId,
                  },
                })
              }
              id="character-voice"
              label={t("narration.voice")}
              className="w-full"
            >
              <FormSelectItem value="default" disabled={Boolean(provider)}>
                {t("narration.defaultVoice")}
              </FormSelectItem>
              {provider
                ? voices.data?.map((voice) => (
                    <FormSelectItem key={voice.id} value={voice.id}>
                      {voice.id}
                    </FormSelectItem>
                  ))
                : systemVoices.map((voice) => (
                    <FormSelectItem key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name}
                    </FormSelectItem>
                  ))}
            </FormSelect>
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
      <div className="flex flex-wrap gap-2">
        <SaveButton disabled={!valid} saving={saving} />
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("llm.cancel")}
        </Button>
      </div>
    </form>
  )
}
