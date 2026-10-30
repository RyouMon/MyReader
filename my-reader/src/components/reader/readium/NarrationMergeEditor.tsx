import { FormSelect, FormSelectItem } from "@/components/common/FormSelect"
import { useTranslation } from "react-i18next"
import type { CSSProperties } from "react"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import type {
  BookNarrationSettingsDto,
  NarrationMergePlanDto,
} from "@/lib/tauri-specta"

export function NarrationMergeEditor({
  settings,
  themeStyle,
  plan,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  settings: BookNarrationSettingsDto
  themeStyle?: CSSProperties
  plan: NarrationMergePlanDto
  onChange: (value: NarrationMergePlanDto) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  const { t } = useTranslation()
  const source = settings.mergeSources.find(
    (value) => value.scopeId === plan.sourceScopeId,
  )
  if (!source) return null
  const update = (
    index: number,
    patch: Partial<NarrationMergePlanDto["choices"][number]>,
  ) =>
    onChange({
      ...plan,
      choices: plan.choices.map((choice, i) =>
        i === index ? { ...choice, ...patch } : choice,
      ),
    })
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{source.title}</p>
      {plan.choices.map((choice, index) => {
        const incoming = source.characters.find(
          (character) => character.id === choice.characterId,
        )
        if (!incoming) return null
        const target = settings.characters.find(
          (character) => character.id === choice.targetCharacterId,
        )
        const name =
          incoming.id === "narrator" ? t("narration.narrator") : incoming.name
        const conflict =
          target &&
          (JSON.stringify(target.voice) !== JSON.stringify(incoming.voice) ||
            target.instructions !== incoming.instructions)
        return (
          <div key={choice.characterId} className="flex flex-col gap-2">
            <Field>
              {incoming.description ? (
                <p className="text-sm text-muted-foreground">
                  {incoming.description}
                </p>
              ) : null}
              {incoming.id !== "narrator" ? (
                <FormSelect
                  themeStyle={themeStyle}
                  value={choice.targetCharacterId ?? "new"}
                  onValueChange={(value) =>
                    update(index, {
                      targetCharacterId: value === "new" ? null : value,
                    })
                  }
                  id={`merge-${index}`}
                  label={name}
                  className="w-full"
                >
                  <FormSelectItem value="new">
                    {t("narration.newCharacter")}
                  </FormSelectItem>
                  {settings.characters
                    .filter((character) => character.id !== "narrator")
                    .map((character) => (
                      <FormSelectItem key={character.id} value={character.id}>
                        {character.name}
                      </FormSelectItem>
                    ))}
                </FormSelect>
              ) : null}
            </Field>
            {conflict ? (
              <Field>
                <FormSelect
                  themeStyle={themeStyle}
                  value={choice.preferIncoming ? "incoming" : "existing"}
                  onValueChange={(value) =>
                    update(index, { preferIncoming: value === "incoming" })
                  }
                  id={`merge-voice-${index}`}
                  label={t("narration.voiceAndInstructions")}
                  className="w-full"
                >
                  <FormSelectItem value="existing">
                    {t("narration.keepExisting")}
                  </FormSelectItem>
                  <FormSelectItem value="incoming">
                    {t("narration.useIncoming", { title: source.title })}
                  </FormSelectItem>
                </FormSelect>
              </Field>
            ) : null}
          </div>
        )
      })}
      <div className="flex gap-2">
        <Button disabled={saving} onClick={onSave}>
          {t("narration.confirmMerge")}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t("llm.cancel")}
        </Button>
      </div>
    </div>
  )
}
