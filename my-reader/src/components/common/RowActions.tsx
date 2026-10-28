import { Loader2, Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field"
import { errorMessage } from "@/lib/error-presentation"

export function RowActions({
  name,
  onEdit,
  onDelete,
  disabled = false,
}: {
  name: string
  onEdit?: () => void
  onDelete: () => Promise<unknown>
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editLabel = t("rowActions.edit", { name })
  const deleteLabel = t("rowActions.delete", { name })

  const confirmDelete = async () => {
    setDeleting(true)
    setError(null)
    try {
      await onDelete()
      setOpen(false)
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex items-center gap-1">
      {onEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={editLabel}
          title={editLabel}
          disabled={disabled || deleting}
          onClick={onEdit}
        >
          <Pencil />
        </Button>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (deleting) return
          setError(null)
          setOpen(next)
        }}
      >
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={deleteLabel}
            title={deleteLabel}
            disabled={disabled || deleting}
          >
            <Trash2 />
          </Button>
        </DialogTrigger>
        <DialogContent
          role="alertdialog"
          aria-describedby={undefined}
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle className="break-words">
              {t("rowActions.confirmDelete", { name })}
            </DialogTitle>
          </DialogHeader>
          {error ? <FieldError>{error}</FieldError> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              aria-busy={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? <Loader2 className="animate-spin" /> : null}
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
