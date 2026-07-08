import { BookOpen, Download, Ellipsis, Loader2, Trash2, X } from "lucide-react"
import {
  cloneElement,
  type ElementType,
  type HTMLAttributes,
  type ReactElement,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
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
import { useSetBookReadingFormat } from "@/hooks/queries/useBookReadingFormatsQuery"
import { getReadableFormats, resolveReadFormat } from "@/lib/readFormats"
import { api } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

type FileAction = "download" | "cancel" | "delete"
const BOOK_MORE_MENU_WIDTH_CLASS = "w-52"

interface MenuParts {
  Item: ElementType
  Sub: ElementType
  SubContent: ElementType
  SubTrigger: ElementType
}

const dropdownMenuParts: MenuParts = {
  Item: DropdownMenuItem,
  Sub: DropdownMenuSub,
  SubContent: DropdownMenuSubContent,
  SubTrigger: DropdownMenuSubTrigger,
}

const contextMenuParts: MenuParts = {
  Item: ContextMenuItem,
  Sub: ContextMenuSub,
  SubContent: ContextMenuSubContent,
  SubTrigger: ContextMenuSubTrigger,
}

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

interface BookContextMenuProps
  extends Omit<BookMoreMenuProps, "triggerVariant"> {
  children: ReactElement<
    HTMLAttributes<HTMLElement> & {
      "data-book-context-menu-trigger"?: string
    }
  >
}

export function BookMoreMenu({
  book,
  libraryId,
  fileActionsEnabled = true,
  triggerVariant,
  selectedFormat,
}: BookMoreMenuProps) {
  const { t } = useTranslation()
  const TriggerIcon = Ellipsis

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
      <BookMoreMenuContent
        book={book}
        libraryId={libraryId}
        fileActionsEnabled={fileActionsEnabled}
        selectedFormat={selectedFormat}
        parts={dropdownMenuParts}
      />
    </DropdownMenu>
  )
}

export function BookContextMenu({
  book,
  children,
  libraryId,
  fileActionsEnabled = true,
  selectedFormat,
}: BookContextMenuProps) {
  const triggerId = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const [menuResetKey, setMenuResetKey] = useState(0)
  const isReplayingContextMenuRef = useRef(false)
  const shouldSuppressNativeContextMenuRef = useRef(false)
  const childOnContextMenuCapture = children.props.onContextMenuCapture
  const childOnPointerDownCapture = children.props.onPointerDownCapture

  function replayContextMenuAtEvent(
    trigger: HTMLElement,
    event: ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>,
  ) {
    const doc = trigger.ownerDocument
    const win = doc.defaultView
    if (!win) return false

    const activeMenu = doc.querySelector(
      `[data-book-context-menu-content="${triggerId}"][data-state="open"]`,
    )
    if (!activeMenu) return false

    const eventInit = {
      altKey: event.altKey,
      bubbles: true,
      button: 2,
      buttons: 2,
      cancelable: true,
      clientX: event.clientX,
      clientY: event.clientY,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      screenX: event.screenX,
      screenY: event.screenY,
      shiftKey: event.shiftKey,
      view: win,
    }

    setMenuResetKey((current) => current + 1)

    win.setTimeout(() => {
      const nextTrigger = doc.querySelector(
        `[data-book-context-menu-trigger="${triggerId}"]`,
      )
      if (!nextTrigger) return
      isReplayingContextMenuRef.current = true
      nextTrigger.dispatchEvent(new win.MouseEvent("contextmenu", eventInit))
    }, 0)

    return true
  }

  function stopContextMenuRefreshEvent(
    event: ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>,
  ) {
    event.preventDefault()
    event.stopPropagation()
    event.nativeEvent.stopImmediatePropagation?.()
  }

  function handlePointerDownCapture(event: ReactPointerEvent<HTMLElement>) {
    childOnPointerDownCapture?.(event)
    if (event.defaultPrevented || event.button !== 2) return

    if (!replayContextMenuAtEvent(event.currentTarget, event)) return

    stopContextMenuRefreshEvent(event)
    shouldSuppressNativeContextMenuRef.current = true

    const win = event.currentTarget.ownerDocument.defaultView
    win?.setTimeout(() => {
      shouldSuppressNativeContextMenuRef.current = false
    }, 300)
  }

  function handleContextMenuCapture(event: ReactMouseEvent<HTMLElement>) {
    childOnContextMenuCapture?.(event)
    if (event.defaultPrevented) return

    if (isReplayingContextMenuRef.current) {
      isReplayingContextMenuRef.current = false
      return
    }

    if (shouldSuppressNativeContextMenuRef.current) {
      shouldSuppressNativeContextMenuRef.current = false
      stopContextMenuRefreshEvent(event)
      return
    }

    if (!replayContextMenuAtEvent(event.currentTarget, event)) return

    stopContextMenuRefreshEvent(event)
  }

  const trigger = cloneElement(children, {
    "data-book-context-menu-trigger": triggerId,
    onPointerDownCapture: handlePointerDownCapture,
    onContextMenuCapture: handleContextMenuCapture,
  })

  return (
    <ContextMenu key={menuResetKey} modal={false}>
      <ContextMenuTrigger asChild>{trigger}</ContextMenuTrigger>
      <ContextMenuContent
        data-book-context-menu-content={triggerId}
        className={BOOK_MORE_MENU_WIDTH_CLASS}
      >
        <BookMoreMenuItems
          book={book}
          libraryId={libraryId}
          fileActionsEnabled={fileActionsEnabled}
          selectedFormat={selectedFormat}
          parts={contextMenuParts}
        />
      </ContextMenuContent>
    </ContextMenu>
  )
}

function BookMoreMenuContent({
  book,
  libraryId,
  fileActionsEnabled,
  parts,
  selectedFormat,
  align = "end",
}: Omit<BookMoreMenuProps, "triggerVariant"> & {
  align?: "start" | "center" | "end"
  parts: MenuParts
}) {
  return (
    <DropdownMenuContent
      align={align}
      className={BOOK_MORE_MENU_WIDTH_CLASS}
      onClick={(event) => event.stopPropagation()}
    >
      <BookMoreMenuItems
        book={book}
        libraryId={libraryId}
        fileActionsEnabled={fileActionsEnabled}
        selectedFormat={selectedFormat}
        parts={parts}
      />
    </DropdownMenuContent>
  )
}

function BookMoreMenuItems({
  book,
  libraryId,
  fileActionsEnabled,
  parts,
  selectedFormat,
}: Omit<BookMoreMenuProps, "triggerVariant"> & {
  parts: MenuParts
}) {
  const { t } = useTranslation()
  const Item = parts.Item
  const readableFormats = getReadableFormats(book.formats)
  const activeFormat = resolveReadFormat(book.formats, selectedFormat)
  const sortedFormats = activeFormat
    ? [
        ...readableFormats.filter((format) => format === activeFormat),
        ...readableFormats.filter((format) => format !== activeFormat),
      ]
    : readableFormats

  return (
    <>
      {sortedFormats.length > 1 ? (
        <DefaultFormatSubMenu
          activeFormat={activeFormat}
          bookId={book.id}
          formats={sortedFormats}
          libraryId={libraryId}
          parts={parts}
        />
      ) : null}
      {!fileActionsEnabled ? (
        <Item disabled>
          <Download />
          {t("bookMore.localLibrary")}
        </Item>
      ) : sortedFormats.length === 0 ? (
        <Item disabled>
          <Download />
          {t("bookMore.noReadableFormat")}
        </Item>
      ) : sortedFormats.length === 1 ? (
        <BookFormatActionMenuItem
          libraryId={libraryId}
          bookId={book.id}
          format={sortedFormats[0]}
          parts={parts}
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
            parts={parts}
          />
          <FormatActionSubMenu
            action="cancel"
            bookId={book.id}
            formats={sortedFormats}
            hideNonMatchingItems
            hideWhenNoMatchingAction
            libraryId={libraryId}
            parts={parts}
          />
          <FormatActionSubMenu
            action="delete"
            bookId={book.id}
            formats={sortedFormats}
            hideNonMatchingItems
            hideWhenNoMatchingAction
            libraryId={libraryId}
            parts={parts}
          />
        </>
      )}
    </>
  )
}

function DefaultFormatSubMenu({
  activeFormat,
  bookId,
  formats,
  libraryId,
  parts,
}: {
  activeFormat: string | null
  bookId: number
  formats: string[]
  libraryId: string | null
  parts: MenuParts
}) {
  const { t } = useTranslation()
  const Item = parts.Item
  const Sub = parts.Sub
  const SubContent = parts.SubContent
  const SubTrigger = parts.SubTrigger
  const setBookReadingFormat = useSetBookReadingFormat(libraryId)
  const [pendingFormat, setPendingFormat] = useState<string | null>(null)
  const disabled = !libraryId

  async function setDefaultFormat(format: string) {
    if (disabled || format === activeFormat) return
    setPendingFormat(format)
    try {
      await setBookReadingFormat(bookId, format)
    } catch (err) {
      console.error(
        `Failed to set default reading format from library menu. library id: "${libraryId ?? ""}", book id: ${bookId}, format: "${format}", error:`,
        err,
      )
    } finally {
      setPendingFormat(null)
    }
  }

  return (
    <Sub>
      <SubTrigger className="w-full" disabled={disabled}>
        <BookOpen />
        {t("bookMore.setDefaultFormat")}
      </SubTrigger>
      <SubContent className={BOOK_MORE_MENU_WIDTH_CLASS}>
        {formats.map((format) => {
          const isActive = format === activeFormat
          return (
            <Item
              key={format}
              disabled={isActive || pendingFormat != null}
              onSelect={() => {
                void setDefaultFormat(format)
              }}
            >
              <span className="font-medium uppercase">{format}</span>
            </Item>
          )
        })}
      </SubContent>
    </Sub>
  )
}

function FormatActionSubMenu({
  action,
  bookId,
  formats,
  hideNonMatchingItems = false,
  hideWhenNoMatchingAction = false,
  libraryId,
  parts,
}: {
  action: FileAction
  bookId: number
  formats: string[]
  hideNonMatchingItems?: boolean
  hideWhenNoMatchingAction?: boolean
  libraryId: string | null
  parts: MenuParts
}) {
  const { t } = useTranslation()
  const Icon = actionIcon(action)
  const Sub = parts.Sub
  const SubContent = parts.SubContent
  const SubTrigger = parts.SubTrigger
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
        <Sub>
          <SubTrigger
            className={cn(
              "w-full",
              action === "delete" &&
                "text-destructive focus:bg-destructive/10 focus:text-destructive data-[state=open]:bg-destructive/10 data-[state=open]:text-destructive dark:focus:bg-destructive/20 dark:data-[state=open]:bg-destructive/20",
            )}
          >
            <Icon />
            {t(`bookMore.${action}`)}
          </SubTrigger>
          <SubContent className={BOOK_MORE_MENU_WIDTH_CLASS}>
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
                parts={parts}
                onActionChange={(nextAction) => {
                  setActionByFormat((current) => {
                    if (current[format] === nextAction) return current
                    return { ...current, [format]: nextAction }
                  })
                }}
              />
            ))}
          </SubContent>
        </Sub>
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
  parts,
}: {
  action?: FileAction
  bookId: number
  format: string
  hidden?: boolean
  libraryId: string | null
  onActionChange?: (action: FileAction | null) => void
  parts: MenuParts
}) {
  const { t } = useTranslation()
  const Item = parts.Item
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
    <Item
      disabled={disabled}
      variant={resolvedAction === "delete" ? "destructive" : "default"}
      onSelect={(event: Event) => {
        event.preventDefault()
        void runAction()
      }}
    >
      {requestedAction == null ? (
        <Icon className={pending ? "animate-spin" : undefined} />
      ) : null}
      {requestedAction == null && action ? t(`bookMore.${action}`) : fmt}
    </Item>
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
      "inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-cover-fg-35",
      "bg-cover-fg-20 text-cover-fg shadow-xs backdrop-blur-sm transition-colors",
      "hover:bg-cover-fg-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
    )
  }
  if (variant === "row") {
    return cn(
      "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
      "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
    )
  }
  return cn(
    "detail-icon-action inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--detail-hero-control-bg)] text-[var(--detail-hero-fg)] shadow-sm transition-colors",
    "hover:bg-[var(--detail-hero-control-hover)] hover:text-[var(--detail-hero-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
  )
}
