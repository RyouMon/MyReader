import {
  isTtsCredentialRequiredError,
  ttsProviderMeta,
} from "@my-reader/tools/tts-providers"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, FormSelect, FormSwitch } from "@/src/components"
import type { useFormValidation } from "@/src/components/ui/use-form-validation"
import { useThemePalette } from "@/src/design/tokens"
import {
  mergeSharedVoices,
  mergeVoices,
  newTtsModel,
  setVoiceScope,
  type TtsProviderDraft,
  updateVoices,
  usesModelVoices,
} from "@/src/domain/tts/tts-provider-draft"
import { useTtsModelDiscovery } from "@/src/domain/tts/use-tts-model-discovery"
import { useTtsRemoval } from "@/src/domain/tts/use-tts-removal-confirmation"
import { appErrorKind } from "@/src/errors/kind"
import { errorMessage } from "@/src/i18n/error-message"
import type { MobileTtsModel, QwenTtsModel } from "@/src/services/core/tts"
import { Text, View } from "@/tw"
import {
  closeModelDiscovery,
  openModelDiscovery,
} from "./model-discovery-session"
import { ProviderModels } from "./provider-models"
import { TtsVoicesEditor } from "./tts-voices-editor"

export function TtsProviderModels({
  draft,
  onChange,
  onCredentialRequired,
  validation,
}: {
  draft: TtsProviderDraft
  onChange: (draft: TtsProviderDraft) => void
  onCredentialRequired?: () => void
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
  const { discover, voices: importing, fetchVoices } = useTtsModelDiscovery()
  const meta = ttsProviderMeta(draft.kind)
  const request = useRef<AbortController | null>(null)
  const activeDiscoverySession = useRef<number | null>(null)
  const identity = JSON.stringify([
    draft.id,
    draft.kind,
    draft.endpoint,
    draft.credential,
    draft.clearCredential,
  ])
  const current = useRef(draft)
  useEffect(() => {
    current.current = draft
  }, [draft])
  useEffect(() => {
    if (activeDiscoverySession.current !== null) {
      closeModelDiscovery(activeDiscoverySession.current)
      activeDiscoverySession.current = null
    }
    return () => request.current?.abort()
  }, [identity])
  useEffect(
    () => () => {
      if (activeDiscoverySession.current !== null) {
        closeModelDiscovery(activeDiscoverySession.current)
        activeDiscoverySession.current = null
      }
    },
    [],
  )
  const busy =
    discover.isPending || importing.isPending || fetchVoices.isPending
  const scoped = usesModelVoices(draft)
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
  const handleCredentialError = (error: unknown, reset: () => void) => {
    if (
      !isTtsCredentialRequiredError(error, current.current, appErrorKind(error))
    )
      return
    reset()
    onCredentialRequired?.()
  }
  const add = async (
    ids: string[],
    discoveredOptions: { id: string; qwen?: QwenTtsModel }[],
  ) => {
    const controller = startRequest()
    const catalog = discoveredOptions.flatMap((option) =>
      option.qwen ? [option.qwen] : [],
    )
    try {
      const models = await importing.mutateAsync({
        draft: current.current,
        ids,
        catalog,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return true
      const latest = current.current
      const unique = models.filter(
        (model) =>
          !latest.models.some((old) => old.model.trim() === model.model),
      )
      const existing = latest.models.filter((model) => model.model.trim())
      onChange({ ...latest, models: [...existing, ...unique] })
      setSelected(existing.length)
      return true
    } catch (error) {
      if (controller.signal.aborted) return true
      if (
        isTtsCredentialRequiredError(
          error,
          current.current,
          appErrorKind(error),
        )
      ) {
        importing.reset()
        onCredentialRequired?.()
        return true
      }
      throw error
    }
  }
  const refreshScoped = (index: number) => {
    const controller = startRequest()
    const original = draft.models[index]!
    fetchVoices.mutate(
      { draft, model: original, signal: controller.signal },
      {
        onSuccess: (discovered) => {
          if (controller.signal.aborted) return
          const latest = current.current
          onChange({
            ...latest,
            models: latest.models.map((model) =>
              model.id === original.id && model.model === original.model
                ? mergeVoices(model, discovered)
                : model,
            ),
          })
        },
        onError: (error) => {
          if (!controller.signal.aborted)
            handleCredentialError(error, fetchVoices.reset)
        },
      },
    )
  }
  const refreshShared = (model?: MobileTtsModel) => {
    const controller = startRequest()
    fetchVoices.mutate(
      { draft, model, signal: controller.signal },
      {
        onSuccess: (discovered) => {
          if (controller.signal.aborted) return
          onChange(mergeSharedVoices(current.current, discovered))
        },
        onError: (error) => {
          if (!controller.signal.aborted)
            handleCredentialError(error, fetchVoices.reset)
        },
      },
    )
  }
  const voiceEditor = (model?: MobileTtsModel, index?: number) => {
    const canFetch =
      meta.supportsVoiceDiscovery &&
      Boolean(draft.endpoint.trim()) &&
      index !== undefined &&
      (draft.kind !== "qwen" || Boolean(model?.model.trim()))
    return (
      <TtsVoicesEditor
        draft={draft}
        model={model}
        validation={validation}
        onCredentialRequired={onCredentialRequired}
        onChange={(voices, names) =>
          onChange(updateVoices(draft, model?.id, voices, names))
        }
        actions={
          canFetch ? (
            <Button
              variant="ghost"
              size="sm"
              title={t("providerEditor.fetchVoices")}
              icon={{ ios: "arrow.clockwise", android: "refresh" }}
              loading={fetchVoices.isPending}
              disabled={busy}
              onPress={() => refreshScoped(index)}
            />
          ) : undefined
        }
      />
    )
  }
  const addManual = () => {
    const model = {
      ...newTtsModel("", undefined, draft.kind),
      voices: scoped ? [""] : [],
      responseFormat: meta.defaultFormat,
    }
    onChange({ ...draft, models: [...draft.models, model] })
    setSelected(draft.models.length)
  }
  const rawDiscoveryError =
    discover.error || importing.error || fetchVoices.error
  const discoveryError =
    rawDiscoveryError &&
    !isTtsCredentialRequiredError(
      rawDiscoveryError,
      draft,
      appErrorKind(rawDiscoveryError),
    )
      ? rawDiscoveryError
      : null
  return (
    <View className="gap-3">
      {discoveryError ? (
        <Text
          selectable
          accessibilityRole="alert"
          className="px-4 text-sm"
          style={{ color: palette.danger }}
        >
          {errorMessage(discoveryError)}
        </Text>
      ) : null}
      {meta.allowsCustomVoiceScope ? (
        <FormSwitch
          label={t("aiProviders.modelScopedVoices")}
          value={scoped}
          onValueChange={(value) => onChange(setVoiceScope(draft, value))}
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
                  onSuccess: (discoveredOptions) => {
                    if (controller.signal.aborted) return
                    const sessionId = openModelDiscovery({
                      models: discoveredOptions,
                      existing: current.current.models.map(
                        (model) => model.model,
                      ),
                      onAdd: (ids) => add(ids, discoveredOptions),
                      onClose: () => {
                        if (activeDiscoverySession.current === sessionId) {
                          activeDiscoverySession.current = null
                        }
                      },
                    })
                    activeDiscoverySession.current = sessionId
                  },
                  onError: (error) => {
                    if (!controller.signal.aborted)
                      handleCredentialError(error, discover.reset)
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
          busy={busy}
          fetchingVoices={fetchVoices.isPending}
          canFetchVoices={
            meta.supportsVoiceDiscovery && Boolean(draft.endpoint.trim())
          }
          onCredentialRequired={onCredentialRequired}
          onFetchVoices={refreshShared}
          onChange={onChange}
        />
      ) : null}
    </View>
  )
}

function SharedVoices({
  draft,
  validation,
  busy,
  fetchingVoices,
  canFetchVoices,
  onCredentialRequired,
  onFetchVoices,
  onChange,
}: {
  draft: TtsProviderDraft
  validation: ReturnType<typeof useFormValidation>
  busy: boolean
  fetchingVoices: boolean
  canFetchVoices: boolean
  onCredentialRequired?: () => void
  onFetchVoices: (model?: MobileTtsModel) => void
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
        onCredentialRequired={onCredentialRequired}
        actions={
          canFetchVoices ? (
            <Button
              variant="ghost"
              size="sm"
              title={t("providerEditor.fetchVoices")}
              icon={{ ios: "arrow.clockwise", android: "refresh" }}
              loading={fetchingVoices}
              disabled={busy}
              onPress={() => onFetchVoices(model)}
            />
          ) : undefined
        }
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
