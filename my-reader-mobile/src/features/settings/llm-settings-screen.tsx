import { ProviderModels } from "./provider-models"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ActivityIndicator } from "react-native"
import {
  Button,
  FormLabeledFieldRow,
  FormFieldSwitch,
  ListMenuRow,
  ListRow,
  Screen,
  SectionCard,
} from "@/src/components"
import { useThemePalette } from "@/src/design/tokens"
import { useLlmSettings } from "@/src/domain/llm/use-llm-settings"
import type {
  LlmProviderSettings,
  LlmProfileInput,
} from "@/src/services/core/llm"
import { errorMessage } from "@/src/i18n/error-message"
import { Text, TextInput, View } from "@/tw"

const protocolActions = [
  { id: "chatCompletions", title: "Chat Completions" },
  { id: "responses", title: "Responses" },
]

const newProfile = (): LlmProviderSettings => ({
  id: "",
  name: "",
  protocol: "chatCompletions",
  endpoint: "https://api.openai.com/v1",
  models: [{ id: "", model: "", contextWindow: 32768 }],
  hasCredential: false,
})

export default function LlmSettingsScreen() {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const { query, save, remove, select, models, probe, error } = useLlmSettings()
  const [draft, setDraft] = useState<LlmProviderSettings | null>(null)
  const [selected, setSelected] = useState(0)
  const model = draft?.models[selected]
  const setModel = (patch: Partial<LlmProviderSettings["models"][number]>) =>
    setDraft((current) => updateModel(current, selected, patch))
  const [credential, setCredential] = useState("")
  const [clearCredential, setClearCredential] = useState(false)
  const [testedInput, setTestedInput] = useState<string | null>(null)
  const inputIdentity = JSON.stringify([draft, credential, clearCredential])
  const [advanced, setAdvanced] = useState(false)
  const edit = (profile: LlmProviderSettings) => {
    setDraft(profile)
    setSelected(0)
    setCredential("")
    setClearCredential(false)
    save.reset()
    remove.reset()
    models.reset()
    probe.reset()
  }
  const input = currentProfileInput(draft, model, credential, clearCredential)
  const valid = validProfile(draft)
  const busy = save.isPending || remove.isPending
  return (
    <Screen>
      {query.isPending ? <ActivityIndicator color={palette.primary} /> : null}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: palette.danger }}>
          {errorMessage(error)}
        </Text>
      ) : null}
      {draft && model && input ? (
        <View className="gap-3">
          <SectionCard>
            <ListMenuRow
              title={t("llm.protocol")}
              value={
                protocolActions.find((action) => action.id === draft.protocol)
                  ?.title
              }
              actions={protocolActions}
              onPressAction={({ nativeEvent }) =>
                setDraft({ ...draft, protocol: nativeEvent.event })
              }
              isLast
            />
          </SectionCard>
          <SectionCard>
            <View className="gap-2 p-3">
              {(["name", "endpoint"] as const).map((key) => (
                <FormLabeledFieldRow key={key} label={t(`llm.${key}`)} required>
                  <TextInput
                    accessibilityLabel={t(`llm.${key}`)}
                    value={draft[key]}
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="min-h-10 border-0 bg-transparent py-1 text-base"
                    style={{ color: palette.text }}
                    onChangeText={(value) =>
                      setDraft({ ...draft, [key]: value })
                    }
                  />
                </FormLabeledFieldRow>
              ))}

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
                  className="min-h-10 border-0 bg-transparent py-1 text-base"
                  style={{ color: palette.text }}
                  onChangeText={(value) => {
                    setCredential(value)
                    setClearCredential(false)
                  }}
                />
              </FormLabeledFieldRow>
              {draft.hasCredential ? (
                <FormLabeledFieldRow label={t("llm.clearKey")}>
                  <FormFieldSwitch
                    accessibilityLabel={t("llm.clearKey")}
                    value={clearCredential}
                    onValueChange={setClearCredential}
                  />
                </FormLabeledFieldRow>
              ) : null}
            </View>
          </SectionCard>
          <ProviderModels
            models={draft.models}
            selected={selected}
            onSelect={setSelected}
            onAdd={() => {
              setDraft({
                ...draft,
                models: [
                  ...draft.models,
                  { id: "", model: "", contextWindow: 32768 },
                ],
              })
              setSelected(draft.models.length)
            }}
            onRemove={(index) => {
              setDraft({
                ...draft,
                models: draft.models.filter((_, i) => i !== index),
              })
              setSelected(0)
            }}
          />
          <SectionCard>
            <View className="gap-2 p-3">
              <FormLabeledFieldRow label={t("llm.model")} required>
                <TextInput
                  accessibilityLabel={t("llm.model")}
                  value={model.model}
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="min-h-10 border-0 bg-transparent py-1 text-base"
                  style={{ color: palette.text }}
                  onChangeText={(model) => setModel({ model })}
                />
              </FormLabeledFieldRow>
            </View>
          </SectionCard>
          <ModelOptions
            model={model.model}
            setModel={(model) => setModel({ model })}
            models={models}
            input={input}
          />
          <SectionCard>
            <ListRow
              title={t("llm.advanced")}
              onPress={() => setAdvanced((value) => !value)}
              isLast={!advanced}
            />
            {advanced ? (
              <View className="p-3">
                <FormLabeledFieldRow label={t("llm.context")}>
                  <TextInput
                    accessibilityLabel={t("llm.context")}
                    keyboardType="number-pad"
                    value={String(model.contextWindow)}
                    className="min-h-10 border-0 bg-transparent py-1 text-base"
                    style={{ color: palette.text }}
                    onChangeText={(value) =>
                      setModel({ contextWindow: Number(value) })
                    }
                  />
                </FormLabeledFieldRow>
              </View>
            ) : null}
          </SectionCard>
          <Button
            title={t("llm.save")}
            disabled={!valid || busy}
            onPress={() =>
              save.mutate(
                { provider: draft, credential, clearCredential },
                { onSuccess: () => setDraft(null) },
              )
            }
          />
          <Button
            title={t("llm.test")}
            variant="secondary"
            disabled={!valid || probe.isPending}
            onPress={() =>
              probe.mutate(input, {
                onSuccess: () => setTestedInput(inputIdentity),
              })
            }
          />
          {probe.isSuccess && testedInput === inputIdentity ? (
            <Text accessibilityRole="text" style={{ color: palette.textMuted }}>
              {t("llm.testPassed")}
            </Text>
          ) : null}
          <Button
            variant="secondary"
            title={t("llm.cancel")}
            onPress={() => setDraft(null)}
          />
          {draft.id ? (
            <Button
              title={t("llm.delete")}
              variant="danger"
              disabled={busy}
              onPress={() =>
                remove.mutate(draft.id, { onSuccess: () => setDraft(null) })
              }
            />
          ) : null}
        </View>
      ) : (
        <LlmProviderSettingsList query={query} select={select} edit={edit} />
      )}
    </Screen>
  )
}

function validProfile(profile: LlmProviderSettings | null) {
  return Boolean(
    profile?.name.trim() &&
      profile.endpoint.trim() &&
      profile.models.every((model) => model.model.trim()) &&
      new Set(profile.models.map((model) => model.model.trim())).size ===
        profile.models.length,
  )
}

function LlmProviderSettingsList({
  query,
  select,
  edit,
}: {
  query: ReturnType<typeof useLlmSettings>["query"]
  select: ReturnType<typeof useLlmSettings>["select"]
  edit: (profile: LlmProviderSettings) => void
}) {
  const { t } = useTranslation()
  const selected = query.data?.profiles.find(
    (profile) => profile.id === query.data?.defaultProfileId,
  )
  return (
    <View className="gap-3">
      <SectionCard>
        <ListMenuRow
          title={t("llm.default")}
          value={
            selected ? `${selected.name}/${selected.model}` : t("llm.none")
          }
          actions={[
            { id: "none", title: t("llm.none") },
            ...(query.data?.profiles.map((profile) => ({
              id: profile.id,
              title: `${profile.name}/${profile.model}`,
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
      {query.data?.providers.length ? (
        <SectionCard>
          {query.data.providers.map((profile, index) => (
            <ListRow
              key={profile.id}
              title={profile.name}
              detail={profile.models.map((model) => model.model).join(" · ")}
              onPress={() => edit(profile)}
              isLast={index === query.data!.providers.length - 1}
            />
          ))}
        </SectionCard>
      ) : null}
      <Button title={t("llm.add")} onPress={() => edit(newProfile())} />
    </View>
  )
}

function ModelOptions({
  model,
  setModel,
  models,
  input,
}: {
  model: string
  setModel: (value: string) => void
  models: ReturnType<typeof useLlmSettings>["models"]
  input: LlmProfileInput
}) {
  const { t } = useTranslation()
  return (
    <>
      {models.data?.length ? (
        <SectionCard>
          <ListMenuRow
            title={t("llm.models")}
            value={model}
            actions={models.data.map((model) => ({
              id: model,
              title: `${input.profile.name}/${model}`,
            }))}
            onPressAction={({ nativeEvent }) => setModel(nativeEvent.event)}
            isLast
          />
        </SectionCard>
      ) : (
        <Button
          title={t("llm.models")}
          variant="secondary"
          disabled={
            !input.profile.name || !input.profile.endpoint || models.isPending
          }
          onPress={() => models.mutate(input)}
        />
      )}
    </>
  )
}

function updateModel(
  provider: LlmProviderSettings | null,
  selected: number,
  patch: Partial<LlmProviderSettings["models"][number]>,
) {
  if (!provider) return null
  return {
    ...provider,
    models: provider.models.map((model, index) =>
      index === selected ? { ...model, ...patch } : model,
    ),
  }
}

function currentProfileInput(
  draft: LlmProviderSettings | null,
  model: LlmProviderSettings["models"][number] | undefined,
  credential: string,
  clearCredential: boolean,
): LlmProfileInput | null {
  if (!draft || !model) return null
  return {
    profile: {
      ...draft,
      model: model.model,
      contextWindow: model.contextWindow,
      revision: 0,
    },
    credential,
    clearCredential,
  }
}
