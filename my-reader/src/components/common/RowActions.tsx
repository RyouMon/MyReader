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
  getDeleteDescription,
}: {
  name: string
  onEdit?: () => void
  onDelete: () => Promise<unknown>
  disabled?: boolean
  getDeleteDescription?: () => Promise<string>
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [description, setDescription] = useState("")
  const [checking, setChecking] = useState(false)
  const [checkFailed, setCheckFailed] = useState(false)
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
          if (next && getDeleteDescription) {
            setChecking(true)
            setCheckFailed(false)
            setDescription("")
            void getDeleteDescription()
              .then(setDescription)
              .catch((error) => {
                setError(errorMessage(error))
                setCheckFailed(true)
              })
              .finally(() => setChecking(false))
          }
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
          {checking ? (
            <Loader2 className="size-4 animate-spin" role="status" />
          ) : null}
          {description ? (
            <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm">
              {description}
            </p>
          ) : null}
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
              disabled={deleting || checking || checkFailed}
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
