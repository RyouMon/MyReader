import { Loader2, Search, X } from "lucide-react"
import { type CSSProperties, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { FormScrollArea } from "@/components/common/FormScrollArea"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const SEARCH_THRESHOLD = 8

type ModelItem = { id: string }

function ModelDiscoveryList({
  available,
  added,
  hasAvailableTotal,
  query,
  selected,
  busy,
  onToggle,
}: {
  available: readonly ModelItem[]
  added: readonly ModelItem[]
  hasAvailableTotal: boolean
  query: string
  selected: readonly string[]
  busy?: boolean
  onToggle: (id: string, checked: boolean) => void
}) {
  const { t } = useTranslation()
  const noMatches =
    Boolean(query.trim()) && available.length === 0 && added.length === 0

  return (
    <FormScrollArea className="min-h-0 flex-1 px-4 py-3">
      {!hasAvailableTotal ? (
        <p className="px-2 py-2 text-sm text-muted-foreground">
          {t("providerEditor.noNewModels")}
        </p>
      ) : null}
      {noMatches ? (
        <p className="px-2 py-8 text-center text-sm text-muted-foreground">
          {t("providerEditor.noMatchingModels")}
        </p>
      ) : null}
      {available.length > 0 ? (
        <div className="flex flex-col gap-1">
          {available.map((model) => {
            const checked = selected.includes(model.id)
            return (
              <label
                key={model.id}
                htmlFor={`discover-${model.id}`}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent",
                  checked && "bg-primary-soft/60",
                  busy && "pointer-events-none opacity-60",
                )}
              >
                <Checkbox
                  id={`discover-${model.id}`}
                  checked={checked}
                  disabled={busy}
                  onCheckedChange={(next) => onToggle(model.id, Boolean(next))}
                />
                <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
                  {model.id}
                </span>
              </label>
            )
          })}
        </div>
      ) : null}
      {available.length > 0 && added.length > 0 ? (
        <Separator className="my-2" />
      ) : null}
      {added.length > 0 ? (
        <div className="flex flex-col gap-1">
          {added.map((model) => (
            <div
              key={model.id}
              className="flex items-center justify-between gap-3 rounded-md px-3 py-2.5 opacity-65"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-sm text-muted-foreground">
                {model.id}
              </span>
              <Badge variant="secondary" className="px-2.5 py-0.5 text-sm">
                {t("providerEditor.modelAdded")}
              </Badge>
            </div>
          ))}
        </div>
      ) : null}
    </FormScrollArea>
  )
}

export function ModelDiscovery({
  models,
  existing,
  busy,
  themeStyle,
  onAdd,
  onClose,
}: {
  models: ModelItem[]
  existing: string[]
  busy?: boolean
  themeStyle?: CSSProperties
  onAdd: (ids: string[]) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string[]>([])
  const [query, setQuery] = useState("")

  const { uniqueModels, available, added } = useMemo(() => {
    const seen = new Set<string>()
    const unique = models.filter((model) => {
      if (!model.id || seen.has(model.id)) return false
      seen.add(model.id)
      return true
    })
    const existingSet = new Set(existing.map((id) => id.trim()).filter(Boolean))
    return {
      uniqueModels: unique,
      available: unique.filter((model) => !existingSet.has(model.id)),
      added: unique.filter((model) => existingSet.has(model.id)),
    }
  }, [existing, models])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredAvailable = normalizedQuery
    ? available.filter((model) =>
        model.id.toLowerCase().includes(normalizedQuery),
      )
    : available
  const filteredAdded = normalizedQuery
    ? added.filter((model) => model.id.toLowerCase().includes(normalizedQuery))
    : added

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const allVisibleSelected =
    filteredAvailable.length > 0 &&
    filteredAvailable.every((model) => selectedSet.has(model.id))

  const toggle = (id: string, checked: boolean) =>
    setSelected((previous) =>
      checked
        ? previous.includes(id)
          ? previous
          : [...previous, id]
        : previous.filter((item) => item !== id),
    )

  const toggleSelectAll = () => {
    const visibleIds = filteredAvailable.map((model) => model.id)
    if (visibleIds.length === 0) return
    if (allVisibleSelected) {
      const visibleSet = new Set(visibleIds)
      setSelected((previous) => previous.filter((id) => !visibleSet.has(id)))
      return
    }
    setSelected((previous) => [
      ...previous,
      ...visibleIds.filter((id) => !previous.includes(id)),
    ])
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        style={themeStyle}
        className="flex max-h-[min(78vh,560px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[480px]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-4">
          <DialogTitle className="text-base font-semibold">
            {t("providerEditor.selectModels")}
          </DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-me-2 shrink-0"
            disabled={busy}
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <X />
          </Button>
        </div>

        {uniqueModels.length >= SEARCH_THRESHOLD ? (
          <div className="shrink-0 border-b border-border px-6 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                disabled={busy}
                aria-label={t("providerEditor.searchModels")}
                placeholder={t("providerEditor.searchModels")}
                className="ps-9"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>
        ) : null}

        <ModelDiscoveryList
          available={filteredAvailable}
          added={filteredAdded}
          hasAvailableTotal={available.length > 0}
          query={query}
          selected={selected}
          busy={busy}
          onToggle={toggle}
        />

        <DialogFooter className="shrink-0 flex-row items-center justify-between border-t border-border px-6 py-4 sm:justify-between">
          <div className="flex items-center gap-3">
            {filteredAvailable.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="-ms-2"
                disabled={busy}
                onClick={toggleSelectAll}
              >
                {allVisibleSelected
                  ? t("common.deselectAll")
                  : t("common.selectAll")}
              </Button>
            ) : null}
            {selected.length > 0 ? (
              <span className="text-sm text-muted-foreground">
                {t("providerEditor.selectedCount", { count: selected.length })}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={onClose}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!selected.length || busy}
              onClick={() => onAdd(selected)}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              {t("providerEditor.addSelected")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
