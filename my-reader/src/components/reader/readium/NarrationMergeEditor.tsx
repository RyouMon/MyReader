import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  BookNarrationSettingsDto,
  NarrationMergePlanDto,
} from "@/lib/tauri-specta"

export function NarrationMergeEditor({
  settings,
  plan,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  settings: BookNarrationSettingsDto
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
              <FieldLabel htmlFor={`merge-${index}`}>{name}</FieldLabel>
              {incoming.identity ? (
                <p className="text-sm text-muted-foreground">
                  {incoming.identity}
                </p>
              ) : null}
              {incoming.id !== "narrator" ? (
                <Select
                  value={choice.targetCharacterId ?? "new"}
                  onValueChange={(value) =>
                    update(index, {
                      targetCharacterId: value === "new" ? null : value,
                    })
                  }
                >
                  <SelectTrigger id={`merge-${index}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">
                      {t("narration.newCharacter")}
                    </SelectItem>
                    {settings.characters
                      .filter((character) => character.id !== "narrator")
                      .map((character) => (
                        <SelectItem key={character.id} value={character.id}>
                          {character.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : null}
            </Field>
            {conflict ? (
              <Field>
                <FieldLabel htmlFor={`merge-voice-${index}`}>
                  {t("narration.voiceAndInstructions")}
                </FieldLabel>
                <Select
                  value={choice.preferIncoming ? "incoming" : "existing"}
                  onValueChange={(value) =>
                    update(index, { preferIncoming: value === "incoming" })
                  }
                >
                  <SelectTrigger id={`merge-voice-${index}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="existing">
                      {t("narration.keepExisting")}
                    </SelectItem>
                    <SelectItem value="incoming">
                      {t("narration.useIncoming", { title: source.title })}
                    </SelectItem>
                  </SelectContent>
                </Select>
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
