import {
  isTtsCredentialRequiredError,
  ttsProviderMeta,
} from "@my-reader/tools/tts-providers"
import { Loader2 } from "lucide-react"
import { type CSSProperties, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { FormSelect, FormSelectItem } from "@/components/common/FormSelect"
import { FormSwitch } from "@/components/common/FormSwitch"
import { StatusNotice } from "@/components/common/StatusNotice"
import { ModelDiscovery } from "@/components/settings/ModelDiscovery"
import { ProviderModels } from "@/components/settings/ProviderModels"
import { TtsModelDetails } from "@/components/settings/TtsModelDetails"
import { TtsVoicesEditor } from "@/components/settings/TtsVoicesEditor"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import { useTtsModelDiscovery } from "@/hooks/useTtsModelDiscovery"
import { useTtsRemoval } from "@/hooks/useTtsRemovalConfirmation"
import { apiErrorKind } from "@/lib/api-error"
import { errorMessage } from "@/lib/error-presentation"
import type { TtsModelDto } from "@/lib/tauri-specta"
import {
  mergeSharedTtsVoices,
  mergeTtsVoices,
  modelVoices,
  newTtsModel,
  setTtsVoiceScope,
  type TtsProviderDraft,
} from "@/lib/tts-provider-draft"

function SharedVoicesFetchAction({
  visible,
  busy,
  pending,
  onClick,
}: {
  visible: boolean
  busy: boolean
  pending: boolean
  onClick: () => void
}) {
  const { t } = useTranslation()
  if (!visible) return null
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={onClick}
    >
      {pending ? <Loader2 className="animate-spin" /> : null}
      {t("providerEditor.fetchVoices")}
    </Button>
  )
}

export function TtsProviderModels({
  draft,
  previewModel,
  fieldErrors,
  themeStyle,
  onCredentialRequired,
  onChange,
}: {
  draft: TtsProviderDraft
  previewModel?: TtsModelDto
  fieldErrors?: Record<string, string>
  themeStyle?: CSSProperties
  onCredentialRequired?: () => void
  onChange: (draft: TtsProviderDraft) => void
}) {
  const { t } = useTranslation()
  const confirmRemoval = useTtsRemoval()
  const [selected, setSelected] = useState<number | null>(0)
  const [showDiscovery, setShowDiscovery] = useState(false)
  const { discover, voices: importing, fetchVoices } = useTtsModelDiscovery()
  const meta = ttsProviderMeta(draft.kind)
  const identity = (value: TtsProviderDraft) =>
    JSON.stringify([
      value.id,
      value.kind,
      value.endpoint,
      value.credential,
      value.clearCredential,
    ])
  const matchesDiscovery =
    discover.variables && identity(discover.variables.draft) === identity(draft)
  const options = matchesDiscovery ? discover.data : undefined
  const catalog =
    options?.flatMap((model) => (model.qwen ? [model.qwen] : [])) ?? []
  const current = useRef(draft)
  current.current = draft
  const scoped = modelVoices(draft)
  const busy =
    discover.isPending || importing.isPending || fetchVoices.isPending
  const patch = (index: number, change: Partial<TtsModelDto>) =>
    onChange({
      ...draft,
      models: draft.models.map((model, i) =>
        index === i ? { ...model, ...change } : model,
      ),
    })
  const handleCredentialError = (error: unknown, reset: () => void) => {
    if (
      !isTtsCredentialRequiredError(error, current.current, apiErrorKind(error))
    )
      return
    reset()
    onCredentialRequired?.()
  }
  const addModels = (ids: string[]) => {
    const snapshot = JSON.stringify(draft)
    importing.mutate(
      { draft, ids, catalog },
      {
        onSuccess: (models) => {
          if (snapshot !== JSON.stringify(current.current)) return
          const previous = draft.models.filter((model) => model.model.trim())
          const additions = models.filter(
            (model) => !previous.some((old) => old.model === model.model),
          )
          onChange({
            ...draft,
            models: [...previous, ...additions],
          })
          setSelected(previous.length)
          setShowDiscovery(false)
        },
        onError: (error) => handleCredentialError(error, importing.reset),
      },
    )
  }
  const updateVoices = (
    model: TtsModelDto,
    next: string[],
    voiceNames: Record<string, string>,
  ) => {
    onChange(
      scoped
        ? {
            ...draft,
            models: draft.models.map((old) =>
              old.id === model.id ? { ...old, voices: next, voiceNames } : old,
            ),
          }
        : {
            ...draft,
            voices: next,
            voiceNames,
          },
    )
  }
  const changeModel = (index: number, change: { model?: string }) => {
    const known = catalog.find((model) => model.id === change.model)
    patch(
      index,
      known
        ? {
            ...newTtsModel(known.id, known, draft.kind),
            id: draft.models[index].id,
          }
        : change,
    )
  }
  const removeModel = async (index: number) => {
    const next = {
      ...draft,
      models: draft.models.filter((_, i) => i !== index),
    }
    if (await confirmRemoval(next, draft.models[index].model)) {
      onChange(next)
      setSelected(null)
    }
  }
  const addModel = () => {
    const unused =
      draft.kind === "qwen"
        ? catalog.find(
            (model) =>
              !draft.models.some((configured) => configured.model === model.id),
          )
        : undefined
    if (unused) {
      addModels([unused.id])
      return
    }
    onChange({
      ...draft,
      models: [...draft.models, newTtsModel("", undefined, draft.kind)],
    })
    setSelected(draft.models.length)
  }
  const refreshScopedVoices = (index: number) => {
    const model = draft.models[index]
    const snapshot = JSON.stringify(draft)
    fetchVoices.mutate(
      { draft, model },
      {
        onSuccess: (discovered) => {
          if (snapshot !== JSON.stringify(current.current)) return
          patch(index, mergeTtsVoices(model, discovered))
        },
        onError: (error) => handleCredentialError(error, fetchVoices.reset),
      },
    )
  }
  const refreshSharedVoices = () => {
    const snapshot = JSON.stringify(draft)
    fetchVoices.mutate(
      { draft, model: previewModel },
      {
        onSuccess: (discovered) => {
          if (snapshot !== JSON.stringify(current.current)) return
          onChange(mergeSharedTtsVoices(draft, discovered))
        },
        onError: (error) => handleCredentialError(error, fetchVoices.reset),
      },
    )
  }
  const rawDiscoveryError =
    discover.error || importing.error || fetchVoices.error
  const discoveryError =
    rawDiscoveryError &&
    !isTtsCredentialRequiredError(
      rawDiscoveryError,
      draft,
      apiErrorKind(rawDiscoveryError),
    )
      ? rawDiscoveryError
      : null
  return (
    <FieldGroup>
      {meta.allowsCustomVoiceScope ? (
        <FormSwitch
          label={t("aiProviders.modelScopedVoices")}
          checked={scoped}
          disabled={busy}
          onCheckedChange={(value) => onChange(setTtsVoiceScope(draft, value))}
        />
      ) : null}
      <Separator />
      {discoveryError ? (
        <StatusNotice tone="error">{errorMessage(discoveryError)}</StatusNotice>
      ) : null}
      {showDiscovery && options ? (
        <ModelDiscovery
          models={options}
          existing={draft.models.map((model) => model.model)}
          busy={importing.isPending}
          themeStyle={themeStyle}
          onAdd={addModels}
          onClose={() => setShowDiscovery(false)}
        />
      ) : null}
      <fieldset disabled={busy} className="min-w-0">
        <ProviderModels
          fieldErrors={fieldErrors}
          models={draft.models}
          selected={selected}
          onSelect={setSelected}
          onChange={changeModel}
          onRemove={removeModel}
          onAdd={addModel}
          actions={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy || !draft.endpoint.trim()}
              onClick={() => {
                const source = identity(draft)
                discover.mutate(
                  { draft, catalog },
                  {
                    onSuccess: () => {
                      if (identity(current.current) === source)
                        setShowDiscovery(true)
                    },
                    onError: (error) =>
                      handleCredentialError(error, discover.reset),
                  },
                )
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              {t("providerEditor.fetchModels")}
            </Button>
          }
        >
          {scoped
            ? (index) => (
                <TtsModelDetails
                  draft={draft}
                  model={draft.models[index]}
                  fieldErrors={fieldErrors}
                  onCredentialRequired={onCredentialRequired}
                  onVoicesChange={(voices, names) =>
                    updateVoices(draft.models[index], voices, names)
                  }
                  onRefresh={() => refreshScopedVoices(index)}
                />
              )
            : undefined}
        </ProviderModels>
      </fieldset>
      {!scoped ? (
        <>
          <Separator />
          <TtsVoicesEditor
            draft={draft}
            model={previewModel}
            fieldErrors={fieldErrors}
            disabled={busy}
            onCredentialRequired={onCredentialRequired}
            actions={
              <SharedVoicesFetchAction
                visible={
                  meta.supportsVoiceDiscovery && Boolean(draft.endpoint.trim())
                }
                busy={busy}
                pending={fetchVoices.isPending}
                onClick={refreshSharedVoices}
              />
            }
            onChange={(voices, names) => {
              if (previewModel) updateVoices(previewModel, voices, names)
              else onChange({ ...draft, voices, voiceNames: names })
            }}
          />
        </>
      ) : null}
    </FieldGroup>
  )
}

export function TtsTestModelSelect({
  draft,
  model,
  onChange,
}: {
  draft: TtsProviderDraft
  model?: TtsModelDto
  onChange: (id: string) => void
}) {
  const { t } = useTranslation()
  if (modelVoices(draft) || draft.models.length < 2) return null
  return (
    <FormSelect
      id="voice-test-model"
      label={t("providerEditor.testModel")}
      value={model?.id ?? ""}
      onValueChange={onChange}
      fullWidth={false}
    >
      {draft.models.map((model) => (
        <FormSelectItem key={model.id} value={model.id}>
          {model.model || t("aiProviders.newModel")}
        </FormSelectItem>
      ))}
    </FormSelect>
  )
}
