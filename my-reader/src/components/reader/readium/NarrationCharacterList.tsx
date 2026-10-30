import { useEffect, useState, type CSSProperties } from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { BookOpen, Globe, PenLine, Plus, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { ReaderItemList } from "@/components/reader/shared/ReaderItemList"
import {
  READER_SETTINGS_CONTENT_CLASS,
  ReaderSidePanelScrollArea,
} from "@/components/reader/shared/ReaderSidePanelChrome"
import type { useBookNarration } from "@/hooks/reader/use-book-narration"
import type {
  BookCharacterDto,
  BookNarrationSettingsDto,
  NarrationMergePlanDto,
  TtsConfigDto,
} from "@/lib/tauri-specta"
import type { CharacterIntroduction } from "@/lib/readium/characterIntroductions"
import type { NarrationBook, NarrationSubview } from "./BookNarrationSettings"
import { CharacterEditor } from "./CharacterEditor"
import {
  CharacterImportPanel,
  type CharacterImportMode,
} from "./CharacterImportPanel"
import { NarrationMergeEditor } from "./NarrationMergeEditor"

type Narration = ReturnType<typeof useBookNarration>
type CharacterView =
  | { kind: "list" }
  | { kind: "edit"; character: BookCharacterDto }
  | { kind: "import"; mode: CharacterImportMode }
  | { kind: "merge"; plan: NarrationMergePlanDto }

function characterViewTitle(view: CharacterView, t: TFunction): string {
  switch (view.kind) {
    case "list":
      return t("narration.characters")
    case "merge":
      return t("narration.merge")
    case "edit":
      return view.character.id === "narrator"
        ? t("narration.narrator")
        : view.character.name || t("narration.add")
    case "import":
      return {
        book: t("narration.fromBook"),
        encyclopedia: t("narration.import"),
        prompt: t("narration.organize"),
      }[view.mode]
  }
}

export function NarrationCharacterList({
  book,
  config,
  themeStyle,
  settings,
  save,
  previewMerge,
  merge,
  error,
  onSubviewChange,
  onClose,
  findIntroductions,
}: {
  book: NarrationBook
  config: TtsConfigDto
  themeStyle?: CSSProperties
  settings: BookNarrationSettingsDto
  save: Narration["save"]
  previewMerge: Narration["previewMerge"]
  merge: Narration["merge"]
  error?: string
  onSubviewChange?: (view: NarrationSubview | null) => void
  onClose: () => void
  findIntroductions?: () => Promise<CharacterIntroduction[]>
}) {
  const { t } = useTranslation()
  const [view, setView] = useState<CharacterView>({ kind: "list" })
  const title = characterViewTitle(view, t)
  const isList = view.kind === "list"
  useEffect(() => {
    onSubviewChange?.({
      title,
      onBack: isList ? onClose : () => setView({ kind: "list" }),
    })
  }, [title, isList, onClose, onSubviewChange])
  useEffect(() => () => onSubviewChange?.(null), [onSubviewChange])

  const commit = (characters: BookCharacterDto[]) =>
    save.mutate(
      { ...settings, characters },
      { onSuccess: () => setView({ kind: "list" }) },
    )

  if (view.kind === "list") {
    const needsMerge = settings.mergeSources.length > 0
    return (
      <ReaderItemList
        themeStyle={themeStyle}
        footerActions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={
                  save.isPending || previewMerge.isPending || needsMerge
                }
              >
                <Plus />
                {t("narration.add")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" style={themeStyle}>
              <DropdownMenuItem
                onSelect={() =>
                  setView({
                    kind: "edit",
                    character: {
                      id: "",
                      name: "",
                      nicknames: [],
                      description: "",
                      voice: null,
                      instructions: "",
                      source: null,
                    },
                  })
                }
              >
                <PenLine />
                {t("narration.manualAdd")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setView({ kind: "import", mode: "book" })}
              >
                <BookOpen />
                {t("narration.fromBook")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  setView({ kind: "import", mode: "encyclopedia" })
                }
              >
                <Globe />
                {t("narration.import")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setView({ kind: "import", mode: "prompt" })}
              >
                <Sparkles />
                {t("narration.organize")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
        rows={settings.characters.map((character) => ({
          id: character.id,
          title:
            character.id === "narrator"
              ? t("narration.narrator")
              : character.name,
          description: character.voice?.voiceId || t("narration.defaultVoice"),
          selectable: character.id !== "narrator",
        }))}
        mutating={save.isPending || previewMerge.isPending || needsMerge}
        labels={{
          select: t("narration.select"),
          deselect: t("narration.deselect"),
          selected: (count) => t("narration.selected", { count }),
          deleteSelected: t("narration.deleteSelected"),
        }}
        onOpen={(id) => {
          const character = settings.characters.find((entry) => entry.id === id)
          if (character) setView({ kind: "edit", character })
        }}
        onDelete={async (ids) => {
          await save.mutateAsync({
            ...settings,
            characters: settings.characters.filter(
              (character) =>
                character.id === "narrator" || !ids.includes(character.id),
            ),
          })
        }}
      >
        {error ? <FieldError>{error}</FieldError> : null}
        {needsMerge ? (
          <div className="mb-3 flex flex-col gap-3">
            <p className="text-sm font-medium">{t("narration.merge")}</p>
            <Button
              disabled={previewMerge.isPending}
              onClick={() =>
                previewMerge.mutate(true, {
                  onSuccess: (plan) => setView({ kind: "merge", plan }),
                })
              }
            >
              {t("narration.autoMerge")}
            </Button>
            <Button
              variant="outline"
              disabled={previewMerge.isPending}
              onClick={() =>
                previewMerge.mutate(false, {
                  onSuccess: (plan) => setView({ kind: "merge", plan }),
                })
              }
            >
              {t("narration.manualMerge")}
            </Button>
          </div>
        ) : null}
      </ReaderItemList>
    )
  }

  return (
    <ReaderSidePanelScrollArea className={READER_SETTINGS_CONTENT_CLASS}>
      {error ? <FieldError>{error}</FieldError> : null}
      <div style={themeStyle}>
        {view.kind === "merge" ? (
          <NarrationMergeEditor
            themeStyle={themeStyle}
            settings={settings}
            plan={view.plan}
            onChange={(plan) => setView({ kind: "merge", plan })}
            onCancel={() => setView({ kind: "list" })}
            saving={merge.isPending}
            onSave={() =>
              merge.mutate(view.plan, {
                onSuccess: () => setView({ kind: "list" }),
              })
            }
          />
        ) : view.kind === "import" ? (
          <CharacterImportPanel
            key={view.mode}
            book={book}
            mode={view.mode}
            findIntroductions={findIntroductions}
            saving={save.isPending}
            onImport={(characters) =>
              commit([
                ...settings.characters,
                ...characters.filter(
                  (candidate) =>
                    !settings.characters.some(
                      (character) =>
                        character.name === candidate.name ||
                        character.nicknames.includes(candidate.name),
                    ),
                ),
              ])
            }
          />
        ) : (
          <CharacterEditor
            key={view.character.id || "new"}
            character={view.character}
            config={config}
            themeStyle={themeStyle}
            saving={save.isPending}
            onCancel={() => setView({ kind: "list" })}
            onSave={(value) =>
              commit(
                view.character.id
                  ? settings.characters.map((entry) =>
                      entry.id === view.character.id ? value : entry,
                    )
                  : [...settings.characters, value],
              )
            }
          />
        )}
      </div>
    </ReaderSidePanelScrollArea>
  )
}
