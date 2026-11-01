import {
  useCallback,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { ChevronRight } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { FormSwitch } from "@/components/common/FormSwitch"
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
import type { TtsConfigDto, TtsVoiceRefDto } from "@/lib/tauri-specta"
import type { CharacterIntroduction } from "@/lib/readium/characterIntroductions"
import { NarrationCharacterList } from "./NarrationCharacterList"
import { NarrationReadingPlan } from "./NarrationReadingPlan"
import type { ReadingPlanController } from "@/hooks/reader/use-reading-plan"
import {
  READER_SETTINGS_CONTENT_CLASS,
  ReaderSidePanelScrollArea,
} from "@/components/reader/shared/ReaderSidePanelChrome"

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
  readingVoice,
  themeStyle,
  onSubviewChange,
  findIntroductions,
  children,
  readingPlan,
}: {
  book: NarrationBook
  findIntroductions?: () => Promise<CharacterIntroduction[]>
  config: TtsConfigDto
  readingVoice: TtsVoiceRefDto
  themeStyle?: CSSProperties
  onSubviewChange?: (view: NarrationSubview | null) => void
  children?: ReactNode
  readingPlan?: ReadingPlanController
}) {
  const { t } = useTranslation()
  const { query, save, previewMerge, merge } = useBookNarration(
    book.libraryId,
    book.bookId,
  )
  const [confirmEnable, setConfirmEnable] = useState(false)
  const [enableError, setEnableError] = useState<string | null>(null)
  const [charactersOpen, setCharactersOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const closePlan = useCallback(() => setPlanOpen(false), [])
  const closeCharacters = useCallback(() => setCharactersOpen(false), [])
  const settings = query.data
  const planVisible = !!settings?.enabled && planOpen && !!readingPlan
  const error = [save.error, previewMerge.error, merge.error, query.error].find(
    Boolean,
  )
  if (planVisible && readingPlan)
    return (
      <NarrationReadingPlan
        plan={readingPlan}
        themeStyle={themeStyle}
        onClose={closePlan}
        onSubviewChange={onSubviewChange}
      />
    )
  if (settings?.enabled && charactersOpen)
    return (
      <NarrationCharacterList
        book={book}
        config={config}
        readingVoice={readingVoice}
        themeStyle={themeStyle}
        settings={settings}
        save={save}
        findIntroductions={findIntroductions}
        previewMerge={previewMerge}
        merge={merge}
        error={error ? errorMessage(error) : undefined}
        onSubviewChange={onSubviewChange}
        onClose={closeCharacters}
      />
    )
  return (
    <ReaderSidePanelScrollArea className={READER_SETTINGS_CONTENT_CLASS}>
      <section className="flex flex-col gap-3" style={themeStyle}>
        {settings ? (
          <FormSwitch
            align="between"
            label={t("narration.enabled")}
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
        ) : null}
        {enableError ? <FieldError>{enableError}</FieldError> : null}
        {error ? <FieldError>{errorMessage(error)}</FieldError> : null}
        <Dialog open={confirmEnable} onOpenChange={setConfirmEnable}>
          <DialogContent style={themeStyle}>
            <DialogHeader>
              <DialogTitle>{t("narration.enabled")}</DialogTitle>
              <DialogDescription>
                {t("narration.enableNotice")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmEnable(false)}>
                {t("llm.cancel")}
              </Button>
              <Button
                onClick={() => {
                  setConfirmEnable(false)
                  if (settings) save.mutate({ ...settings, enabled: true })
                }}
              >
                {t("narration.enableConfirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {settings?.enabled && settings.scopeName ? (
          <p className="text-sm text-muted-foreground">
            {t("narration.series", { name: settings.scopeName })}
          </p>
        ) : null}
        {settings?.enabled ? (
          <Button
            variant="ghost"
            className="w-full justify-between text-reader-chrome-fg"
            onClick={() => setCharactersOpen(true)}
          >
            {t("narration.edit")}
            <ChevronRight
              className="size-4 text-reader-chrome-muted"
              aria-hidden
            />
          </Button>
        ) : null}
      </section>
      {settings?.enabled && readingPlan ? (
        <Button
          variant="ghost"
          className="w-full justify-between text-reader-chrome-fg"
          onClick={() => setPlanOpen(true)}
        >
          {t("narration.plan.title")}
          <ChevronRight
            className="size-4 text-reader-chrome-muted"
            aria-hidden
          />
        </Button>
      ) : null}
      {children}
    </ReaderSidePanelScrollArea>
  )
}
