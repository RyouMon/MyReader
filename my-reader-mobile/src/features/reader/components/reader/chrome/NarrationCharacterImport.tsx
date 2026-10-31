import { useEffect, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Linking } from "react-native"
import { Button } from "@/src/components"
import { StreamingStatusLine } from "@/src/components/streaming-status-line"
import { StatusBadge } from "@/src/components/ui/status-badge"
import {
  readerFormColors,
  type ReaderChromePalette,
} from "@/src/design/reader-chrome-palette"
import { useThemePalette } from "@/src/design/tokens"
import { useCharacterDraft } from "@/src/domain/llm/use-character-draft"
import type {
  BookCharacter,
  CharacterDraftInput,
  CharacterSource,
  CharacterPassage,
} from "@/src/services/core/narration"
import { errorMessage } from "@/src/i18n/error-message"
import {
  findCharacterIntroductions,
  type CharacterIntroduction,
} from "@/src/features/reader/lib/character-introductions"
import { Text, View } from "@/tw"
import type { NarrationBook } from "./BookNarrationSettings"
import { ReaderChoiceRow } from "./ReaderChoiceRow"
import { ReaderSelectAllButton } from "./ReaderListSelectionControls"
import { ReaderSheetFooter, ReaderSheetPage } from "./ReaderSheetPage"
import { ProviderTextField } from "./ReaderTtsSettingsFields"

export type CharacterImportMode = "book" | "encyclopedia" | "prompt"

export function NarrationCharacterImport({
  book,
  mode,
  palette,
  saving,
  error,
  onCancel,
  onImport,
  onHeaderActionChange,
}: {
  book: NarrationBook
  mode: CharacterImportMode
  palette: ReaderChromePalette
  saving: boolean
  error?: string
  onCancel: () => void
  onImport: (characters: BookCharacter[]) => void
  onHeaderActionChange?: (action: ReactNode) => void
}) {
  const { t } = useTranslation()
  const theme = useThemePalette()
  const { searchSources, draftCharacters, progress, cancelDraft } =
    useCharacterDraft(book.library, {
      bookId: book.bookId,
      title: book.title,
      authors: book.authors,
      language: book.language,
    })
  const [query, setQuery] = useState(book.title)
  const [prompt, setPrompt] = useState("")
  const [sourceIndex, setSourceIndex] = useState<number | null>(null)
  const [passages, setPassages] = useState<Set<number>>(new Set())
  const [candidates, setCandidates] = useState<BookCharacter[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const search = searchSources.mutate
  useEffect(() => {
    if (mode === "encyclopedia") search(book.title)
  }, [mode, book.title, search])
  const introductions = useQuery({
    queryKey: ["character-introductions", book.publicationId],
    queryFn: ({ signal }) =>
      findCharacterIntroductions(book.publicationId!, signal),
    enabled: mode === "book" && Boolean(book.publicationId),
    retry: false,
  })
  const organizing = draftCharacters.isPending
  const searching =
    searchSources.isPending || (mode === "book" && introductions.isFetching)
  const busy = organizing || searching || saving
  useEffect(() => {
    onHeaderActionChange?.(
      mode === "encyclopedia" && !candidates ? (
        <Button
          title={t("narration.search")}
          variant="ghost"
          size="sm"
          icon={{ ios: "magnifyingglass", android: "search" }}
          disabled={busy || !query.trim()}
          colors={{
            textColor: palette.accentText,
            underlayColor: palette.segmentActive,
          }}
          onPress={() => {
            setSourceIndex(null)
            search(query.trim())
          }}
        />
      ) : null,
    )
    return () => onHeaderActionChange?.(null)
  }, [
    onHeaderActionChange,
    mode,
    candidates,
    busy,
    query,
    search,
    t,
    palette.accentText,
    palette.segmentActive,
  ])
  const source =
    sourceIndex === null ? undefined : searchSources.data?.[sourceIndex]
  const selectedPassages = (introductions.data ?? []).filter((_, index) =>
    passages.has(index),
  )
  const input = draftInput(mode, prompt, source, selectedPassages)
  const failure =
    draftCharacters.error ?? searchSources.error ?? introductions.error
  const message = importError(error, failure)
  const organize = () => {
    if (!input) return
    draftCharacters.mutate(input, {
      onSuccess: (values) => {
        setCandidates(values)
        setSelected(
          new Set(values.flatMap((value, index) => (value.id ? [] : [index]))),
        )
      },
    })
  }
  return (
    <ReaderSheetPage
      footer={
        <CharacterImportFooter
          palette={palette}
          organizing={organizing}
          searching={searching}
          saving={saving}
          progress={progress}
          candidates={candidates}
          selected={selected}
          setSelected={setSelected}
          canOrganize={Boolean(input)}
          onCancel={organizing ? cancelDraft : onCancel}
          onImport={onImport}
          organize={organize}
        />
      }
    >
      {message ? (
        <Text
          selectable
          accessibilityRole="alert"
          style={{ color: theme.danger }}
        >
          {message}
        </Text>
      ) : null}
      {candidates ? (
        <CharacterCandidates
          candidates={candidates}
          selected={selected}
          disabled={saving}
          palette={palette}
          onToggle={(index) => setSelected((current) => toggle(current, index))}
        />
      ) : (
        <ImportFields
          mode={mode}
          palette={palette}
          busy={busy}
          prompt={prompt}
          setPrompt={setPrompt}
          query={query}
          setQuery={setQuery}
          sources={searchSources.data}
          sourcesLoaded={searchSources.isSuccess}
          sourceIndex={sourceIndex}
          setSourceIndex={setSourceIndex}
          introductions={introductions.data}
          showMissingIntroduction={!searching && !introductions.error}
          passages={passages}
          togglePassage={(index) =>
            setPassages((current) => toggle(current, index))
          }
        />
      )}
    </ReaderSheetPage>
  )
}

function toggle(current: Set<number>, index: number) {
  const next = new Set(current)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  return next
}

function draftInput(
  mode: CharacterImportMode,
  prompt: string,
  source: CharacterSource | undefined,
  passages: CharacterPassage[],
): CharacterDraftInput | null {
  if (mode === "prompt")
    return prompt.trim() ? { kind: "prompt", prompt } : null
  if (mode === "encyclopedia")
    return source ? { kind: "encyclopedia", source } : null
  return passages.length
    ? {
        kind: "book",
        passages: passages.map(({ title, text }) => ({ title, text })),
      }
    : null
}

function CharacterCandidates({
  candidates,
  selected,
  disabled,
  palette,
  onToggle,
}: {
  candidates: BookCharacter[]
  selected: Set<number>
  disabled: boolean
  palette: ReaderChromePalette
  onToggle: (index: number) => void
}) {
  const { t } = useTranslation()
  return (
    <View>
      {candidates.length === 0 ? (
        <Text style={{ color: palette.textMuted }}>
          {t("narration.noCandidates")}
        </Text>
      ) : null}
      {candidates.map((candidate, index) => (
        <ReaderChoiceRow
          key={`${candidate.name}:${index}`}
          title={candidate.name}
          label={
            candidate.id
              ? t("narration.replaceCharacter", { name: candidate.name })
              : candidate.name
          }
          badge={
            candidate.id ? (
              <StatusBadge
                label={t(
                  selected.has(index)
                    ? "narration.willReplace"
                    : "narration.alreadyExists",
                )}
                emphasized={selected.has(index)}
                colors={readerFormColors(palette)}
              />
            ) : null
          }
          detail={candidate.description}
          selected={selected.has(index)}
          disabled={disabled}
          palette={palette}
          onPress={() => onToggle(index)}
        />
      ))}
    </View>
  )
}

type ImportFieldsProps = {
  mode: CharacterImportMode
  palette: ReaderChromePalette
  busy: boolean
  prompt: string
  setPrompt: (value: string) => void
  query: string
  setQuery: (value: string) => void
  sources?: CharacterSource[]
  sourcesLoaded: boolean
  sourceIndex: number | null
  setSourceIndex: (index: number | null) => void
  introductions?: CharacterIntroduction[]
  showMissingIntroduction: boolean
  passages: Set<number>
  togglePassage: (index: number) => void
}

function ImportFields(props: ImportFieldsProps) {
  const { t } = useTranslation()
  const {
    mode,
    palette,
    busy,
    prompt,
    setPrompt,
    introductions,
    showMissingIntroduction,
    passages,
    togglePassage,
  } = props
  if (mode === "prompt")
    return (
      <ProviderTextField
        testID="narration-prompt"
        label={t("narration.prompt")}
        placeholder={t("narration.promptPlaceholder")}
        multiline
        palette={palette}
        value={prompt}
        onChangeText={setPrompt}
        editable={!busy}
      />
    )
  if (mode === "encyclopedia") return <EncyclopediaFields {...props} />
  return (
    <View>
      {introductions?.length ? (
        introductions.map((value, index) => (
          <ReaderChoiceRow
            key={value.id}
            title={value.title}
            detail={value.text}
            selected={passages.has(index)}
            disabled={busy}
            palette={palette}
            onPress={() => togglePassage(index)}
          />
        ))
      ) : showMissingIntroduction ? (
        <Text style={{ color: palette.textMuted }}>
          {t("narration.noBookIntroduction")}
        </Text>
      ) : null}
    </View>
  )
}

function EncyclopediaFields({
  palette,
  busy,
  query,
  setQuery,
  sources,
  sourcesLoaded,
  sourceIndex,
  setSourceIndex,
}: ImportFieldsProps) {
  const { t } = useTranslation()
  const source = sourceIndex === null ? undefined : sources?.[sourceIndex]
  return (
    <>
      <ProviderTextField
        testID="narration-source-query"
        label={t("narration.searchQuery")}
        palette={palette}
        value={query}
        onChangeText={setQuery}
        editable={!busy}
      />
      {sources?.length ? (
        <View>
          {sources.map((value, index) => (
            <ReaderChoiceRow
              key={value.url}
              title={value.title}
              detail={value.url}
              selected={index === sourceIndex}
              disabled={busy}
              palette={palette}
              onPress={() =>
                setSourceIndex(index === sourceIndex ? null : index)
              }
            />
          ))}
        </View>
      ) : sourcesLoaded ? (
        <Text style={{ color: palette.textMuted }}>
          {t("narration.noSources")}
        </Text>
      ) : null}
      {source ? (
        <Text
          accessibilityRole="link"
          style={{ color: palette.accentText }}
          onPress={() => void Linking.openURL(source.url)}
        >
          {source.url}
        </Text>
      ) : null}
    </>
  )
}

function importError(error: string | undefined, failure: Error | null) {
  return error ?? (failure ? errorMessage(failure) : undefined)
}

function CharacterImportFooter({
  palette,
  organizing,
  searching,
  saving,
  progress,
  candidates,
  selected,
  setSelected,
  canOrganize,
  onCancel,
  onImport,
  organize,
}: {
  palette: ReaderChromePalette
  organizing: boolean
  searching: boolean
  saving: boolean
  progress: string
  candidates: BookCharacter[] | null
  selected: Set<number>
  setSelected: (selected: Set<number>) => void
  canOrganize: boolean
  onCancel: () => void
  onImport: (characters: BookCharacter[]) => void
  organize: () => void
}) {
  const { t } = useTranslation()
  const busy = organizing || searching || saving
  return (
    <ReaderSheetFooter
      palette={palette}
      status={
        organizing || searching ? (
          <StreamingStatusLine
            label={t(
              organizing ? "narration.organizing" : "narration.importing",
            )}
            text={organizing ? progress : ""}
            colors={readerFormColors(palette)}
          />
        ) : null
      }
    >
      {candidates ? (
        <ReaderSelectAllButton
          palette={palette}
          allSelected={
            candidates.length > 0 && selected.size === candidates.length
          }
          disabled={saving || candidates.length === 0}
          onPress={() =>
            setSelected(
              selected.size === candidates.length
                ? new Set()
                : new Set(candidates.map((_, index) => index)),
            )
          }
        />
      ) : null}
      <View className="flex-1" />
      <Button
        title={t("llm.cancel")}
        variant="ghost"
        colors={{
          textColor: palette.accentText,
          underlayColor: palette.segmentActive,
        }}
        disabled={saving}
        onPress={onCancel}
      />
      <Button
        title={t(
          candidates ? "narration.importSelected" : "narration.organize",
        )}
        icon={{ ios: "checkmark", android: "check" }}
        loading={saving || organizing}
        disabled={busy || (candidates ? selected.size === 0 : !canOrganize)}
        colors={{
          backgroundColor: palette.accent,
          borderColor: palette.accent,
          textColor: palette.bg,
          underlayColor: palette.segmentActive,
        }}
        onPress={() =>
          candidates
            ? onImport(candidates.filter((_, index) => selected.has(index)))
            : organize()
        }
      />
    </ReaderSheetFooter>
  )
}
