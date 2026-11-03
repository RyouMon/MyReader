import { useTtsRemoval } from "@/src/domain/tts/use-tts-removal-confirmation"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, FormSwitch, FormSelect } from "@/src/components"
import { useThemePalette } from "@/src/design/tokens"
import {
  mergeVoices,
  newTtsModel,
  setVoiceScope,
  updateVoices,
  usesModelVoices,
  type TtsProviderDraft,
} from "@/src/domain/tts/tts-provider-draft"
import { useTtsModelDiscovery } from "@/src/domain/tts/use-tts-model-discovery"
import { errorMessage } from "@/src/i18n/error-message"
import type { MobileTtsModel } from "@/src/services/core/tts"
import { Text, View } from "@/tw"
import { ProviderModels } from "./provider-models"
import { ModelDiscovery } from "./model-discovery"
import { TtsVoicesEditor } from "./tts-voices-editor"
import type { useFormValidation } from "@/src/components/ui/use-form-validation"

export function TtsProviderModels({
  draft,
  onChange,
  validation,
}: {
  draft: TtsProviderDraft
  onChange: (draft: TtsProviderDraft) => void
  validation: ReturnType<typeof useFormValidation>
}) {
  const { t } = useTranslation()
  const confirmRemoval = useTtsRemoval()
  const palette = useThemePalette()
  const [selected, setSelected] = useState<number | null>(0)
  const invalidDetails = draft.models.findIndex(
    (model) =>
      validation.field(`${model.id}.voices`).error ||
      model.voices.some(
        (_, i) => validation.field(`${model.id}.voice.${i}`).error,
      ),
  )
  useEffect(() => {
    if (invalidDetails >= 0) setSelected(invalidDetails)
  }, [invalidDetails])
  const [showModels, setShowModels] = useState(false)
  const { discover, voices: importing } = useTtsModelDiscovery()
  const request = useRef<AbortController | null>(null)
  const identity = JSON.stringify([
    draft.id,
    draft.kind,
    draft.endpoint,
    draft.credential,
    draft.clearCredential,
  ])
  const current = useRef(draft)
  current.current = draft
  useEffect(() => {
    setShowModels(false)
    return () => request.current?.abort()
  }, [identity])
  const busy = discover.isPending || importing.isPending
  const scoped = usesModelVoices(draft)
  const options = discover.data ?? []
  const catalog = options.flatMap((option) =>
    option.qwen ? [option.qwen] : [],
  )
  const patch = (index: number, changes: Partial<MobileTtsModel>) =>
    onChange({
      ...draft,
      models: draft.models.map((model, i) =>
        i === index ? { ...model, ...changes } : model,
      ),
    })
  const startRequest = () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    return controller
  }
  const add = (ids: string[]) => {
    const controller = startRequest()
    importing.mutate(
      { draft, ids, catalog, signal: controller.signal },
      {
        onSuccess: (models) => {
          if (controller.signal.aborted) return
          const latest = current.current
          const unique = models.filter(
            (model) =>
              !latest.models.some((old) => old.model.trim() === model.model),
          )
          const existing = latest.models.filter((model) => model.model.trim())
          onChange({ ...latest, models: [...existing, ...unique] })
          setSelected(existing.length)
          setShowModels(false)
        },
      },
    )
  }
  const refresh = (index: number) => {
    const controller = startRequest()
    const original = draft.models[index]!
    importing.mutate(
      { draft, ids: [original.model], catalog: [], signal: controller.signal },
      {
        onSuccess: ([result]) => {
          if (controller.signal.aborted || !result) return
          const latest = current.current
          onChange({
            ...latest,
            models: latest.models.map((model) =>
              model.id === original.id && model.model === original.model
                ? mergeVoices(
                    model,
                    result.voices.map((id) => ({
                      id,
                      language: "mul",
                    })),
                  )
                : model,
            ),
          })
        },
      },
    )
  }
  const voiceEditor = (model?: MobileTtsModel, index?: number) => (
    <TtsVoicesEditor
      draft={draft}
      model={model}
      validation={validation}
      onChange={(voices, names) =>
        onChange(updateVoices(draft, model?.id, voices, names))
      }
      actions={
        draft.kind === "qwen" && model?.model.trim() && index !== undefined ? (
          <Button
            variant="ghost"
            size="sm"
            title={t("providerEditor.fetchVoices")}
            icon={{ ios: "arrow.clockwise", android: "refresh" }}
            disabled={busy}
            onPress={() => refresh(index)}
          />
        ) : undefined
      }
    />
  )
  const addManual = () => {
    const model = {
      ...newTtsModel(),
      voices: scoped ? [""] : [],
      responseFormat: draft.kind === "qwen" ? "wav" : "mp3",
      defaultVoice: scoped ? undefined : draft.voices[0],
    }
    onChange({ ...draft, models: [...draft.models, model] })
    setSelected(draft.models.length)
  }
  return (
    <View className="gap-3">
      {discover.error || importing.error ? (
        <Text
          selectable
          accessibilityRole="alert"
          className="px-4 text-sm"
          style={{ color: palette.danger }}
        >
          {errorMessage(discover.error || importing.error)}
        </Text>
      ) : null}
      {draft.kind === "openAiCompatible" ? (
        <FormSwitch
          label={t("aiProviders.modelScopedVoices")}
          value={scoped}
          onValueChange={(value) => onChange(setVoiceScope(draft, value))}
        />
      ) : null}
      {showModels ? (
        <ModelDiscovery
          models={options}
          existing={draft.models.map((model) => model.model)}
          onAdd={add}
          onClose={() => setShowModels(false)}
          busy={busy}
        />
      ) : null}
      <ProviderModels
        models={draft.models}
        selected={selected}
        onSelect={setSelected}
        validation={validation}
        onChange={patch}
        onAdd={addManual}
        onRemove={async (index) => {
          const next = {
            ...draft,
            models: draft.models.filter((_, i) => i !== index),
          }
          if (await confirmRemoval(next, draft.models[index]!.model)) {
            onChange(next)
            setSelected(null)
          }
        }}
        actions={
          <Button
            title={t("providerEditor.fetchModels")}
            icon={{ ios: "arrow.clockwise", android: "refresh" }}
            variant="ghost"
            size="sm"
            loading={discover.isPending}
            disabled={busy || !draft.endpoint.trim()}
            onPress={() => {
              const controller = startRequest()
              discover.mutate(
                { draft, signal: controller.signal },
                {
                  onSuccess: () => {
                    if (!controller.signal.aborted) setShowModels(true)
                  },
                },
              )
            }}
          />
        }
      >
        {scoped
          ? (index) => voiceEditor(draft.models[index], index)
          : undefined}
      </ProviderModels>
      {!scoped ? (
        <SharedVoices
          draft={draft}
          validation={validation}
          onChange={onChange}
        />
      ) : null}
    </View>
  )
}

function SharedVoices({
  draft,
  validation,
  onChange,
}: {
  draft: TtsProviderDraft
  validation: ReturnType<typeof useFormValidation>
  onChange: (draft: TtsProviderDraft) => void
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const [previewId, setPreviewId] = useState(draft.models[0]?.id)
  const model =
    draft.models.find((item) => item.id === previewId) ?? draft.models[0]
  return (
    <View
      className="gap-3 border-t pt-3"
      style={{ borderColor: palette.border }}
    >
      <TtsVoicesEditor
        draft={draft}
        model={model}
        validation={validation}
        onChange={(voices, names) =>
          onChange(updateVoices(draft, model?.id, voices, names))
        }
      />
      {draft.models.length > 1 ? (
        <FormSelect
          label={t("providerEditor.testModel")}
          value={model?.model || t("aiProviders.newModel")}
          actions={draft.models.map((item) => ({
            id: item.id,
            title: item.model || t("aiProviders.newModel"),
            state: item.id === model?.id ? "on" : "off",
          }))}
          onSelect={setPreviewId}
        />
      ) : null}
    </View>
  )
}
