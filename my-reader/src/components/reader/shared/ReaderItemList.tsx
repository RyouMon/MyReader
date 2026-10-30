import { Check, CircleCheck, Pencil, Trash2 } from "lucide-react"
import {
  Fragment,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { useTranslation } from "react-i18next"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"
import { ReaderSidePanelScrollArea } from "./ReaderSidePanelChrome"
import {
  ReaderListFooter,
  type ReaderListSelectionLabels,
} from "./ReaderListFooter"

type ReaderListRow = {
  id: string
  title?: string
  content?: ReactNode
  description?: string | null
  trailing?: ReactNode
  active?: boolean
  selectable?: boolean
}

export function ReaderItemList({
  rows,
  labels,
  mutating = false,
  themeStyle,
  children,
  footerActions,
  onOpen,
  editAction,
  onDelete,
}: {
  rows: ReaderListRow[]
  labels: ReaderListSelectionLabels
  mutating?: boolean
  themeStyle?: CSSProperties
  children?: ReactNode
  footerActions?: ReactNode
  onOpen?: (id: string) => void
  editAction?: { label: string; onSelect: (id: string) => void }
  onDelete?: (ids: string[]) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [selecting, setSelecting] = useState(false)
  const selectableRows = rows.filter((row) => row.selectable !== false)
  const selectedRows = selectableRows.filter((row) => selectedIds.has(row.id))
  const selectionMode = selecting || selectedRows.length > 0
  const allSelected =
    selectableRows.length > 0 && selectedRows.length === selectableRows.length

  useEffect(() => {
    if (!selectionMode) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelecting(false)
        setSelectedIds(new Set())
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectionMode])

  function toggleSelection(id: string) {
    setSelecting(true)
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function deleteRows(ids: string[]) {
    if (mutating || !onDelete || ids.length === 0) return
    try {
      await onDelete(ids)
      if (selectionMode) {
        setSelectedIds(
          (current) => new Set([...current].filter((id) => !ids.includes(id))),
        )
        if (selectedRows.every((row) => ids.includes(row.id)))
          setSelecting(false)
      }
    } catch {
      // The owner displays mutation errors; keep the selection for retry.
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={themeStyle}>
      <ReaderSidePanelScrollArea className="flex min-h-full flex-col">
        <div className="flex flex-1 flex-col px-4 py-3">
          {children}
          <ul className="space-y-0.5">
            {rows.map((row) => {
              const selected = selectedIds.has(row.id)
              const selectable = row.selectable !== false
              const button = (
                <li>
                  <button
                    type="button"
                    aria-current={
                      !selectionMode && row.active ? "location" : undefined
                    }
                    aria-pressed={
                      selectionMode && selectable ? selected : undefined
                    }
                    disabled={mutating || (selectionMode && !selectable)}
                    className={`reader-chrome-toc-item flex w-full items-start gap-2.5 rounded-md px-2 py-2.5 text-start transition-colors disabled:opacity-50 ${selected ? "bg-[var(--reader-chrome-toc-row-active)]" : ""}`}
                    onClick={() => {
                      if (selectionMode) toggleSelection(row.id)
                      else onOpen?.(row.id)
                    }}
                  >
                    {selectionMode ? (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                          selected
                            ? "border-reader-chrome-active bg-reader-chrome-active text-[var(--reader-panel-bg)]"
                            : "border-reader-chrome-muted text-transparent",
                          { invisible: !selectable },
                        )}
                      >
                        <Check className="size-3" strokeWidth={2.5} />
                      </span>
                    ) : null}
                    <ReaderListRowContent row={row} />
                  </button>
                </li>
              )
              return selectable ? (
                <ContextMenu key={row.id} modal={false}>
                  <ContextMenuTrigger asChild>{button}</ContextMenuTrigger>
                  <ContextMenuContent className="z-80 w-40" style={themeStyle}>
                    <ContextMenuItem
                      disabled={mutating}
                      onSelect={() => toggleSelection(row.id)}
                    >
                      <CircleCheck />
                      {selected ? labels.deselect : labels.select}
                    </ContextMenuItem>
                    {editAction ? (
                      <ContextMenuItem
                        disabled={mutating}
                        onSelect={() => editAction.onSelect(row.id)}
                      >
                        <Pencil />
                        {editAction.label}
                      </ContextMenuItem>
                    ) : null}
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      variant="destructive"
                      disabled={mutating || !onDelete}
                      onSelect={() => void deleteRows([row.id])}
                    >
                      <Trash2 />
                      {t("common.delete")}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ) : (
                <Fragment key={row.id}>{button}</Fragment>
              )
            })}
          </ul>
        </div>
      </ReaderSidePanelScrollArea>
      <ReaderListFooter
        labels={labels}
        selectionMode={selectionMode}
        count={selectedRows.length}
        allSelected={allSelected}
        selectionDisabled={
          mutating || (!selectionMode && selectableRows.length === 0)
        }
        selectAllDisabled={mutating || selectableRows.length === 0}
        deleteDisabled={mutating || !onDelete}
        onToggleSelection={() => {
          setSelecting(!selectionMode)
          setSelectedIds(new Set())
        }}
        onToggleAll={() =>
          setSelectedIds(
            allSelected
              ? new Set()
              : new Set(selectableRows.map((row) => row.id)),
          )
        }
        onDelete={() => void deleteRows(selectedRows.map((row) => row.id))}
      >
        {footerActions}
      </ReaderListFooter>
    </div>
  )
}

function ReaderListRowContent({ row }: { row: ReaderListRow }) {
  return (
    <span className="min-w-0 flex-1">
      {row.content ?? (
        <>
          <span className="flex min-w-0 items-start gap-3">
            <span className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-5">
              {row.title}
            </span>
            {row.trailing ? (
              <span className="shrink-0 text-xs leading-5 tabular-nums text-reader-chrome-muted">
                {row.trailing}
              </span>
            ) : null}
          </span>
          {row.description ? (
            <span className="mt-0.5 block truncate text-xs leading-4 text-reader-chrome-muted">
              {row.description}
            </span>
          ) : null}
        </>
      )}
    </span>
  )
}
