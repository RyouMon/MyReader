import {
  READER_ANNOTATION_COLORS,
  type ReaderAnnotationColor,
} from "@my-reader/tools/reader-annotations"
import type { ReaderThemeKey } from "@my-reader/tools/reader-themes"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { readerChromeThemeStyle } from "@/components/reader/shared/ReaderChromeShell"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export type ReaderAnnotationEditorDraft = {
  id?: string
  excerpt: string
  color: ReaderAnnotationColor
  note: string
  createdAt: number
}

type ReaderAnnotationEditorDialogProps = {
  draft: ReaderAnnotationEditorDraft | null
  theme: ReaderThemeKey
  mutating?: boolean
  onClose: () => void
  onSave: (value: {
    color: ReaderAnnotationColor
    note: string
  }) => void | Promise<void>
  onDelete?: () => void | Promise<void>
}

const COLORS = Object.keys(READER_ANNOTATION_COLORS) as ReaderAnnotationColor[]

export function ReaderAnnotationEditorDialog({
  draft,
  theme,
  mutating = false,
  onClose,
  onSave,
  onDelete,
}: ReaderAnnotationEditorDialogProps) {
  const { i18n, t } = useTranslation()
  const [color, setColor] = useState<ReaderAnnotationColor>("yellow")
  const [note, setNote] = useState("")
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const themeStyle = useMemo(() => readerChromeThemeStyle(theme), [theme])

  useEffect(() => {
    if (!draft) return
    setColor(draft.color)
    setNote(draft.note)
    setConfirmingDelete(false)
  }, [draft])

  const timeLabel = useMemo(() => {
    if (!draft) return ""
    return new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(draft.createdAt)
  }, [draft, i18n.language, i18n.resolvedLanguage])

  return (
    <>
      <Dialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open && !mutating && !confirmingDelete) onClose()
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex h-[min(38rem,calc(100vh-3rem))] flex-col gap-0 overflow-hidden border-reader-chrome-border bg-reader-panel-bg p-0 text-reader-chrome-fg sm:max-w-2xl"
          style={themeStyle}
        >
          <DialogHeader className="flex-row items-baseline justify-between gap-4 px-6 pt-6">
            <DialogTitle>{t("reader.note")}</DialogTitle>
            <time className="text-sm text-reader-chrome-muted">
              {timeLabel}
            </time>
            <DialogDescription className="sr-only">
              {t("reader.annotationEditorDescription")}
            </DialogDescription>
          </DialogHeader>

          <blockquote
            className="mx-6 mt-6 line-clamp-4 border-l-4 py-1 pl-4 text-base leading-7"
            style={{ borderLeftColor: READER_ANNOTATION_COLORS[color] }}
          >
            {draft?.excerpt}
          </blockquote>

          <fieldset className="mx-6 mt-6 space-y-2">
            <legend className="text-sm font-medium text-reader-chrome-muted">
              {t("reader.highlightColor")}
            </legend>
            <div className="flex gap-2">
              {COLORS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={cn(
                    "grid size-9 place-items-center rounded-full outline-none ring-offset-2 ring-offset-[var(--reader-panel-bg)] transition-colors hover:bg-[var(--reader-chrome-hover)] focus-visible:ring-2 focus-visible:ring-reader-chrome-active",
                    color === value && "ring-2 ring-reader-chrome-fg",
                  )}
                  aria-label={t(`reader.annotationColors.${value}`)}
                  aria-pressed={color === value}
                  disabled={mutating}
                  onClick={() => setColor(value)}
                >
                  <span
                    className="size-6 rounded-full"
                    style={{ backgroundColor: READER_ANNOTATION_COLORS[value] }}
                    aria-hidden
                  />
                </button>
              ))}
            </div>
          </fieldset>

          <label className="mx-6 mt-6 min-h-0 flex-1">
            <span className="sr-only">{t("reader.note")}</span>
            <textarea
              className="h-full min-h-44 w-full resize-none bg-transparent p-0 text-base leading-7 text-reader-chrome-fg caret-reader-chrome-active outline-none disabled:opacity-50"
              value={note}
              maxLength={4000}
              disabled={mutating}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          <DialogFooter className="mt-4 flex-row justify-between px-6 pb-6 sm:justify-between">
            <div>
              {draft?.id && onDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={mutating}
                  onClick={() => setConfirmingDelete(true)}
                >
                  {t("common.delete")}
                </Button>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              className="bg-[var(--reader-chrome-action-surface)] text-[var(--reader-chrome-action-text)] hover:bg-[var(--reader-chrome-hover)] hover:text-reader-chrome-fg focus-visible:border-reader-chrome-active focus-visible:ring-reader-chrome-active/30"
              disabled={mutating}
              onClick={() => void onSave({ color, note })}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent
          className="border-reader-chrome-border bg-reader-panel-bg text-reader-chrome-fg sm:max-w-sm"
          style={themeStyle}
        >
          <DialogHeader>
            <DialogTitle>{t("reader.confirmDeleteAnnotation")}</DialogTitle>
            <DialogDescription className="text-reader-chrome-muted">
              {t("reader.deleteAnnotationDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-reader-chrome-border bg-transparent text-reader-chrome-fg hover:bg-[var(--reader-chrome-hover)] hover:text-reader-chrome-fg"
              disabled={mutating}
              onClick={() => setConfirmingDelete(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={mutating}
              onClick={() => {
                setConfirmingDelete(false)
                void onDelete?.()
              }}
            >
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
