import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Plus, Pencil, Loader2 } from "lucide-react"
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
import type { LlmProfileDto, LlmProfileInput } from "@/lib/tauri-specta"

const newProfile = (): LlmProfileDto => ({
  id: "",
  name: "",
  protocol: "chatCompletions",
  endpoint: "https://api.openai.com/v1",
  model: "",
  contextWindow: 32768,
  hasCredential: false,
})

export default function LlmSection() {
  const { t } = useTranslation()
  const { query, save, remove, select, models, probe, error } = useLlmSettings()
  const [draft, setDraft] = useState<LlmProfileDto | null>(null)
  const [credential, setCredential] = useState("")
  const [clearCredential, setClearCredential] = useState(false)
  const [testedInput, setTestedInput] = useState<string | null>(null)
  const inputIdentity = JSON.stringify([draft, credential, clearCredential])
  const edit = (profile: LlmProfileDto) => {
    setDraft(profile)
    setCredential("")
    setClearCredential(false)
    save.reset()
    remove.reset()
    models.reset()
    probe.reset()
  }
  const input = (): LlmProfileInput => ({
    profile: draft!,
    credential: credential || null,
    clearCredential,
  })
  const valid = validProfile(draft)
  const busy = save.isPending || remove.isPending
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
      <h1 className="text-xl font-semibold">{t("llm.title")}</h1>
      {query.isPending ? (
        <Loader2
          className="animate-spin"
          role="status"
          aria-label={t("common.loading")}
        />
      ) : null}
      {error ? <FieldError>{errorMessage(error)}</FieldError> : null}
      {draft ? (
        <form
          className="flex max-w-xl flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (valid) save.mutate(input(), { onSuccess: () => setDraft(null) })
          }}
        >
          <FieldGroup>
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
                    protocol: value as LlmProfileDto["protocol"],
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
            <Field>
              <FieldLabel htmlFor="llm-model">{t("llm.model")}</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="llm-model"
                  list="llm-models"
                  value={draft.model}
                  required
                  onChange={(event) =>
                    setDraft({ ...draft, model: event.target.value })
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!draft.name || !draft.endpoint || models.isPending}
                  onClick={() => models.mutate(input())}
                >
                  {t("llm.models")}
                </Button>
              </div>
              <datalist id="llm-models">
                {models.data?.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </Field>
          </FieldGroup>
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">
              {t("llm.advanced")}
            </summary>
            <Field className="mt-3">
              <FieldLabel htmlFor="llm-context">{t("llm.context")}</FieldLabel>
              <Input
                id="llm-context"
                type="number"
                min={8192}
                max={2000000}
                value={draft.contextWindow}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    contextWindow: Number(event.target.value),
                  })
                }
              />
            </Field>
          </details>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={!valid || busy}>
              {t("llm.save")}
            </Button>
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
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDraft(null)}
            >
              {t("llm.cancel")}
            </Button>
            {draft.id ? (
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  remove.mutate(draft.id, { onSuccess: () => setDraft(null) })
                }
              >
                {t("llm.delete")}
              </Button>
            ) : null}
          </div>
          {probe.isSuccess && testedInput === inputIdentity ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t("llm.testPassed")}
            </p>
          ) : null}
        </form>
      ) : (
        <div className="flex max-w-xl flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="llm-default">{t("llm.default")}</FieldLabel>
            <Select
              value={query.data?.defaultProfileId ?? "none"}
              onValueChange={(id) => select.mutate(id === "none" ? null : id)}
              disabled={select.isPending}
            >
              <SelectTrigger id="llm-default" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">{t("llm.none")}</SelectItem>
                  {query.data?.profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {query.data?.profiles.map((profile) => (
            <div
              key={profile.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="font-medium">{profile.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {profile.model}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`${t("llm.edit")} ${profile.name}`}
                onClick={() => edit(profile)}
              >
                <Pencil />
              </Button>
            </div>
          ))}
          <Button className="self-start" onClick={() => edit(newProfile())}>
            <Plus />
            {t("llm.add")}
          </Button>
        </div>
      )}
    </div>
  )
}

function validProfile(
  profile: { name: string; endpoint: string; model: string } | null,
) {
  return Boolean(
    profile?.name.trim() && profile.endpoint.trim() && profile.model.trim(),
  )
}
