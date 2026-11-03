import { ModelDiscovery } from "@/components/settings/ModelDiscovery"
import { ProviderModels } from "@/components/settings/ProviderModels"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Cpu, Loader2 } from "lucide-react"
import { FormTextField } from "@/components/common/FormTextField"
import { FormScrollArea } from "@/components/common/FormScrollArea"
import { FormSelect, FormSelectItem } from "@/components/common/FormSelect"
import { FormPasswordField } from "@/components/common/FormPasswordField"
import { useProviderCredential } from "@/hooks/useProviderCredential"
import { AddPanelButton } from "@/components/common/AddPanelButton"
import { AppRow } from "@/components/common/AppRow"
import { RowActions } from "@/components/common/RowActions"
import { SaveButton } from "@/components/common/SaveButton"
import { SectionHeader } from "@/components/common/SectionHeader"
import { GroupList, GroupListItem } from "@/components/common/GroupList"
import {
  FlowDialogContent,
  FlowDialogHeader,
} from "@/components/common/FlowDialog"
import { Dialog, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FieldGroup, FieldError } from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import { useLlmSettings } from "@/hooks/use-llm-settings"
import { useFormValidation } from "@/hooks/useFormValidation"
import { errorMessage } from "@/lib/error-presentation"
import type { LlmProviderDto, LlmProfileInput } from "@/lib/tauri-specta"

const newModel = (model = "") => ({
  id: crypto.randomUUID(),
  model,

  contextWindow: 32768,
  maxOutputTokens: null,
})

const newProfile = (): LlmProviderDto => ({
  id: "",
  name: "",
  protocol: "chatCompletions",
  endpoint: "https://api.openai.com/v1",
  models: [newModel()],
  hasCredential: false,
})

export default function LlmSection() {
  const { t } = useTranslation()
  const settings = useLlmSettings()
  const { query, save, remove, select, models, probe, error } = settings
  const [draft, setDraft] = useState<LlmProviderDto | null>(null)
  const edit = (profile: LlmProviderDto) => {
    setDraft(profile)
    save.reset()
    remove.reset()
    models.reset()
    probe.reset()
  }
  return (
    <section aria-label={t("llm.title")}>
      <SectionHeader
        title={t("llm.title")}
        description={t("aiProviders.llmDescription")}
      />
      <div className="space-y-5">
        {query.isPending ? (
          <Loader2
            className="animate-spin"
            role="status"
            aria-label={t("common.loading")}
          />
        ) : null}
        {error && !draft ? (
          <FieldError>{errorMessage(error)}</FieldError>
        ) : null}
        <FormSelect
          value={query.data?.defaultProfileId ?? "none"}
          onValueChange={(id) => select.mutate(id === "none" ? null : id)}
          disabled={select.isPending}
          id="llm-default"
          label={t("llm.default")}
          labelMode="external"
        >
          <FormSelectItem value="none">{t("llm.none")}</FormSelectItem>
          {query.data?.profiles.map((profile) => (
            <FormSelectItem key={profile.id} value={profile.id}>
              {`${profile.name}/${profile.model}`}
            </FormSelectItem>
          ))}
        </FormSelect>
        {query.data?.providers.length ? (
          <GroupList>
            {query.data.providers.map((profile) => (
              <GroupListItem key={profile.id}>
                <AppRow
                  head={
                    <div className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
                      <Cpu className="size-4" />
                    </div>
                  }
                  body={profile.name}
                  detail={profile.models
                    .map((model) => model.model)
                    .join(" · ")}
                  actions={
                    <RowActions
                      name={profile.name}
                      disabled={remove.isPending}
                      onEdit={() => edit(profile)}
                      onDelete={async () => {
                        try {
                          await remove.mutateAsync(profile.id)
                        } finally {
                          remove.reset()
                        }
                      }}
                    />
                  }
                />
              </GroupListItem>
            ))}
          </GroupList>
        ) : null}
        <div className="overflow-hidden rounded-lg border border-dashed border-border">
          <AddPanelButton
            label={t("llm.add")}
            onClick={() => edit(newProfile())}
          />
        </div>
      </div>
      <Dialog
        open={Boolean(draft)}
        onOpenChange={(open) => {
          if (!open) setDraft(null)
        }}
      >
        <FlowDialogContent
          aria-describedby={undefined}
          className="sm:max-w-2xl"
        >
          <FlowDialogHeader
            title={draft?.id ? draft.name : t("llm.add")}
            backLabel={t("common.back")}
            closeLabel={t("common.close")}
            showCloseButton
          />
          <div className="min-h-0">
            {draft ? (
              <LlmProviderForm
                profile={draft}
                settings={settings}
                onClose={() => setDraft(null)}
              />
            ) : null}
          </div>
        </FlowDialogContent>
      </Dialog>
    </section>
  )
}

function LlmProviderForm({
  profile,
  settings,
  onClose,
}: {
  profile: LlmProviderDto
  settings: ReturnType<typeof useLlmSettings>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { save, models, probe, error } = settings
  const [draft, setDraft] = useState(profile)
  const { fieldErrors, validationProps } = useFormValidation(draft)
  const [selected, setSelected] = useState<number | null>(null)
  const model = draft.models[selected ?? 0]
  const setModel = (
    index: number,
    patch: Partial<LlmProviderDto["models"][number]>,
  ) =>
    setDraft({
      ...draft,
      models: draft.models.map((value, i) =>
        i === index ? { ...value, ...patch } : value,
      ),
    })
  const [showModels, setShowModels] = useState(false)
  const [credential, setCredential] = useState("")
  const clearCredential = !credential.trim()
  const storedCredential = useProviderCredential(
    "llm",
    profile.id,
    setCredential,
  )
  const [testedInput, setTestedInput] = useState<string | null>(null)
  const inputIdentity = JSON.stringify([draft, credential, clearCredential])
  const currentInput = useRef(inputIdentity)
  currentInput.current = inputIdentity
  const input = (): LlmProfileInput => ({
    profile: {
      ...draft,
      model: model?.model ?? "",
      contextWindow: model?.contextWindow ?? 32768,
      maxOutputTokens: model?.maxOutputTokens ?? null,
    },
    credential: credential || null,
    clearCredential,
  })
  const valid = validProfile(draft)
  const busy = save.isPending
  if (storedCredential.loading)
    return (
      <div className="px-6 py-5">
        {storedCredential.error ? (
          <FieldError>{storedCredential.error}</FieldError>
        ) : (
          <Loader2 className="size-5 animate-spin" role="status" />
        )}
      </div>
    )
  return (
    <form
      {...validationProps}
      className="flex h-full min-h-0 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        if (valid)
          save.mutate(
            {
              provider: draft,
              credential: credential || null,
              clearCredential,
            },
            { onSuccess: onClose },
          )
      }}
    >
      <FormScrollArea className="flex-1 space-y-5 px-6 py-5">
        {error ? <FieldError>{errorMessage(error)}</FieldError> : null}
        <FieldGroup className="gap-6">
          <FieldGroup className="gap-4">
            <FieldGroup className="grid grid-cols-2 gap-4">
              <FormTextField
                id="llm-name"
                label={t("llm.name")}
                value={draft.name}
                autoFocus
                required
                fullWidth
                error={Boolean(fieldErrors["llm-name"])}
                helperText={fieldErrors["llm-name"]}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
              <FormSelect
                id="llm-protocol"
                label={t("llm.protocol")}
                value={draft.protocol}
                onValueChange={(value) =>
                  setDraft({
                    ...draft,
                    protocol: value as LlmProviderDto["protocol"],
                  })
                }
              >
                <FormSelectItem value="chatCompletions">
                  Chat Completions
                </FormSelectItem>
                <FormSelectItem value="responses">Responses</FormSelectItem>
              </FormSelect>
            </FieldGroup>

            <FormTextField
              id="llm-endpoint"
              label={t("llm.endpoint")}
              type="url"
              value={draft.endpoint}
              required
              fullWidth
              autoComplete="off"
              error={Boolean(fieldErrors["llm-endpoint"])}
              helperText={fieldErrors["llm-endpoint"]}
              onChange={(event) =>
                setDraft({ ...draft, endpoint: event.target.value })
              }
            />

            <FieldGroup className="gap-4">
              <FormPasswordField
                id="llm-key"
                label={t("llm.key")}
                value={credential}
                fullWidth
                autoComplete="new-password"
                onChange={(event) => {
                  setCredential(event.target.value)
                }}
              />
            </FieldGroup>
          </FieldGroup>
          <Separator />
          <ProviderModels
            fieldErrors={fieldErrors}
            detailsClassName="col-span-1"
            discovery={
              showModels && models.data ? (
                <ModelDiscovery
                  models={models.data.map((id) => ({ id }))}
                  existing={draft.models.map((m) => m.model)}
                  onClose={() => setShowModels(false)}
                  onAdd={(ids) => {
                    setDraft({
                      ...draft,
                      models: [
                        ...draft.models.filter((m) => m.model.trim()),
                        ...ids
                          .filter(
                            (id) => !draft.models.some((m) => m.model === id),
                          )
                          .map(newModel),
                      ],
                    })
                    setSelected(null)
                    setShowModels(false)
                  }}
                />
              ) : null
            }
            models={draft.models}
            selected={selected}
            onSelect={setSelected}
            onChange={setModel}
            onAdd={() => {
              setDraft({ ...draft, models: [...draft.models, newModel()] })
              setSelected(null)
            }}
            onRemove={(index) => {
              setDraft({
                ...draft,
                models: draft.models.filter((_, i) => i !== index),
              })
              setSelected(null)
            }}
            actions={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!draft.name || !draft.endpoint || models.isPending}
                onClick={() =>
                  models.mutate(input(), {
                    onSuccess: () => {
                      if (currentInput.current === inputIdentity)
                        setShowModels(true)
                    },
                  })
                }
              >
                {models.isPending ? <Loader2 className="animate-spin" /> : null}
                {t("providerEditor.fetchModels")}
              </Button>
            }
          >
            {(index) => (
              <FieldGroup className="grid grid-cols-2 gap-3">
                <FormTextField
                  id={`llm-context-${draft.models[index].id}`}
                  label={t("llm.context")}
                  type="number"
                  required
                  fullWidth
                  slotProps={{ htmlInput: { min: 8192, max: 2000000 } }}
                  value={draft.models[index].contextWindow}
                  error={Boolean(
                    fieldErrors[`llm-context-${draft.models[index].id}`],
                  )}
                  helperText={
                    fieldErrors[`llm-context-${draft.models[index].id}`]
                  }
                  onChange={(event) =>
                    setModel(index, {
                      contextWindow: Number(event.target.value),
                    })
                  }
                />
                <FormTextField
                  id={`llm-output-${draft.models[index].id}`}
                  label={t("providerEditor.maxOutput")}
                  type="number"
                  fullWidth
                  slotProps={{
                    htmlInput: {
                      min: 1,
                      max: draft.models[index].contextWindow,
                    },
                  }}
                  placeholder={t("providerEditor.automatic")}
                  value={draft.models[index].maxOutputTokens ?? ""}
                  error={Boolean(
                    fieldErrors[`llm-output-${draft.models[index].id}`],
                  )}
                  helperText={
                    fieldErrors[`llm-output-${draft.models[index].id}`]
                  }
                  onChange={(event) =>
                    setModel(index, {
                      maxOutputTokens: event.target.value
                        ? Number(event.target.value)
                        : null,
                    })
                  }
                />
              </FieldGroup>
            )}
          </ProviderModels>
        </FieldGroup>
      </FormScrollArea>
      <DialogFooter className="shrink-0 flex-row items-center justify-between border-t border-border px-6 py-4 sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={!valid || probe.isPending}
            onClick={() =>
              probe.mutate(input(), {
                onSuccess: () => setTestedInput(inputIdentity),
              })
            }
          >
            {t("llm.test")}
          </Button>
          {probe.isSuccess && testedInput === inputIdentity ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t("llm.testPassed")}
            </p>
          ) : null}
        </div>
        <SaveButton disabled={!valid} saving={busy} />
      </DialogFooter>
    </form>
  )
}

function validProfile(profile: LlmProviderDto | null) {
  return Boolean(
    profile?.name.trim() &&
      profile.endpoint.trim() &&
      profile.models.length &&
      profile.models.every(
        (model) =>
          model.model.trim() &&
          model.contextWindow >= 8192 &&
          model.contextWindow <= 2000000 &&
          (model.maxOutputTokens == null ||
            (model.maxOutputTokens > 0 &&
              model.maxOutputTokens <= model.contextWindow)),
      ) &&
      new Set(profile.models.map((model) => model.model.trim())).size ===
        profile.models.length,
  )
}
