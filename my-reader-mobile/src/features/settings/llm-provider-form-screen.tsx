import { ProviderModels } from "./provider-models"
import { useEffect, useRef, useState } from "react"
import { router, Stack, useLocalSearchParams } from "expo-router"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"
import { randomUUID } from "expo-crypto"
import { ModelDiscovery } from "./model-discovery"
import { ProviderTextField } from "./provider-text-field"
import { useTranslation } from "react-i18next"
import { ActivityIndicator } from "react-native"
import {
  Button,
  FormLabeledFieldRow,
  FormFieldSwitch,
  ListMenuRow,
  Screen,
} from "@/src/components"
import { useThemePalette } from "@/src/design/tokens"
import { useLlmSettings } from "@/src/domain/llm/use-llm-settings"
import type {
  LlmProviderSettings,
  LlmProfileInput,
} from "@/src/services/core/llm"
import { errorMessage } from "@/src/i18n/error-message"
import { Text, View } from "@/tw"

const protocolActions = [
  { id: "chatCompletions", title: "Chat Completions" },
  { id: "responses", title: "Responses" },
]

const newModel = (model = "") => ({
  id: randomUUID(),
  model,

  contextWindow: 32768,
  maxOutputTokens: undefined as number | undefined,
})

const newProfile = (): LlmProviderSettings => ({
  id: "",
  name: "",
  protocol: "chatCompletions",
  endpoint: "https://api.openai.com/v1",
  models: [newModel()],
  hasCredential: false,
})

export default function LlmProviderFormScreen() {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const { providerId } = useLocalSearchParams<{ providerId?: string }>()
  const { query, save, remove, models, probe, error } = useLlmSettings()
  const [draft, setDraft] = useState<LlmProviderSettings | null>(() =>
    providerId ? null : newProfile(),
  )
  const [credential, setCredential] = useState("")
  const [clearCredential, setClearCredential] = useState(false)
  const [testedInput, setTestedInput] = useState<string | null>(null)
  const inputIdentity = JSON.stringify([draft, credential, clearCredential])
  const provider = query.data?.providers.find((item) => item.id === providerId)
  useEffect(() => {
    if (provider) setDraft((current) => current ?? provider)
  }, [provider])
  const missing = providerId && query.isSuccess && !provider
  const { options, toolbar } = useScreenHeader({
    title: t(providerId ? "llm.edit" : "llm.add"),
    backTitle: t("back"),
  })
  const input = currentProfileInput(
    draft,
    draft?.models[0],
    credential,
    clearCredential,
  )
  const valid = validProfile(draft)
  const busy = save.isPending || remove.isPending
  return (
    <>
      <Stack.Screen options={options} />
      {toolbar}
      <Screen>
        {providerId && query.isPending ? (
          <ActivityIndicator color={palette.primary} />
        ) : null}
        {error || missing ? (
          <Text
            selectable
            accessibilityRole="alert"
            className="px-4 text-sm"
            style={{ color: palette.danger }}
          >
            {errorMessage(error ?? new Error("LLM_PROFILE_NOT_FOUND"))}
          </Text>
        ) : null}
        {draft && input ? (
          <View className="gap-3">
            <View className="overflow-hidden rounded-3xl">
              <ListMenuRow
                title={t("llm.protocol")}
                value={
                  protocolActions.find((action) => action.id === draft.protocol)
                    ?.title
                }
                actions={protocolActions.map((action) => ({
                  ...action,
                  state: action.id === draft.protocol ? "on" : "off",
                }))}
                onPressAction={({ nativeEvent }) =>
                  setDraft({ ...draft, protocol: nativeEvent.event })
                }
                isLast
              />
            </View>
            <View className="gap-3">
              {(["name", "endpoint"] as const).map((key) => (
                <ProviderTextField
                  key={key}
                  testID={`llm-provider-${key}`}
                  label={t(`llm.${key}`)}
                  required
                  value={draft[key]}
                  onChangeText={(value) => setDraft({ ...draft, [key]: value })}
                />
              ))}

              <ProviderTextField
                label={t("llm.key")}
                value={credential}
                secureTextEntry
                textContentType="none"
                placeholder={draft.hasCredential ? t("llm.keySaved") : ""}
                onChangeText={(value) => {
                  setCredential(value)
                  setClearCredential(false)
                }}
              />
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
            <LlmModelList
              draft={draft}
              onChange={setDraft}
              models={models}
              input={input}
            />
            <Button
              title={t("llm.save")}
              disabled={!valid || busy}
              onPress={() =>
                save.mutate(
                  { provider: draft, credential, clearCredential },
                  { onSuccess: () => router.dismissTo("/llm-providers") },
                )
              }
            />
            <View className="flex-row gap-3">
              <Button
                title={t("llm.test")}
                variant="secondary"
                className="flex-1"
                icon="network-check"
                disabled={!valid || probe.isPending}
                onPress={() =>
                  probe.mutate(input, {
                    onSuccess: () => setTestedInput(inputIdentity),
                  })
                }
              />
              <Button
                variant="secondary"
                className="flex-1"
                title={t("llm.cancel")}
                onPress={() => router.back()}
              />
            </View>
            {probe.isSuccess && testedInput === inputIdentity ? (
              <Text
                accessibilityRole="text"
                className="px-4 text-sm"
                style={{ color: palette.textMuted }}
              >
                {t("llm.testPassed")}
              </Text>
            ) : null}
            {draft.id ? (
              <Button
                title={t("llm.delete")}
                variant="danger"
                disabled={busy}
                onPress={() =>
                  remove.mutate(draft.id, {
                    onSuccess: () => router.dismissTo("/llm-providers"),
                  })
                }
              />
            ) : null}
          </View>
        ) : null}
      </Screen>
    </>
  )
}

function validProfile(profile: LlmProviderSettings | null) {
  return Boolean(
    profile?.name.trim() &&
      profile.endpoint.trim() &&
      profile.models.length > 0 &&
      profile.models.every(
        (model) =>
          model.model.trim() &&
          Number.isInteger(model.contextWindow) &&
          model.contextWindow >= 8192 &&
          model.contextWindow <= 2000000 &&
          (model.maxOutputTokens == null ||
            (Number.isInteger(model.maxOutputTokens) &&
              model.maxOutputTokens > 0 &&
              model.maxOutputTokens <= model.contextWindow)),
      ) &&
      new Set(profile.models.map((model) => model.model.trim())).size ===
        profile.models.length,
  )
}

function LlmModelList({
  draft,
  onChange,
  models,
  input,
}: {
  draft: LlmProviderSettings
  onChange: (draft: LlmProviderSettings) => void
  models: ReturnType<typeof useLlmSettings>["models"]
  input: LlmProfileInput
}) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<number | null>(0)
  const [available, setAvailable] = useState<{
    source: string
    ids: string[]
  } | null>(null)
  const source = JSON.stringify([
    input.profile.id,
    input.profile.endpoint,
    input.profile.protocol,
    input.credential,
    input.clearCredential,
  ])
  const currentSource = useRef(source)
  currentSource.current = source
  const patch = (
    index: number,
    changes: Partial<LlmProviderSettings["models"][number]>,
  ) => onChange(updateModel(draft, index, changes)!)
  const updateTokenLimit = (
    index: number,
    field: "contextWindow" | "maxOutputTokens",
    value: string,
  ) => {
    if (!/^\d*$/.test(value) || !Number.isSafeInteger(Number(value))) return
    patch(index, {
      [field]: value
        ? Number(value)
        : field === "contextWindow"
          ? 0
          : undefined,
    })
  }
  return (
    <View className="gap-3">
      {available?.source === source ? (
        <ModelDiscovery
          models={available.ids.map((id) => ({ id }))}
          existing={draft.models.map((model) => model.model)}
          onClose={() => setAvailable(null)}
          onAdd={(ids) => {
            onChange({
              ...draft,
              models: [
                ...draft.models,
                ...ids
                  .filter(
                    (id) => !draft.models.some((model) => model.model === id),
                  )
                  .map(newModel),
              ],
            })
            setAvailable(null)
            setSelected(null)
          }}
        />
      ) : null}
      <ProviderModels
        models={draft.models}
        selected={selected}
        onSelect={setSelected}
        onChange={patch}
        onAdd={() => {
          onChange({ ...draft, models: [...draft.models, newModel()] })
          setSelected(draft.models.length)
        }}
        onRemove={(index) => {
          onChange({
            ...draft,
            models: draft.models.filter((_, i) => i !== index),
          })
          setSelected(null)
        }}
        actions={
          <Button
            variant="ghost"
            size="sm"
            title={t("providerEditor.fetchModels")}
            icon="refresh"
            loading={models.isPending}
            disabled={
              !draft.endpoint.trim() || !draft.name.trim() || models.isPending
            }
            onPress={() =>
              models.mutate(input, {
                onSuccess: (ids) => {
                  if (source === currentSource.current)
                    setAvailable({ source, ids })
                },
              })
            }
          />
        }
      >
        {(index) => (
          <View className="flex-row gap-2">
            <View className="min-w-0 flex-1">
              <ProviderTextField
                label={t("llm.context")}
                inputMode="numeric"
                keyboardType="number-pad"
                value={
                  draft.models[index]!.contextWindow
                    ? String(draft.models[index]!.contextWindow)
                    : ""
                }
                onChangeText={(value) =>
                  updateTokenLimit(index, "contextWindow", value)
                }
              />
            </View>
            <View className="min-w-0 flex-1">
              <ProviderTextField
                label={t("providerEditor.maxOutput")}
                inputMode="numeric"
                keyboardType="number-pad"
                value={draft.models[index]!.maxOutputTokens?.toString() ?? ""}
                placeholder={t("providerEditor.automatic")}
                onChangeText={(value) =>
                  updateTokenLimit(index, "maxOutputTokens", value)
                }
              />
            </View>
          </View>
        )}
      </ProviderModels>
    </View>
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
  if (!draft) return null
  return {
    profile: {
      ...draft,
      model: model?.model ?? "",
      contextWindow: model?.contextWindow ?? 32768,
      maxOutputTokens: model?.maxOutputTokens,
      revision: 0,
    },
    credential,
    clearCredential,
  }
}
