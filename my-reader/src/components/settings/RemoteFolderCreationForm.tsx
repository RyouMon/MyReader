import { appendRemotePathSegment } from "@my-reader/tools/remote-path"
import { Check, Folder, X } from "lucide-react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { FormTextField } from "@/components/common/FormTextField"
import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/error-presentation"
import type { FolderBrowserFolder } from "./FolderBrowser"

export function RemoteFolderCreationForm({
  currentPath,
  disabled,
  onCreate,
  onCreated,
  onBusyChange,
  onCancel,
}: {
  currentPath: string
  disabled: boolean
  onCreate: (name: string) => Promise<FolderBrowserFolder>
  onCreated: () => void
  onBusyChange: (busy: boolean) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  const trimmed = name.trim()
  const invalid =
    Boolean(trimmed) && appendRemotePathSegment(currentPath, trimmed) === null

  async function create() {
    if (pending.current || disabled || !trimmed || invalid) return
    pending.current = true
    setCreating(true)
    onBusyChange(true)
    setError(null)
    try {
      await onCreate(trimmed)
      onCreated()
    } catch (caught) {
      const message = errorMessage(caught)
      setError(
        message.includes("REMOTE_DIRECTORY_ALREADY_EXISTS")
          ? t("remoteFolder.exists")
          : message,
      )
    } finally {
      pending.current = false
      setCreating(false)
      onBusyChange(false)
    }
  }

  return (
    <div
      className="flex items-start gap-2 p-3"
      data-dialog-escape-boundary
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.nativeEvent.isComposing) return
        event.preventDefault()
        event.stopPropagation()
        if (!pending.current) onCancel()
      }}
    >
      <Folder className="mt-2.5 size-[18px] shrink-0 text-primary" />
      <FormTextField
        id="remote-library-folder-name"
        label={t("remoteFolder.name")}
        value={name}
        autoFocus
        size="small"
        autoComplete="off"
        disabled={disabled || creating}
        onChange={(event) => {
          setName(event.target.value)
          setError(null)
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key === "Enter") {
            event.preventDefault()
            void create()
          }
        }}
        helperText={invalid ? t("remoteFolder.invalid") : (error ?? undefined)}
        error={invalid || Boolean(error)}
        slotProps={{
          htmlInput: {
            spellCheck: false,
            "data-testid": "remote-library-folder-name",
          },
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={t(creating ? "remoteFolder.creating" : "common.confirm")}
        title={t("common.confirm")}
        disabled={disabled || creating || !trimmed || invalid}
        onClick={() => void create()}
      >
        <Check />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("common.cancel")}
        title={t("common.cancel")}
        disabled={creating}
        onClick={onCancel}
      >
        <X />
      </Button>
    </div>
  )
}
