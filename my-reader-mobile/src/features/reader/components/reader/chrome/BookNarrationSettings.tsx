import { type ReactNode, useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Library } from "@my-reader/tools/types/library"
import { Button } from "@/src/components"
import { type ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import { useBookNarration } from "@/src/domain/llm/use-book-narration"
import type {
  BookCharacter,
  NarrationMergePlan,
  NarrationVoice,
} from "@/src/services/core/narration"
import type { MobileTtsConfig } from "@/src/services/core/tts"
import { errorMessage } from "@/src/i18n/error-message"
import { Text } from "@/tw"
import { ReaderSheetPage } from "./ReaderSheetPage"
import { NarrationCharacterList } from "./NarrationCharacterList"
import { NarrationSettingsEntry } from "./NarrationSettingsEntry"
import { useThemePalette } from "@/src/design/tokens"
import type { TFunction } from "i18next"
import { NarrationCharacterEditor } from "./NarrationCharacterEditor"
import {
  NarrationCharacterImport,
  type CharacterImportMode,
} from "./NarrationCharacterImport"
import { NarrationMergeEditor } from "./NarrationMergeEditor"
import { NarrationReadingPlan } from "./NarrationReadingPlan"
import type { ReadingPlanController } from "@/src/features/reader/tts/use-reading-plan"
import { ReaderChoiceRow } from "./ReaderChoiceRow"

export type NarrationSubview = { title: string; onBack: () => void }
export type NarrationBook = {
  library: Library
  bookId: number
  title: string
  authors: string[]
  language: string
  publicationId?: string
}

type Props = {
  readingPlan?: ReadingPlanController
  book?: NarrationBook
  config: MobileTtsConfig
  readingVoice?: NarrationVoice
  palette: ReaderChromePalette
  onChange?: () => void
  onSubviewChange?: (view: NarrationSubview | null) => void
  onHeaderActionChange?: (action: ReactNode) => void
  children?: ReactNode
}

type CharacterView =
  | { kind: "settings" | "list" | "plan" }
  | { kind: "edit"; character: BookCharacter }
  | { kind: "import"; mode: CharacterImportMode }
  | { kind: "merge"; plan: NarrationMergePlan }

export function BookNarrationSettings({ book, ...props }: Props) {
  return book ? (
    <BookNarrationContent
      key={`${book.library.id}:${book.bookId}`}
      book={book}
      {...props}
    />
  ) : (
    <ReaderSheetPage>{props.children}</ReaderSheetPage>
  )
}

function BookNarrationContent({
  book,
  config,
  readingVoice = { engine: "system", voiceId: "" },
  palette,
  onChange,
  onSubviewChange,
  onHeaderActionChange,
  children,
  readingPlan,
}: Omit<Props, "book"> & { book: NarrationBook }) {
  const { t } = useTranslation()
  const theme = useThemePalette()
  const { query, save, previewMerge, merge } = useBookNarration(
    book.library,
    book.bookId,
  )
  const [view, setView] = useState<CharacterView>({ kind: "settings" })
  const goBack = useCallback(() => {
    setView({
      kind: view.kind === "list" || view.kind === "plan" ? "settings" : "list",
    })
  }, [view.kind])
  const title = viewTitle(view, t)
  useEffect(() => {
    onSubviewChange?.(
      view.kind === "settings" ? null : { title, onBack: goBack },
    )
    return () => onSubviewChange?.(null)
  }, [view.kind, title, goBack, onSubviewChange])

  const settings = query.data
  const failure = save.error ?? previewMerge.error ?? merge.error ?? query.error
  const error = failure ? errorMessage(failure) : undefined
  const errorNode = error ? (
    <Text selectable accessibilityRole="alert" style={{ color: theme.danger }}>
      {error}
    </Text>
  ) : null
  if (!settings) return <ReaderSheetPage>{errorNode}</ReaderSheetPage>
  const commit = (characters: BookCharacter[]) =>
    save.mutate(
      { ...settings, characters },
      {
        onSuccess: () => {
          setView({ kind: "list" })
          onChange?.()
        },
      },
    )
  const busy = save.isPending || previewMerge.isPending || merge.isPending

  if (view.kind === "plan" && readingPlan)
    return <NarrationReadingPlan plan={readingPlan} palette={palette} />
  if (view.kind === "settings")
    return (
      <NarrationSettingsEntry
        settings={settings}
        palette={palette}
        save={save}
        onChange={onChange}
        onEdit={() => setView({ kind: "list" })}
        errorNode={errorNode}
      >
        {settings.enabled && readingPlan ? (
          <ReaderChoiceRow
            title={t("narration.plan.title")}
            palette={palette}
            onPress={() => setView({ kind: "plan" })}
          />
        ) : null}
        {children}
      </NarrationSettingsEntry>
    )

  if (view.kind === "edit")
    return (
      <NarrationCharacterEditor
        character={view.character}
        config={config}
        readingVoice={readingVoice}
        language={book.language}
        palette={palette}
        saving={save.isPending}
        error={error}
        onCancel={goBack}
        onSave={(character) =>
          commit(
            view.character.id
              ? settings.characters.map((value) =>
                  value.id === view.character.id ? character : value,
                )
              : [...settings.characters, character],
          )
        }
      />
    )

  if (view.kind === "import")
    return (
      <NarrationCharacterImport
        book={book}
        mode={view.mode}
        palette={palette}
        saving={save.isPending}
        error={error}
        onCancel={goBack}
        onHeaderActionChange={onHeaderActionChange}
        onImport={(characters) =>
          commit([
            ...settings.characters.map((character) => {
              const incoming = characters.find(
                (value) => value.id === character.id,
              )
              return incoming
                ? {
                    ...character,
                    name: incoming.name,
                    nicknames: incoming.nicknames,
                    description: incoming.description,
                    source: incoming.source,
                  }
                : character
            }),
            ...characters.filter((character) => !character.id),
          ])
        }
      />
    )

  if (view.kind === "merge")
    return (
      <ReaderSheetPage>
        {errorNode}
        <NarrationMergeEditor
          settings={settings}
          plan={view.plan}
          onChange={(plan) => setView({ kind: "merge", plan })}
          onCancel={goBack}
          saving={merge.isPending}
          onSave={() =>
            merge.mutate(view.plan, {
              onSuccess: () => {
                setView({ kind: "list" })
                onChange?.()
              },
            })
          }
          palette={palette}
        />
      </ReaderSheetPage>
    )

  if (settings.mergeSources.length > 0)
    return (
      <ReaderSheetPage>
        {errorNode}
        <Button
          title={t("narration.autoMerge")}
          disabled={busy}
          onPress={() =>
            previewMerge.mutate(true, {
              onSuccess: (plan) => setView({ kind: "merge", plan }),
            })
          }
        />
        <Button
          title={t("narration.manualMerge")}
          variant="ghost"
          disabled={busy}
          onPress={() =>
            previewMerge.mutate(false, {
              onSuccess: (plan) => setView({ kind: "merge", plan }),
            })
          }
        />
      </ReaderSheetPage>
    )

  return (
    <NarrationCharacterList
      config={config}
      characters={settings.characters}
      palette={palette}
      busy={busy}
      hasPublication={Boolean(book.publicationId)}
      errorNode={errorNode}
      onEdit={(character) => setView({ kind: "edit", character })}
      onImport={(mode) => setView({ kind: "import", mode })}
      onDelete={commit}
    />
  )
}

function viewTitle(view: CharacterView, t: TFunction) {
  if (view.kind === "plan") return t("narration.plan.title")
  if (view.kind === "edit")
    return view.character.id === "narrator"
      ? t("narration.narrator")
      : view.character.name || t("narration.add")
  if (view.kind === "import") {
    const keys = {
      book: "narration.fromBook",
      encyclopedia: "narration.import",
      prompt: "narration.organize",
    } as const
    return t(keys[view.mode])
  }
  return t(view.kind === "merge" ? "narration.merge" : "narration.characters")
}
