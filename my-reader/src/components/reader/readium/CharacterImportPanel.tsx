import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Check, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { FieldError } from "@/components/ui/field"
import { FormTextField } from "@/components/common/FormTextField"
import { CollapsibleSection } from "@/components/common/CollapsibleSection"
import { StreamingStatusLine } from "@/components/common/StreamingStatusLine"
import { useBookNarration } from "@/hooks/reader/use-book-narration"
import { errorMessage } from "@/lib/error-presentation"
import type {
  BookCharacterDto,
  CharacterDraftInputDto,
  CharacterSourceDto,
} from "@/lib/tauri-specta"
import type { CharacterIntroduction } from "@/lib/readium/characterIntroductions"
import type { NarrationBook } from "./BookNarrationSettings"

export type CharacterImportMode = "book" | "encyclopedia" | "prompt"
type Organize = (input: CharacterDraftInputDto) => void

export function CharacterImportPanel({
  book,
  mode,
  findIntroductions,
  saving,
  onImport,
}: {
  book: NarrationBook
  mode: CharacterImportMode
  findIntroductions?: () => Promise<CharacterIntroduction[]>
  saving: boolean
  onImport: (characters: BookCharacterDto[]) => void
}) {
  const { t } = useTranslation()
  const { draftCharacters, draftProgress } = useBookNarration(
    book.libraryId,
    book.bookId,
  )
  const [prompt, setPrompt] = useState("")
  const [candidates, setCandidates] = useState<BookCharacterDto[] | null>(null)
  const busy = draftCharacters.isPending || saving
  const organize: Organize = (input) =>
    draftCharacters.mutate({ book, input }, { onSuccess: setCandidates })
  return (
    <div className="flex flex-col gap-4">
      {draftCharacters.error ? (
        <FieldError>{errorMessage(draftCharacters.error)}</FieldError>
      ) : null}
      {candidates ? (
        <CharacterCandidates
          candidates={candidates}
          saving={saving}
          onImport={onImport}
        />
      ) : (
        <>
          {mode === "encyclopedia" ? (
            <EncyclopediaPicker book={book} busy={busy} onOrganize={organize} />
          ) : mode === "book" ? (
            <BookIntroductionPicker
              findIntroductions={findIntroductions}
              busy={busy}
              onOrganize={organize}
            />
          ) : (
            <>
              <FormTextField
                multiline
                minRows={6}
                maxRows={12}
                label={t("narration.prompt")}
                placeholder={t("narration.promptPlaceholder")}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
              <Button
                disabled={busy || !prompt.trim()}
                onClick={() => organize({ kind: "prompt", prompt })}
              >
                {t("narration.organize")}
              </Button>
            </>
          )}
          {draftCharacters.isPending ? (
            <StreamingStatusLine
              text={draftProgress}
              label={t("narration.organizing")}
            />
          ) : null}
        </>
      )}
    </div>
  )
}

function CharacterCandidates({
  candidates,
  saving,
  onImport,
}: {
  candidates: BookCharacterDto[]
  saving: boolean
  onImport: (characters: BookCharacterDto[]) => void
}) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState(
    new Set(
      candidates.flatMap((candidate, index) => (candidate.id ? [] : [index])),
    ),
  )
  return (
    <>
      {candidates.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("narration.noCandidates")}
        </p>
      ) : null}
      {candidates.map((candidate, index) => (
        <label
          key={`${candidate.name}:${index}`}
          className="flex items-start gap-3 py-1"
        >
          <Checkbox
            aria-label={
              candidate.id
                ? t("narration.replaceCharacter", { name: candidate.name })
                : candidate.name
            }
            checked={selected.has(index)}
            onCheckedChange={() =>
              setSelected((current) => toggleSelection(current, index))
            }
            disabled={saving}
          />
          <span className="min-w-0 text-sm">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{candidate.name}</span>
              {candidate.id ? (
                <Badge variant="secondary">
                  {t(
                    selected.has(index)
                      ? "narration.willReplace"
                      : "narration.alreadyExists",
                  )}
                </Badge>
              ) : null}
            </span>
            <span className="block whitespace-pre-wrap text-muted-foreground">
              {candidate.description}
            </span>
            {candidate.source ? (
              <a
                className="text-primary underline"
                href={candidate.source.url}
                target="_blank"
                rel="noreferrer"
              >
                {candidate.source.title}
              </a>
            ) : null}
          </span>
        </label>
      ))}
      <Button
        disabled={!selected.size || saving}
        onClick={() =>
          onImport(candidates.filter((_, index) => selected.has(index)))
        }
      >
        {saving ? <Loader2 className="animate-spin" /> : <Check />}
        {t("narration.importSelected")}
      </Button>
    </>
  )
}

function EncyclopediaPicker({
  book,
  busy,
  onOrganize,
}: {
  book: NarrationBook
  busy: boolean
  onOrganize: Organize
}) {
  const { t } = useTranslation()
  const { searchSources } = useBookNarration(book.libraryId, book.bookId)
  const [query, setQuery] = useState(book.title)
  const [sources, setSources] = useState<CharacterSourceDto[] | null>(null)
  const [selected, setSelected] = useState<CharacterSourceDto | null>(null)
  const disabled = busy || searchSources.isPending
  return (
    <>
      <form
        className="flex items-start gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!query.trim() || disabled) return
          setSelected(null)
          setSources(null)
          searchSources.mutate(
            { ...book, title: query.trim() },
            { onSuccess: setSources },
          )
        }}
      >
        <FormTextField
          label={t("narration.searchQuery")}
          value={query}
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value)
            setSources(null)
            setSelected(null)
          }}
        />
        <Button type="submit" disabled={disabled || !query.trim()}>
          <Search />
          {t("narration.search")}
        </Button>
      </form>
      {searchSources.error ? (
        <FieldError>{errorMessage(searchSources.error)}</FieldError>
      ) : null}
      {searchSources.isPending ? <ImportStatus /> : null}
      {sources?.length ? (
        <p className="text-sm text-muted-foreground">
          {t("narration.chooseSource")}
        </p>
      ) : null}
      {sources?.map((source) => (
        <Button
          key={source.url}
          variant="ghost"
          className="h-auto justify-start whitespace-normal py-3 text-left"
          aria-pressed={selected?.url === source.url}
          disabled={disabled}
          onClick={() => setSelected(source)}
        >
          <Check
            className={
              selected?.url === source.url ? "text-primary" : "invisible"
            }
          />
          <span>{source.title}</span>
        </Button>
      ))}
      {sources?.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("narration.noSources")}
        </p>
      ) : null}
      <Button
        disabled={disabled || !selected}
        onClick={() => {
          if (selected) onOrganize({ kind: "encyclopedia", source: selected })
        }}
      >
        {t("narration.organize")}
      </Button>
    </>
  )
}

function BookIntroductionPicker({
  findIntroductions,
  busy,
  onOrganize,
}: {
  findIntroductions?: () => Promise<CharacterIntroduction[]>
  busy: boolean
  onOrganize: Organize
}) {
  const { t } = useTranslation()
  const [passages, setPassages] = useState<CharacterIntroduction[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    let active = true
    void (findIntroductions?.() ?? Promise.resolve([]))
      .then((values) => {
        if (!active) return
        setPassages(values)
        setSelected(new Set(values.map((_, index) => index)))
      })
      .catch((error: unknown) => {
        if (active) setError(error)
      })
    return () => {
      active = false
    }
  }, [findIntroductions])
  return (
    <>
      {error ? <FieldError>{errorMessage(error)}</FieldError> : null}
      {!passages && !error ? <ImportStatus /> : null}
      {passages?.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("narration.noBookIntroduction")}
        </p>
      ) : null}
      {passages?.map((passage, index) => (
        <PassagePreview
          key={passage.id}
          passage={passage}
          selected={selected.has(index)}
          disabled={busy}
          onSelect={() =>
            setSelected((current) => toggleSelection(current, index))
          }
        />
      ))}
      <Button
        disabled={busy || !selected.size}
        onClick={() =>
          onOrganize({
            kind: "book",
            passages: (passages ?? [])
              .filter((_, index) => selected.has(index))
              .map(({ title, text }) => ({ title, text })),
          })
        }
      >
        {t("narration.organize")}
      </Button>
    </>
  )
}

function PassagePreview({
  passage,
  selected,
  disabled,
  onSelect,
}: {
  passage: CharacterIntroduction
  selected: boolean
  disabled: boolean
  onSelect: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        className="mt-2"
        aria-label={passage.title}
        checked={selected}
        disabled={disabled}
        onCheckedChange={onSelect}
      />
      <div className="min-w-0 flex-1">
        <CollapsibleSection
          title={passage.title}
          open={open}
          onOpenChange={setOpen}
        >
          <p className="max-h-56 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
            {passage.text}
          </p>
        </CollapsibleSection>
      </div>
    </div>
  )
}

function ImportStatus() {
  const { t } = useTranslation()
  return (
    <p
      role="status"
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <Loader2 className="size-4 animate-spin" />
      {t("narration.importing")}
    </p>
  )
}

function toggleSelection(current: Set<number>, index: number) {
  const next = new Set(current)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  return next
}
