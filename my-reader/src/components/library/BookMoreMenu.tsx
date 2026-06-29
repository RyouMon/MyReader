import {
  Download,
  Ellipsis,
  EllipsisVertical,
  Loader2,
  Trash2,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import {
  clearDownloadProgress,
  setDownloadCancelled,
  setDownloadError,
  setDownloadStarting,
} from "@/hooks/useDownloadProgress"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { bookFileStateKeys } from "@/hooks/queries/useBookFileState"
import {
  type BookDownloadSnapshot,
  useBookDownloadState,
} from "@/hooks/queries/useBookDownloadState"
import { getReadableFormats } from "@/lib/readFormats"
import { api } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

type FileAction = "download" | "cancel" | "delete"
const BOOK_MORE_MENU_WIDTH_CLASS = "w-44"

interface BookMoreMenuProps {
  book: {
    id: number
    title: string
    formats: string[]
  }
  libraryId: string | null
  fileActionsEnabled?: boolean
  triggerVariant: "card" | "row" | "detail"
  selectedFormat?: string
}

export function BookMoreMenu({
  book,
  libraryId,
  fileActionsEnabled = true,
  triggerVariant,
  selectedFormat,
}: BookMoreMenuProps) {
  const { t } = useTranslation()
  const readableFormats = getReadableFormats(book.formats)
  const selected = selectedFormat?.toUpperCase()
  const sortedFormats = selected
    ? [
        ...readableFormats.filter((format) => format === selected),
        ...readableFormats.filter((format) => format !== selected),
      ]
    : readableFormats
  const TriggerIcon = triggerVariant === "detail" ? EllipsisVertical : Ellipsis

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={t("bookCard.moreActions")}
          aria-label={t("bookCard.moreActions")}
          className={triggerClassName(triggerVariant)}
          onClick={(event) => event.stopPropagation()}
        >
          <TriggerIcon
            className={cn(
              triggerVariant === "detail" ? "size-[18px]" : "size-4",
            )}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={BOOK_MORE_MENU_WIDTH_CLASS}
        onClick={(event) => event.stopPropagation()}
      >
        {!fileActionsEnabled ? (
          <DropdownMenuItem disabled>
            <Download />
            {t("bookMore.localLibrary")}
          </DropdownMenuItem>
        ) : sortedFormats.length === 0 ? (
          <DropdownMenuItem disabled>
            <Download />
            {t("bookMore.noReadableFormat")}
          </DropdownMenuItem>
        ) : sortedFormats.length === 1 ? (
          <BookFormatActionMenuItem
            libraryId={libraryId}
            bookId={book.id}
            format={sortedFormats[0]}
          />
        ) : (
          <>
            <FormatActionSubMenu
              action="download"
              bookId={book.id}
              formats={sortedFormats}
              hideNonMatchingItems
              hideWhenNoMatchingAction
              libraryId={libraryId}
            />
            <FormatActionSubMenu
              action="cancel"
              bookId={book.id}
              formats={sortedFormats}
              hideNonMatchingItems
              hideWhenNoMatchingAction
              libraryId={libraryId}
            />
            <FormatActionSubMenu
              action="delete"
              bookId={book.id}
              formats={sortedFormats}
              hideNonMatchingItems
              hideWhenNoMatchingAction
              libraryId={libraryId}
            />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FormatActionSubMenu({
  action,
  bookId,
  formats,
  hideNonMatchingItems = false,
  hideWhenNoMatchingAction = false,
  libraryId,
}: {
  action: FileAction
  bookId: number
  formats: string[]
  hideNonMatchingItems?: boolean
  hideWhenNoMatchingAction?: boolean
  libraryId: string | null
}) {
  const { t } = useTranslation()
  const Icon = actionIcon(action)
  const [actionByFormat, setActionByFormat] = useState<
    Record<string, FileAction | null>
  >({})
  const hasLoadedAllActions = formats.every(
    (format) => format in actionByFormat,
  )
  const hasMatchingAction = Object.values(actionByFormat).some(
    (item) => item === action,
  )
  const shouldHide =
    hideWhenNoMatchingAction && (!hasLoadedAllActions || !hasMatchingAction)

  return (
    <>
      {formats.map((format) => (
        <FormatActionProbe
          key={`${action}-${format}-probe`}
          bookId={bookId}
          format={format}
          libraryId={libraryId}
          onActionChange={(nextAction) => {
            setActionByFormat((current) => {
              if (current[format] === nextAction) return current
              return { ...current, [format]: nextAction }
            })
          }}
        />
      ))}
      {shouldHide ? null : (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="w-full">
            <Icon />
            {t(`bookMore.${action}`)}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={BOOK_MORE_MENU_WIDTH_CLASS}>
            {formats.map((format) => (
              <BookFormatActionMenuItem
                key={`${action}-${format}`}
                action={action}
                bookId={bookId}
                format={format}
                hidden={
                  hideNonMatchingItems && actionByFormat[format] !== action
                }
                libraryId={libraryId}
                onActionChange={(nextAction) => {
                  setActionByFormat((current) => {
                    if (current[format] === nextAction) return current
                    return { ...current, [format]: nextAction }
                  })
                }}
              />
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
    </>
  )
}

function FormatActionProbe({
  bookId,
  format,
  libraryId,
  onActionChange,
}: {
  bookId: number
  format: string
  libraryId: string | null
  onActionChange: (action: FileAction | null) => void
}) {
  const fmt = format.toUpperCase()
  const downloadState = useBookDownloadState(libraryId, bookId, [fmt], fmt)
  const action = getFileAction(downloadState)

  useEffect(() => {
    onActionChange(action)
  }, [action, onActionChange])

  return null
}

function BookFormatActionMenuItem({
  action: requestedAction,
  bookId,
  format,
  hidden = false,
  libraryId,
  onActionChange,
}: {
  action?: FileAction
  bookId: number
  format: string
  hidden?: boolean
  libraryId: string | null
  onActionChange?: (action: FileAction | null) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)
  const fmt = format.toUpperCase()
  const downloadState = useBookDownloadState(libraryId, bookId, [fmt], fmt)
  const action = getFileAction(downloadState)
  const resolvedAction = requestedAction ?? action
  const disabled =
    !libraryId ||
    pending ||
    !action ||
    !resolvedAction ||
    (requestedAction != null && action !== requestedAction)
  const Icon = pending ? Loader2 : actionIcon(resolvedAction ?? "download")

  useEffect(() => {
    onActionChange?.(action)
  }, [action, onActionChange])

  if (hidden) return null

  async function invalidateFileState() {
    if (!libraryId) return
    await queryClient.invalidateQueries({
      queryKey: bookFileStateKeys.detail(libraryId, bookId, fmt),
    })
  }

  async function runAction() {
    if (!libraryId || !resolvedAction || disabled) return
    setPending(true)
    try {
      if (resolvedAction === "download") {
        setDownloadStarting(libraryId, bookId, fmt, queryClient)
        await api.downloadBookFile(libraryId, bookId, fmt)
      } else if (resolvedAction === "cancel") {
        setDownloadCancelled(libraryId, bookId, fmt, queryClient)
        await api.cancelBookDownload(libraryId, bookId, fmt)
        await invalidateFileState()
      } else {
        await api.deleteLocalBookFile(libraryId, bookId, fmt)
        clearDownloadProgress(libraryId, bookId, fmt, queryClient)
        await invalidateFileState()
      }
    } catch (err) {
      if (resolvedAction === "download") {
        setDownloadError(libraryId, bookId, fmt, String(err), queryClient)
      } else {
        await invalidateFileState()
      }
      console.error(
        `Failed to run book file action "${resolvedAction}". library id: "${libraryId}", book id: ${bookId}, format: "${fmt}", error:`,
        err,
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <DropdownMenuItem
      disabled={disabled}
      variant={resolvedAction === "delete" ? "destructive" : "default"}
      onSelect={(event) => {
        event.preventDefault()
        void runAction()
      }}
    >
      <Icon className={pending ? "animate-spin" : undefined} />
      {requestedAction == null && action ? t(`bookMore.${action}`) : fmt}
    </DropdownMenuItem>
  )
}

function getFileAction(state: BookDownloadSnapshot | null): FileAction | null {
  if (!state) return null
  if (state.status === "starting" || state.status === "downloading") {
    return "cancel"
  }
  if (state.status === "present") return "delete"
  return "download"
}

function actionIcon(action: FileAction) {
  if (action === "cancel") return X
  if (action === "delete") return Trash2
  return Download
}

function triggerClassName(variant: BookMoreMenuProps["triggerVariant"]) {
  if (variant === "card") {
    return cn(
      "inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-ink-inverse/35",
      "bg-ink-inverse/20 text-ink-inverse shadow-xs backdrop-blur-sm transition-colors",
      "hover:bg-ink-inverse/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
    )
  }
  if (variant === "row") {
    return cn(
      "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
      "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
    )
  }
  return cn(
    "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-foreground transition-colors",
    "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
  )
}
