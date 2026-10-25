import { Loader2 } from "lucide-react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { AppRow } from "@/components/common/AppRow"
import { StatusNotice } from "@/components/common/StatusNotice"
import { ModelDiscovery } from "@/components/settings/ModelDiscovery"
import { ProviderModels } from "@/components/settings/ProviderModels"
import { TtsVoicesEditor } from "@/components/settings/TtsVoicesEditor"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { TtsModelDetails } from "@/components/settings/TtsModelDetails"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
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
  onChange,
  readOnly = false,
}: {
  draft: TtsProviderDraft
  onChange: (draft: TtsProviderDraft) => void
  readOnly?: boolean
}) {
  const { t } = useTranslation()
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
  const updateVoices = (
    model: TtsModelDto,
    next: string[],
    names: Record<string, string>,
  ) => {
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
                ? { ...old, voices: next, voiceNames: names, defaultVoice }
                : old,
            ),
          }
        : {
            ...draft,
            voices: next,
            voiceNames: names,
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
  const changeModel = (
    index: number,
    change: { model?: string; displayName?: string },
  ) => {
    const known = catalog.find((model) => model.id === change.model)
    patch(
      index,
      known
        ? { ...newTtsModel(known.id, known), id: draft.models[index].id }
        : change,
    )
  }
  const removeModel = (index: number) => {
    onChange({ ...draft, models: draft.models.filter((_, i) => i !== index) })
    setSelected(null)
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
      {discover.error || importing.error ? (
        <StatusNotice tone="error">
          {errorMessage(discover.error || importing.error)}
        </StatusNotice>
      ) : null}
      <fieldset disabled={busy} className="min-w-0">
        <ProviderModels
          settings={
            !readOnly && draft.kind === "openAiCompatible" ? (
              <AppRow
                body={t("aiProviders.modelScopedVoices")}
                className="items-center"
                tail={
                  <Switch
                    aria-label={t("aiProviders.modelScopedVoices")}
                    checked={scoped}
                    disabled={busy}
                    onCheckedChange={(value) =>
                      onChange(setTtsVoiceScope(draft, value))
                    }
                  />
                }
              />
            ) : null
          }
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
          onChange={readOnly ? undefined : changeModel}
          onRemove={readOnly ? undefined : removeModel}
          onAdd={readOnly ? undefined : addModel}
          actions={
            readOnly ? undefined : (
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
            )
          }
        >
          {scoped
            ? (index) => (
                <TtsModelDetails
                  draft={draft}
                  model={draft.models[index]}
                  readOnly={readOnly}
                  onVoicesChange={(voices, names) =>
                    updateVoices(draft.models[index], voices, names)
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
                                name: result.voiceNames?.[id] || id,
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
        <SharedVoices
          draft={draft}
          readOnly={readOnly}
          busy={busy}
          onChange={onChange}
          updateVoices={updateVoices}
        />
      ) : null}
    </FieldGroup>
  )
}

function SharedVoices({
  draft,
  readOnly,
  busy,
  onChange,
  updateVoices,
}: {
  draft: TtsProviderDraft
  readOnly: boolean
  busy: boolean
  onChange: (draft: TtsProviderDraft) => void
  updateVoices: (
    model: TtsModelDto,
    voices: string[],
    names: Record<string, string>,
  ) => void
}) {
  const { t } = useTranslation()
  const [previewId, setPreviewId] = useState(draft.models[0]?.id ?? "")
  const preview =
    draft.models.find((model) => model.id === previewId) ?? draft.models[0]
  return (
    <TtsVoicesEditor
      actions={
        draft.models.length > 1 ? (
          <Field orientation="horizontal" className="w-auto">
            <FieldLabel htmlFor="voice-test-model">
              {t("providerEditor.testModel")}
            </FieldLabel>
            <Select value={preview?.id} onValueChange={setPreviewId}>
              <SelectTrigger id="voice-test-model" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {draft.models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.displayName ||
                        model.model ||
                        t("aiProviders.newModel")}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ) : null
      }
      draft={draft}
      model={preview}
      readOnly={readOnly}
      disabled={busy}
      onChange={(voices, names) => {
        if (preview) updateVoices(preview, voices, names)
        else onChange({ ...draft, voices, voiceNames: names })
      }}
    />
  )
}
