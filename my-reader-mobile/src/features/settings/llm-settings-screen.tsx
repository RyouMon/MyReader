import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ActivityIndicator, Switch } from "react-native"
import {
  Button,
  FormLabeledFieldRow,
  ListMenuRow,
  ListRow,
  Screen,
  SectionCard,
} from "@/src/components"
import { useThemePalette } from "@/src/design/tokens"
import { useLlmSettings } from "@/src/domain/llm/use-llm-settings"
import type { LlmProfile, LlmProfileInput } from "@/src/services/core/llm"
import { errorMessage } from "@/src/i18n/error-message"
import { Text, TextInput, View } from "@/tw"

const newProfile = (): LlmProfile => ({
  id: "",
  name: "",
  protocol: "chatCompletions",
  endpoint: "https://api.openai.com/v1",
  model: "",
  contextWindow: 32768,
  revision: 0,
  hasCredential: false,
})

export default function LlmSettingsScreen() {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const { query, save, remove, select, models, probe, error } = useLlmSettings()
  const [draft, setDraft] = useState<LlmProfile | null>(null)
  const [credential, setCredential] = useState("")
  const [clearCredential, setClearCredential] = useState(false)
  const [testedInput, setTestedInput] = useState<string | null>(null)
  const inputIdentity = JSON.stringify([draft, credential, clearCredential])
  const [advanced, setAdvanced] = useState(false)
  const edit = (profile: LlmProfile) => {
    setDraft(profile)
    setCredential("")
    setClearCredential(false)
    save.reset()
    remove.reset()
    models.reset()
    probe.reset()
  }
  const input = (): LlmProfileInput => ({
    profile: draft!,
    credential,
    clearCredential,
  })
  const valid = validProfile(draft)
  const busy = save.isPending || remove.isPending
  return (
    <Screen>
      {query.isPending ? <ActivityIndicator color={palette.primary} /> : null}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: palette.error }}>
          {errorMessage(error)}
        </Text>
      ) : null}
      {draft ? (
        <View className="gap-4">
          {(["name", "endpoint"] as const).map((key) => (
            <FormLabeledFieldRow key={key} label={t(`llm.${key}`)}>
              <TextInput
                accessibilityLabel={t(`llm.${key}`)}
                value={draft[key]}
                autoCapitalize="none"
                autoCorrect={false}
                className="flex-1 text-base"
                style={{ color: palette.text }}
                onChangeText={(value) => setDraft({ ...draft, [key]: value })}
              />
            </FormLabeledFieldRow>
          ))}
          <SectionCard>
            <ListMenuRow
              title={t("llm.protocol")}
              value={
                draft.protocol === "responses"
                  ? "Responses"
                  : "Chat Completions"
              }
              actions={[
                { id: "chatCompletions", title: "Chat Completions" },
                { id: "responses", title: "Responses" },
              ]}
              onPressAction={({ nativeEvent }) =>
                setDraft({ ...draft, protocol: nativeEvent.event })
              }
              isLast
            />
          </SectionCard>
          <FormLabeledFieldRow label={t("llm.key")}>
            <TextInput
              accessibilityLabel={t("llm.key")}
              value={credential}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="none"
              placeholder={draft.hasCredential ? t("llm.keySaved") : ""}
              placeholderTextColor={palette.textMuted}
              className="flex-1 text-base"
              style={{ color: palette.text }}
              onChangeText={(value) => {
                setCredential(value)
                setClearCredential(false)
              }}
            />
          </FormLabeledFieldRow>
          {draft.hasCredential ? (
            <FormLabeledFieldRow label={t("llm.clearKey")}>
              <Switch
                accessibilityLabel={t("llm.clearKey")}
                value={clearCredential}
                onValueChange={setClearCredential}
              />
            </FormLabeledFieldRow>
          ) : null}
          <FormLabeledFieldRow label={t("llm.model")}>
            <TextInput
              accessibilityLabel={t("llm.model")}
              value={draft.model}
              autoCapitalize="none"
              autoCorrect={false}
              className="flex-1 text-base"
              style={{ color: palette.text }}
              onChangeText={(model) => setDraft({ ...draft, model })}
            />
          </FormLabeledFieldRow>
          <ModelOptions
            draft={draft}
            setDraft={setDraft}
            models={models}
            input={input}
          />
          <SectionCard>
            <ListRow
              title={t("llm.advanced")}
              onPress={() => setAdvanced((value) => !value)}
              isLast
            />
          </SectionCard>
          {advanced ? (
            <FormLabeledFieldRow label={t("llm.context")}>
              <TextInput
                accessibilityLabel={t("llm.context")}
                keyboardType="number-pad"
                value={String(draft.contextWindow)}
                className="flex-1 text-base"
                style={{ color: palette.text }}
                onChangeText={(value) =>
                  setDraft({ ...draft, contextWindow: Number(value) })
                }
              />
            </FormLabeledFieldRow>
          ) : null}
          <Button
            disabled={!valid || busy}
            onPress={() =>
              save.mutate(input(), { onSuccess: () => setDraft(null) })
            }
          >
            <Text style={{ color: palette.primaryForeground }}>
              {t("llm.save")}
            </Text>
          </Button>
          <Button
            variant="secondary"
            disabled={!valid || probe.isPending}
            onPress={() =>
              probe.mutate(input(), {
                onSuccess: () => setTestedInput(inputIdentity),
              })
            }
          >
            <Text style={{ color: palette.text }}>{t("llm.test")}</Text>
          </Button>
          {probe.isSuccess && testedInput === inputIdentity ? (
            <Text accessibilityRole="text" style={{ color: palette.textMuted }}>
              {t("llm.testPassed")}
            </Text>
          ) : null}
          <Button variant="secondary" onPress={() => setDraft(null)}>
            <Text style={{ color: palette.text }}>{t("llm.cancel")}</Text>
          </Button>
          {draft.id ? (
            <Button
              variant="secondary"
              disabled={busy}
              onPress={() =>
                remove.mutate(draft.id, { onSuccess: () => setDraft(null) })
              }
            >
              <Text style={{ color: palette.error }}>{t("llm.delete")}</Text>
            </Button>
          ) : null}
        </View>
      ) : (
        <LlmProfileList query={query} select={select} edit={edit} />
      )}
    </Screen>
  )
}

function validProfile(
  profile: { name: string; endpoint: string; model: string } | null,
) {
  return Boolean(
    profile?.name.trim() && profile.endpoint.trim() && profile.model.trim(),
  )
}

function LlmProfileList({
  query,
  select,
  edit,
}: {
  query: ReturnType<typeof useLlmSettings>["query"]
  select: ReturnType<typeof useLlmSettings>["select"]
  edit: (profile: LlmProfile) => void
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  return (
    <View className="gap-4">
      <SectionCard>
        <ListMenuRow
          title={t("llm.default")}
          value={
            query.data?.profiles.find(
              (profile) => profile.id === query.data?.defaultProfileId,
            )?.name ?? t("llm.none")
          }
          actions={[
            { id: "none", title: t("llm.none") },
            ...(query.data?.profiles.map((profile) => ({
              id: profile.id,
              title: profile.name,
            })) ?? []),
          ]}
          onPressAction={({ nativeEvent }) =>
            select.mutate(
              nativeEvent.event === "none" ? undefined : nativeEvent.event,
            )
          }
          isLast
        />
      </SectionCard>
      {query.data?.profiles.length ? (
        <SectionCard>
          {query.data.profiles.map((profile, index) => (
            <ListRow
              key={profile.id}
              title={profile.name}
              value={profile.model}
              onPress={() => edit(profile)}
              isLast={index === query.data!.profiles.length - 1}
            />
          ))}
        </SectionCard>
      ) : null}
      <Button onPress={() => edit(newProfile())}>
        <Text style={{ color: palette.primaryForeground }}>{t("llm.add")}</Text>
      </Button>
    </View>
  )
}

function ModelOptions({
  draft,
  setDraft,
  models,
  input,
}: {
  draft: LlmProfile
  setDraft: (value: LlmProfile) => void
  models: ReturnType<typeof useLlmSettings>["models"]
  input: () => LlmProfileInput
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  return (
    <>
      {models.data?.length ? (
        <SectionCard>
          <ListMenuRow
            title={t("llm.models")}
            value={draft.model}
            actions={models.data.map((model) => ({
              id: model,
              title: model,
            }))}
            onPressAction={({ nativeEvent }) =>
              setDraft({ ...draft, model: nativeEvent.event })
            }
            isLast
          />
        </SectionCard>
      ) : (
        <Button
          variant="secondary"
          disabled={!draft.name || !draft.endpoint || models.isPending}
          onPress={() => models.mutate(input())}
        >
          <Text style={{ color: palette.text }}>{t("llm.models")}</Text>
        </Button>
      )}
    </>
  )
}
