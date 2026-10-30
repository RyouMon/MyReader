import { List, ListChecks, ListTodo, Trash2, X } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { ReaderSidePanelFooter } from "./ReaderSidePanelChrome"

export type ReaderListSelectionLabels = {
  select: string
  deselect: string
  selected: (count: number) => string
  deleteSelected: string
}

export function ReaderListFooter({
  children,
  labels,
  selectionMode,
  count,
  allSelected,
  selectionDisabled,
  selectAllDisabled,
  deleteDisabled,
  onToggleSelection,
  onToggleAll,
  onDelete,
}: {
  children?: ReactNode
  labels: ReaderListSelectionLabels
  selectionMode: boolean
  count: number
  allSelected: boolean
  selectionDisabled: boolean
  selectAllDisabled: boolean
  deleteDisabled: boolean
  onToggleSelection: () => void
  onToggleAll: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const selectLabel = selectionMode ? labels.deselect : labels.select
  const selectAllLabel = t(
    allSelected ? "common.deselectAll" : "common.selectAll",
  )
  return (
    <ReaderSidePanelFooter>
      <ButtonGroup className="shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={selectLabel}
          title={selectLabel}
          aria-pressed={selectionMode}
          disabled={selectionDisabled}
          className="shrink-0"
          onClick={onToggleSelection}
        >
          {selectionMode ? <X /> : <ListTodo />}
        </Button>
        {selectionMode ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            aria-label={selectAllLabel}
            title={selectAllLabel}
            disabled={selectAllDisabled}
            onClick={onToggleAll}
          >
            {allSelected ? <List /> : <ListChecks />}
          </Button>
        ) : null}
      </ButtonGroup>
      <p
        className="min-w-0 flex-1 text-center text-xs font-medium text-reader-chrome-muted"
        aria-live="polite"
      >
        {selectionMode ? (
          <>
            <span className="sr-only">{labels.selected(count)}</span>
            <span aria-hidden="true">{count}</span>
          </>
        ) : null}
      </p>
      {selectionMode ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label={labels.deleteSelected}
          title={labels.deleteSelected}
          disabled={deleteDisabled || count === 0}
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      ) : (
        children
      )}
    </ReaderSidePanelFooter>
  )
}
