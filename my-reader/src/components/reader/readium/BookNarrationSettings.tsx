import type { TFunction } from "i18next"
import { NarrationMergeEditor } from "./NarrationMergeEditor"
import { useCallback, useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
} from "@/components/ui/dialog"
import { useBookNarration } from "@/hooks/reader/use-book-narration"
import { api } from "@/lib/tauri-api"
import { errorMessage } from "@/lib/error-presentation"
import type {
  BookCharacterDto,
  CharacterImportCandidateDto,
  NarrationMergePlanDto,
  TtsConfigDto,
} from "@/lib/tauri-specta"

export type NarrationSubview = { title: string; onBack: () => void }

export type NarrationBook = {
  libraryId: string
  bookId: number
  title: string
  authors: string[]
  language: string
}

export function BookNarrationSettings({
  book,
  config,
  onSubviewChange,
}: {
  book: NarrationBook
  config: TtsConfigDto
  onSubviewChange?: (view: NarrationSubview | null) => void
}) {
  const { t } = useTranslation()
  const { query, save, importCharacters, previewMerge, merge } =
    useBookNarration(book.libraryId, book.bookId)
  const [confirmEnable, setConfirmEnable] = useState(false)
  const [enableError, setEnableError] = useState<string | null>(null)
  const [subview, setSubview] = useState<NarrationSubview | null>(null)
  const changeSubview = useCallback(
    (view: NarrationSubview | null) => {
      setSubview(view)
      onSubviewChange?.(view)
    },
    [onSubviewChange],
  )
  const settings = query.data
  const error =
    save.error ??
    importCharacters.error ??
    previewMerge.error ??
    merge.error ??
    query.error
  if (!settings)
    return error ? <FieldError>{errorMessage(error)}</FieldError> : null
  return (
    <section className="flex flex-col gap-3">
      {!subview ? (
        <Field orientation="horizontal">
          <FieldLabel htmlFor="narration-enabled">
            {t("narration.enabled")}
          </FieldLabel>
          <Switch
            id="narration-enabled"
            checked={settings.enabled}
            disabled={save.isPending}
            onCheckedChange={(enabled) => {
              setEnableError(null)
              if (!enabled) {
                save.mutate({ ...settings, enabled })
                return
              }
              void api
                .getLlmConfig()
                .then((config) => {
                  if (!config.defaultProfileId)
                    setEnableError(t("narration.llmRequired"))
                  else setConfirmEnable(true)
                })
                .catch((value) => setEnableError(errorMessage(value)))
            }}
          />
        </Field>
      ) : null}
      {enableError ? <FieldError>{enableError}</FieldError> : null}
      {error ? <FieldError>{errorMessage(error)}</FieldError> : null}
      <Dialog open={confirmEnable} onOpenChange={setConfirmEnable}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("narration.enabled")}</DialogTitle>
            <DialogDescription>{t("narration.enableNotice")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmEnable(false)}>
              {t("llm.cancel")}
            </Button>
            <Button
              onClick={() => {
                setConfirmEnable(false)
                save.mutate({ ...settings, enabled: true })
              }}
            >
              {t("narration.enableConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {settings.enabled && settings.scopeName && !subview ? (
        <p className="text-sm text-muted-foreground">
          {t("narration.series", { name: settings.scopeName })}
        </p>
      ) : null}
      {settings.enabled ? (
        <BookCharacters
          book={book}
          config={config}
          settings={settings}
          save={save}
          importCharacters={importCharacters}
          previewMerge={previewMerge}
          merge={merge}
          onSubviewChange={changeSubview}
        />
      ) : null}
    </section>
  )
}

function BookCharacters({
  book,
  config,
  settings,
  save,
  importCharacters,
  previewMerge,
  merge,
  onSubviewChange,
}: {
  book: NarrationBook
  config: TtsConfigDto
  settings: NonNullable<ReturnType<typeof useBookNarration>["query"]["data"]>
  save: ReturnType<typeof useBookNarration>["save"]
  importCharacters: ReturnType<typeof useBookNarration>["importCharacters"]
  previewMerge: ReturnType<typeof useBookNarration>["previewMerge"]
  merge: ReturnType<typeof useBookNarration>["merge"]
  onSubviewChange?: (view: NarrationSubview | null) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<BookCharacterDto | null>(null)
  const [candidates, setCandidates] = useState<
    CharacterImportCandidateDto[] | null
  >(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [mergePlan, setMergePlan] = useState<NarrationMergePlanDto | null>(null)
  const subviewTitle = characterSubviewTitle(
    draft,
    Boolean(candidates),
    Boolean(mergePlan),
    t,
  )
  useEffect(() => {
    onSubviewChange?.(
      subviewTitle
        ? {
            title: subviewTitle,
            onBack: () => {
              setDraft(null)
              setCandidates(null)
              setMergePlan(null)
            },
          }
        : null,
    )
    return () => onSubviewChange?.(null)
  }, [subviewTitle, onSubviewChange])
  const commit = (characters: BookCharacterDto[]) =>
    save.mutate(
      { ...settings, characters },
      {
        onSuccess: () => {
          setDraft(null)
          setCandidates(null)
        },
      },
    )
  if (mergePlan)
    return (
      <NarrationMergeEditor
        settings={settings}
        plan={mergePlan}
        onChange={setMergePlan}
        onCancel={() => setMergePlan(null)}
        saving={merge.isPending}
        onSave={() =>
          merge.mutate(mergePlan, {
            onSuccess: () => {
              setMergePlan(null)
            },
          })
        }
      />
    )
  if (settings.mergeSources.length > 0)
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">{t("narration.merge")}</p>
        <Button
          disabled={previewMerge.isPending}
          onClick={() => previewMerge.mutate(true, { onSuccess: setMergePlan })}
        >
          {t("narration.autoMerge")}
        </Button>
        <Button
          variant="outline"
          disabled={previewMerge.isPending}
          onClick={() =>
            previewMerge.mutate(false, { onSuccess: setMergePlan })
          }
        >
          {t("narration.manualMerge")}
        </Button>
      </div>
    )
  return draft ? (
    <CharacterEditor
      character={draft}
      config={config}
      saving={save.isPending}
      onCancel={() => setDraft(null)}
      onSave={(character) =>
        commit(
          draft.id
            ? settings.characters.map((value) =>
                value.id === draft.id ? character : value,
              )
            : [...settings.characters, character],
        )
      }
      onDelete={
        draft.id && draft.id !== "narrator"
          ? () =>
              commit(
                settings.characters.filter((value) => value.id !== draft.id),
              )
          : undefined
      }
    />
  ) : candidates ? (
    <div className="flex flex-col gap-3">
      {candidates.map((candidate, index) => (
        <label
          key={`${candidate.source.url}:${candidate.name}`}
          className="flex items-start gap-2"
        >
          <input
            type="checkbox"
            checked={selected.has(index)}
            onChange={(event) =>
              setSelected((current) => {
                const next = new Set(current)
                if (event.target.checked) next.add(index)
                else next.delete(index)
                return next
              })
            }
          />
          <span className="text-sm">
            <span className="font-medium">{candidate.name}</span>
            <span className="block text-muted-foreground">
              {candidate.identity}
            </span>
            <a
              className="text-primary underline"
              href={candidate.source.url}
              target="_blank"
              rel="noreferrer"
            >
              {candidate.source.title}
            </a>
          </span>
        </label>
      ))}
      <Button
        disabled={selected.size === 0 || save.isPending}
        onClick={() =>
          commit([
            ...settings.characters,
            ...candidates
              .filter((_, index) => selected.has(index))
              .filter(
                (candidate) =>
                  !settings.characters.some(
                    (character) =>
                      character.name === candidate.name ||
                      character.aliases.includes(candidate.name),
                  ),
              )
              .map((candidate) => ({
                ...candidate,
                id: "",
                voice: null,
                instructions: "",
              })),
          ])
        }
      >
        {t("narration.importSelected")}
      </Button>
      <Button variant="ghost" onClick={() => setCandidates(null)}>
        {t("llm.cancel")}
      </Button>
    </div>
  ) : (
    <>
      <div className="flex flex-col gap-1">
        {settings.characters.map((character) => (
          <Button
            key={character.id}
            variant="ghost"
            className="justify-between"
            onClick={() => setDraft(character)}
          >
            <span>
              {character.id === "narrator"
                ? t("narration.narrator")
                : character.name}
            </span>
            <span className="truncate text-muted-foreground">
              {character.voice?.voiceId || t("narration.defaultVoice")}
            </span>
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() =>
            setDraft({
              id: "",
              name: "",
              aliases: [],
              identity: "",
              voice: null,
              instructions: "",
              source: null,
            })
          }
        >
          {t("narration.add")}
        </Button>
        <Button
          variant="outline"
          disabled={importCharacters.isPending}
          onClick={() =>
            importCharacters.mutate(
              {
                bookId: book.bookId,
                title: book.title,
                authors: book.authors,
                language: book.language,
              },
              {
                onSuccess: (values) => {
                  setCandidates(values)
                  setSelected(new Set(values.map((_, index) => index)))
                },
              },
            )
          }
        >
          {t(
            importCharacters.isPending
              ? "narration.importing"
              : "narration.import",
          )}
        </Button>
      </div>
    </>
  )
}

function CharacterEditor({
  character,
  config,
  saving,
  onSave,
  onCancel,
  onDelete,
}: {
  character: BookCharacterDto
  config: TtsConfigDto
  saving: boolean
  onSave: (value: BookCharacterDto) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(character)
  const [aliases, setAliases] = useState(character.aliases.join(", "))
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([])
  const provider =
    draft.voice?.engine === "provider" ? draft.voice.profileId : null
  const voices = useQuery({
    queryKey: ["tts-voices", provider],
    queryFn: () => api.listTtsVoices(provider!),
    enabled: Boolean(provider),
  })
  useEffect(() => {
    const update = () =>
      setSystemVoices(window.speechSynthesis?.getVoices() ?? [])
    update()
    window.speechSynthesis?.addEventListener("voiceschanged", update)
    return () =>
      window.speechSynthesis?.removeEventListener("voiceschanged", update)
  }, [])
  const valid = Boolean(
    draft.name.trim() && (!provider || draft.voice?.voiceId),
  )
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (valid)
          onSave({
            ...draft,
            aliases: aliases
              .split(/[,，\n]/u)
              .map((value) => value.trim())
              .filter(Boolean),
          })
      }}
    >
      <FieldGroup>
        {draft.id !== "narrator" ? (
          <>
            <Field>
              <FieldLabel htmlFor="character-name">
                {t("narration.name")}
              </FieldLabel>
              <Input
                id="character-name"
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="character-aliases">
                {t("narration.aliases")}
              </FieldLabel>
              <Input
                id="character-aliases"
                value={aliases}
                onChange={(event) => setAliases(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="character-identity">
                {t("narration.identity")}
              </FieldLabel>
              <Input
                id="character-identity"
                value={draft.identity}
                onChange={(event) =>
                  setDraft({ ...draft, identity: event.target.value })
                }
              />
            </Field>
          </>
        ) : null}
        <Field>
          <FieldLabel htmlFor="character-provider">
            {t("narration.provider")}
          </FieldLabel>
          <Select
            value={
              provider ??
              (draft.voice?.engine === "system" ? "system" : "default")
            }
            onValueChange={(value) =>
              setDraft({
                ...draft,
                voice:
                  value === "default"
                    ? null
                    : value === "system"
                      ? { engine: "system", voiceId: "" }
                      : { engine: "provider", profileId: value, voiceId: "" },
              })
            }
          >
            <SelectTrigger id="character-provider" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="default">
                  {t("narration.defaultVoice")}
                </SelectItem>
                <SelectItem value="system">{t("narration.system")}</SelectItem>
                {config.profiles
                  .filter((profile) => profile.enabled)
                  .map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {draft.voice ? (
          <Field>
            <FieldLabel htmlFor="character-voice">
              {t("narration.voice")}
            </FieldLabel>
            <Select
              value={draft.voice.voiceId || "default"}
              onValueChange={(voiceId) =>
                setDraft({
                  ...draft,
                  voice: {
                    ...draft.voice!,
                    voiceId: voiceId === "default" ? "" : voiceId,
                  },
                })
              }
            >
              <SelectTrigger id="character-voice" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="default" disabled={Boolean(provider)}>
                    {t("narration.defaultVoice")}
                  </SelectItem>
                  {provider
                    ? voices.data?.map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          {voice.name}
                        </SelectItem>
                      ))
                    : systemVoices.map((voice) => (
                        <SelectItem key={voice.voiceURI} value={voice.voiceURI}>
                          {voice.name}
                        </SelectItem>
                      ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        {voices.error ? (
          <FieldError>{errorMessage(voices.error)}</FieldError>
        ) : null}
        <Field>
          <FieldLabel htmlFor="character-instructions">
            {t("narration.instructions")}
          </FieldLabel>
          <Input
            id="character-instructions"
            value={draft.instructions}
            disabled={draft.voice?.engine === "system"}
            onChange={(event) =>
              setDraft({ ...draft, instructions: event.target.value })
            }
          />
        </Field>
      </FieldGroup>
      {draft.source ? (
        <a
          className="text-xs text-primary underline"
          href={draft.source.url}
          target="_blank"
          rel="noreferrer"
        >
          {draft.source.title}
        </a>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!valid || saving}>{t("llm.save")}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("llm.cancel")}
        </Button>
        {onDelete ? (
          <Button
            type="button"
            variant="destructive"
            disabled={saving}
            onClick={onDelete}
          >
            {t("narration.delete")}
          </Button>
        ) : null}
      </div>
    </form>
  )
}

function characterSubviewTitle(
  character: { id: string; name: string } | null,
  importing: boolean,
  merging: boolean,
  t: TFunction,
) {
  if (character)
    return character.id === "narrator"
      ? t("narration.narrator")
      : character.name || t("narration.add")
  if (importing) return t("narration.import")
  if (merging) return t("narration.merge")
  return null
}
