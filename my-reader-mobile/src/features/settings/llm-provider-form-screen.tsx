import { ProviderModels } from "./provider-models"
import { useEffect, useRef, useState } from "react"
import { router, Stack, useLocalSearchParams } from "expo-router"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"
import { randomUUID } from "expo-crypto"
import { ModelDiscovery } from "./model-discovery"
import { ProviderTextField } from "./provider-text-field"
import { useTranslation } from "react-i18next"
import { ActivityIndicator } from "react-native"
import { Button, FormSelect, Screen } from "@/src/components"
import { useThemePalette } from "@/src/design/tokens"
import { useLlmSettings } from "@/src/domain/llm/use-llm-settings"
import type {
  LlmProviderSettings,
  LlmProfileInput,
} from "@/src/services/core/llm"
import { errorMessage } from "@/src/i18n/error-message"
import { Text, View } from "@/tw"
import { createSaveAction } from "@/src/navigation/toolbar-action-helpers"
import { useFormValidation } from "@/src/components/ui/use-form-validation"
import { llmFormErrors } from "./provider-validation"
import { ProviderConnectionFields } from "./provider-connection-fields"
import { useDeleteAction } from "@/src/navigation/hooks/use-delete-action"

const protocolTitles: Record<string, string> = {
  chatCompletions: "Chat Completions",
  responses: "Responses",
}
const protocolActions = Object.entries(protocolTitles).map(([id, title]) => ({
  id,
  title,
}))

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
  const input = currentProfileInput(draft, credential, clearCredential)
  const errors = draft ? llmFormErrors(draft, t) : {}
  const validation = useFormValidation(errors)
  const busy = save.isPending || remove.isPending
  const deleteAction = useDeleteAction({
    name: draft?.name ?? "",
    disabled: busy,
    onDelete: () => {
      if (!draft?.id || busy) return
      remove.mutate(draft.id, {
        onSuccess: () => router.dismissTo("/llm-providers"),
      })
    },
  })
  const { options, toolbar } = useScreenHeader({
    title: t(providerId ? "llm.edit" : "llm.add"),
    backTitle: t("back"),
    right: draft
      ? [
          ...(draft.id ? [deleteAction] : []),
          createSaveAction({
            label: t("llm.save"),
            color: palette.primary,
            loading: save.isPending,
            disabled: busy,
            onPress: () => {
              if (!validation.validate() || busy) return
              save.mutate(
                { provider: draft, credential, clearCredential },
                {
                  onSuccess: () => router.dismissTo("/llm-providers"),
                },
              )
            },
          }),
        ]
      : undefined,
  })
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
            <FormSelect
              label={t("llm.protocol")}
              value={protocolTitles[draft.protocol] ?? draft.protocol}
              actions={protocolActions.map((action) => ({
                ...action,
                state: action.id === draft.protocol ? "on" : "off",
              }))}
              onSelect={(protocol) => setDraft({ ...draft, protocol })}
            />
            <ProviderConnectionFields
              kind="llm"
              value={{ ...draft, credential, clearCredential }}
              validation={validation}
              onChange={(connection) => {
                setDraft({
                  ...draft,
                  name: connection.name,
                  endpoint: connection.endpoint,
                })
                setCredential(connection.credential)
                setClearCredential(connection.clearCredential)
              }}
            />
            <LlmModelList
              draft={draft}
              onChange={setDraft}
              models={models}
              input={input}
              validation={validation}
            />
            <View
              className="border-t pt-3"
              style={{ borderColor: palette.border }}
            >
              <Button
                title={t("llm.test")}
                variant="ghost"
                className="self-start"
                icon={{ ios: "network", android: "network-check" }}
                loading={probe.isPending}
                disabled={busy || probe.isPending}
                onPress={() => {
                  if (!validation.validate()) return
                  probe.mutate(input, {
                    onSuccess: () => setTestedInput(inputIdentity),
                  })
                }}
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
          </View>
        ) : null}
      </Screen>
    </>
  )
}

function LlmModelList({
  draft,
  onChange,
  models,
  input,
  validation,
}: {
  draft: LlmProviderSettings
  onChange: (draft: LlmProviderSettings) => void
  models: ReturnType<typeof useLlmSettings>["models"]
  input: LlmProfileInput
  validation: ReturnType<typeof useFormValidation>
}) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<number | null>(null)
  const invalidDetails = draft.models.findIndex(
    (model) =>
      validation.field(`${model.id}.context`).error ||
      validation.field(`${model.id}.output`).error,
  )
  useEffect(() => {
    if (invalidDetails >= 0) setSelected(invalidDetails)
  }, [invalidDetails])
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
                ...draft.models.filter((model) => model.model.trim()),
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
        validation={validation}
        selected={selected}
        onSelect={setSelected}
        onChange={patch}
        onAdd={() => {
          onChange({ ...draft, models: [...draft.models, newModel()] })
          setSelected(null)
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
            icon={{ ios: "arrow.clockwise", android: "refresh" }}
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
                required
                {...validation.field(`${draft.models[index]!.id}.context`)}
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
                {...validation.field(`${draft.models[index]!.id}.output`)}
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
  credential: string,
  clearCredential: boolean,
): LlmProfileInput | null {
  if (!draft) return null
  const model = draft.models[0]
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
