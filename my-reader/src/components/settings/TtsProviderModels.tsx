import { useTtsRemoval } from "@/hooks/useTtsRemovalConfirmation"
import { Loader2 } from "lucide-react"
import { FormSelect, FormSelectItem } from "@/components/common/FormSelect"
import { FormSwitch } from "@/components/common/FormSwitch"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { StatusNotice } from "@/components/common/StatusNotice"
import { ModelDiscovery } from "@/components/settings/ModelDiscovery"
import { ProviderModels } from "@/components/settings/ProviderModels"
import { TtsVoicesEditor } from "@/components/settings/TtsVoicesEditor"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { TtsModelDetails } from "@/components/settings/TtsModelDetails"
import { Separator } from "@/components/ui/separator"
import { useTtsModelDiscovery } from "@/hooks/useTtsModelDiscovery"
import { errorMessage } from "@/lib/error-presentation"
import {
  modelVoices,
  mergeTtsVoices,
  newTtsModel,
  setTtsVoiceScope,
  updatedDefaultVoice,
  type TtsProviderDraft,
} from "@/lib/tts-provider-draft"
import type { TtsModelDto } from "@/lib/tauri-specta"

export function TtsProviderModels({
  draft,
  previewModel,
  fieldErrors,
  onChange,
}: {
  draft: TtsProviderDraft
  previewModel?: TtsModelDto
  fieldErrors?: Record<string, string>
  onChange: (draft: TtsProviderDraft) => void
}) {
  const { t } = useTranslation()
  const confirmRemoval = useTtsRemoval()
  const [selected, setSelected] = useState<number | null>(0)
  const [showDiscovery, setShowDiscovery] = useState(false)
  const { discover, voices: importing } = useTtsModelDiscovery()
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
  const busy = discover.isPending || importing.isPending
  const patch = (index: number, change: Partial<TtsModelDto>) =>
    onChange({
      ...draft,
      models: draft.models.map((model, i) =>
        index === i ? { ...model, ...change } : model,
      ),
    })
  const addModels = (ids: string[]) => {
    const identity = JSON.stringify(draft)
    importing.mutate(
      { draft, ids, catalog },
      {
        onSuccess: (models) => {
          if (identity !== JSON.stringify(current.current)) return
          const previous = draft.models.filter((model) => model.model.trim())
          const additions = models.filter(
            (model) => !previous.some((old) => old.model === model.model),
          )
          onChange({
            ...draft,
            models: [
              ...previous,
              ...additions.map((model) =>
                scoped
                  ? model
                  : { ...model, defaultVoice: draft.voices[0] ?? null },
              ),
            ],
          })
          setSelected(previous.length)
          setShowDiscovery(false)
        },
      },
    )
  }
  const updateVoices = (model: TtsModelDto, next: string[]) => {
    const defaultVoice = updatedDefaultVoice(
      model.defaultVoice,
      model.voices,
      next,
    )
    onChange(
      scoped
        ? {
            ...draft,
            models: draft.models.map((old) =>
              old.id === model.id
                ? { ...old, voices: next, defaultVoice }
                : old,
            ),
          }
        : {
            ...draft,
            voices: next,
            models: draft.models.map((old) => ({
              ...old,
              defaultVoice: updatedDefaultVoice(
                old.defaultVoice,
                draft.voices,
                next,
              ),
            })),
          },
    )
  }
  const changeModel = (index: number, change: { model?: string }) => {
    const known = catalog.find((model) => model.id === change.model)
    patch(
      index,
      known
        ? { ...newTtsModel(known.id, known), id: draft.models[index].id }
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
      models: [
        ...draft.models,
        {
          ...newTtsModel(),
          defaultVoice: scoped ? null : (draft.voices[0] ?? null),
        },
      ],
    })
    setSelected(draft.models.length)
  }
  return (
    <FieldGroup>
      {draft.kind === "openAiCompatible" ? (
        <FormSwitch
          label={t("aiProviders.modelScopedVoices")}
          checked={scoped}
          disabled={busy}
          onCheckedChange={(value) => onChange(setTtsVoiceScope(draft, value))}
        />
      ) : null}
      <Separator />
      {discover.error || importing.error ? (
        <StatusNotice tone="error">
          {errorMessage(discover.error || importing.error)}
        </StatusNotice>
      ) : null}
      <fieldset disabled={busy} className="min-w-0">
        <ProviderModels
          fieldErrors={fieldErrors}
          discovery={
            showDiscovery && options ? (
              <ModelDiscovery
                models={options}
                existing={draft.models.map((model) => model.model)}
                onAdd={addModels}
                onClose={() => setShowDiscovery(false)}
              />
            ) : null
          }
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
                  onVoicesChange={(voices) =>
                    updateVoices(draft.models[index], voices)
                  }
                  onRefresh={() => {
                    const model = draft.models[index]
                    const identity = JSON.stringify(draft)
                    importing.mutate(
                      { draft, ids: [model.model], catalog: [] },
                      {
                        onSuccess: ([result]) => {
                          if (identity !== JSON.stringify(current.current))
                            return
                          patch(
                            index,
                            mergeTtsVoices(
                              model,
                              result.voices.map((id) => ({
                                id,
                                language: "mul",
                                gender: null,
                              })),
                            ),
                          )
                        },
                      },
                    )
                  }}
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
            onChange={(voices) => {
              if (previewModel) updateVoices(previewModel, voices)
              else onChange({ ...draft, voices })
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
