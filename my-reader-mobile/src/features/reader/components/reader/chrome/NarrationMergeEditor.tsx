import { useTranslation } from "react-i18next"
import { Button } from "@/src/components"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import type {
  BookNarrationSettings,
  NarrationMergePlan,
} from "@/src/services/core/narration"
import { Text, View } from "@/tw"
import { ReaderTtsMenuRow } from "./ReaderTtsSettingsFields"

export function NarrationMergeEditor({
  settings,
  plan,
  onChange,
  onSave,
  onCancel,
  saving,
  palette,
}: {
  settings: BookNarrationSettings
  plan: NarrationMergePlan
  onChange: (value: NarrationMergePlan) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  palette: ReaderChromePalette
}) {
  const { t } = useTranslation()
  const source = settings.mergeSources.find(
    (value) => value.scopeId === plan.sourceScopeId,
  )
  if (!source) return null
  const update = (
    index: number,
    patch: Partial<NarrationMergePlan["choices"][number]>,
  ) =>
    onChange({
      ...plan,
      choices: plan.choices.map((choice, i) =>
        i === index ? { ...choice, ...patch } : choice,
      ),
    })
  return (
    <View className="gap-4">
      <Text style={{ color: palette.textMuted }}>{source.title}</Text>
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
          <View key={choice.characterId} className="gap-2">
            {incoming.id === "narrator" ? (
              <Text style={{ color: palette.text }}>{name}</Text>
            ) : (
              <ReaderTtsMenuRow
                title={name}
                value={target?.name ?? t("narration.newCharacter")}
                actions={[
                  { id: "new", title: t("narration.newCharacter") },
                  ...settings.characters
                    .filter((character) => character.id !== "narrator")
                    .map((character) => ({
                      id: character.id,
                      title: character.name,
                    })),
                ]}
                palette={palette}
                onSelect={(value) =>
                  update(index, {
                    targetCharacterId: value === "new" ? undefined : value,
                  })
                }
              />
            )}
            {incoming.identity ? (
              <Text style={{ color: palette.textMuted }}>
                {incoming.identity}
              </Text>
            ) : null}
            {conflict ? (
              <ReaderTtsMenuRow
                title={t("narration.voiceAndInstructions")}
                value={
                  choice.preferIncoming
                    ? t("narration.useIncoming", { title: source.title })
                    : t("narration.keepExisting")
                }
                actions={[
                  { id: "existing", title: t("narration.keepExisting") },
                  {
                    id: "incoming",
                    title: t("narration.useIncoming", { title: source.title }),
                  },
                ]}
                palette={palette}
                onSelect={(value) =>
                  update(index, { preferIncoming: value === "incoming" })
                }
              />
            ) : null}
          </View>
        )
      })}
      <Button
        title={t("narration.confirmMerge")}
        disabled={saving}
        onPress={onSave}
      />
      <Button title={t("llm.cancel")} variant="secondary" onPress={onCancel} />
    </View>
  )
}
