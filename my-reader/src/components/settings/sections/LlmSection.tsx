import { ModelDiscovery } from "@/components/settings/ModelDiscovery"
import { ProviderModels } from "@/components/settings/ProviderModels"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Cpu, Pencil, Loader2 } from "lucide-react"
import { AddPanelButton } from "@/components/common/AddPanelButton"
import { AppRow } from "@/components/common/AppRow"
import { GroupList, GroupListItem } from "@/components/common/GroupList"
import {
  FlowDialogContent,
  FlowDialogHeader,
} from "@/components/common/FlowDialog"
import { Dialog, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useLlmSettings } from "@/hooks/use-llm-settings"
import { errorMessage } from "@/lib/error-presentation"
import type { LlmProviderDto, LlmProfileInput } from "@/lib/tauri-specta"

const newModel = (model = "") => ({
  id: crypto.randomUUID(),
  model,
  displayName: "",
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-7 py-5">
        <h1 className="text-xl font-semibold">{t("llm.title")}</h1>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-7 py-5">
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
        <GroupList>
          <GroupListItem>
            <AppRow
              body={t("llm.default")}
              className="items-center"
              tail={
                <Select
                  value={query.data?.defaultProfileId ?? "none"}
                  onValueChange={(id) =>
                    select.mutate(id === "none" ? null : id)
                  }
                  disabled={select.isPending}
                >
                  <SelectTrigger
                    id="llm-default"
                    aria-label={t("llm.default")}
                    className="w-52"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">{t("llm.none")}</SelectItem>
                      {query.data?.profiles.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {`${profile.name}/${query.data?.providers.flatMap((provider) => provider.models).find((model) => model.id === profile.id)?.displayName || profile.model}`}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              }
            />
          </GroupListItem>
        </GroupList>
        {query.data?.providers.length ? (
          <GroupList>
            {query.data.providers.map((profile) => (
              <GroupListItem key={profile.id} className="p-0 hover:bg-accent">
                <button
                  type="button"
                  className="w-full px-4 py-3 text-start"
                  aria-label={`${t("llm.edit")} ${profile.name}`}
                  onClick={() => edit(profile)}
                >
                  <AppRow
                    head={
                      <div className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
                        <Cpu className="size-4" />
                      </div>
                    }
                    body={profile.name}
                    detail={profile.models
                      .map((model) => model.displayName || model.model)
                      .join(" · ")}
                    tail={<Pencil className="size-3.5 text-muted-foreground" />}
                  />
                </button>
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
    </div>
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
  const { save, remove, models, probe, error } = settings
  const [draft, setDraft] = useState(profile)
  const [selected, setSelected] = useState<number | null>(0)
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
  const [clearCredential, setClearCredential] = useState(false)
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
  const busy = save.isPending || remove.isPending
  return (
    <form
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
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        {error ? <FieldError>{errorMessage(error)}</FieldError> : null}
        <FieldGroup className="gap-6">
          <GroupList>
            <GroupListItem>
              <FieldGroup className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="llm-name">{t("llm.name")}</FieldLabel>
                  <Input
                    id="llm-name"
                    value={draft.name}
                    autoFocus
                    required
                    onChange={(event) =>
                      setDraft({ ...draft, name: event.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="llm-protocol">
                    {t("llm.protocol")}
                  </FieldLabel>
                  <Select
                    value={draft.protocol}
                    onValueChange={(value) =>
                      setDraft({
                        ...draft,
                        protocol: value as LlmProviderDto["protocol"],
                      })
                    }
                  >
                    <SelectTrigger id="llm-protocol" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="chatCompletions">
                          Chat Completions
                        </SelectItem>
                        <SelectItem value="responses">Responses</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
            </GroupListItem>
            <GroupListItem>
              <Field>
                <FieldLabel htmlFor="llm-endpoint">
                  {t("llm.endpoint")}
                </FieldLabel>
                <Input
                  id="llm-endpoint"
                  type="url"
                  value={draft.endpoint}
                  required
                  autoComplete="off"
                  onChange={(event) =>
                    setDraft({ ...draft, endpoint: event.target.value })
                  }
                />
              </Field>
            </GroupListItem>
            <GroupListItem>
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="llm-key">{t("llm.key")}</FieldLabel>
                  <Input
                    id="llm-key"
                    type="password"
                    value={credential}
                    autoComplete="new-password"
                    placeholder={draft.hasCredential ? t("llm.keySaved") : ""}
                    onChange={(event) => {
                      setCredential(event.target.value)
                      setClearCredential(false)
                    }}
                  />
                </Field>
                {draft.hasCredential ? (
                  <Field orientation="horizontal">
                    <FieldLabel htmlFor="llm-clear-key">
                      {t("llm.clearKey")}
                    </FieldLabel>
                    <Switch
                      id="llm-clear-key"
                      checked={clearCredential}
                      onCheckedChange={setClearCredential}
                    />
                  </Field>
                ) : null}
              </FieldGroup>
            </GroupListItem>
          </GroupList>
          <ProviderModels
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
              setSelected(draft.models.length)
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
              <FieldGroup className="grid grid-cols-2 gap-3 pr-22">
                <Field>
                  <FieldLabel
                    className="border-l border-transparent pl-3"
                    htmlFor="llm-context"
                  >
                    {t("llm.context")}
                  </FieldLabel>
                  <Input
                    id="llm-context"
                    type="number"
                    min={8192}
                    max={2000000}
                    value={draft.models[index].contextWindow}
                    onChange={(event) =>
                      setModel(index, {
                        contextWindow: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel
                    className="border-l border-transparent pl-3"
                    htmlFor="llm-output"
                  >
                    {t("providerEditor.maxOutput")}
                  </FieldLabel>
                  <Input
                    id="llm-output"
                    type="number"
                    min={1}
                    max={draft.models[index].contextWindow}
                    placeholder={t("providerEditor.automatic")}
                    value={draft.models[index].maxOutputTokens ?? ""}
                    onChange={(event) =>
                      setModel(index, {
                        maxOutputTokens: event.target.value
                          ? Number(event.target.value)
                          : null,
                      })
                    }
                  />
                </Field>
              </FieldGroup>
            )}
          </ProviderModels>
        </FieldGroup>
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
      <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t("llm.cancel")}
        </Button>
        {draft.id ? (
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => remove.mutate(draft.id, { onSuccess: onClose })}
          >
            {t("llm.delete")}
          </Button>
        ) : null}
        <Button type="submit" disabled={!valid || busy}>
          {t("llm.save")}
        </Button>
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
