import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react"
import type { ReactNode } from "react"
import { FormTextField } from "@/components/common/FormTextField"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export function ProviderModels({
  models,
  selected,
  onSelect,
  onChange,
  onAdd,
  onRemove,
  children,
  actions,
  discovery,
  fieldErrors,
  detailsClassName,
}: {
  models: { id: string; model: string }[]
  selected: number | null
  onSelect: (index: number | null) => void
  onChange: (index: number, patch: { model?: string }) => void
  onAdd: () => void
  onRemove: (index: number) => void
  children?: (index: number) => ReactNode
  actions?: ReactNode
  discovery?: ReactNode
  fieldErrors?: Record<string, string>
  detailsClassName?: string
}) {
  const { t } = useTranslation()
  return (
    <section
      className="flex flex-col gap-3"
      aria-label={t("providerEditor.models")}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{t("providerEditor.models")}</h3>
        <div className="flex items-center gap-2">
          {actions}
          <Button type="button" variant="ghost" size="sm" onClick={onAdd}>
            <Plus data-icon="inline-start" />
            {t("aiProviders.addModel")}
          </Button>
        </div>
      </div>
      {discovery}
      <FieldGroup className="gap-4">
        {models.map((model, index) => (
          <div
            key={model.id || index}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-3"
          >
            <FormTextField
              id={`model-id-${model.id || index}`}
              label={t("providerEditor.modelId")}
              value={model.model}
              required
              fullWidth
              error={Boolean(fieldErrors?.[`model-id-${model.id || index}`])}
              helperText={fieldErrors?.[`model-id-${model.id || index}`]}
              onChange={(event) =>
                onChange(index, { model: event.target.value })
              }
            />
            <div className="flex w-20 shrink-0 items-center justify-end gap-2">
              {children ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-expanded={selected === index}
                  aria-controls={`model-details-${model.id || index}`}
                  aria-label={`${t("providerEditor.modelDetails")} ${model.model || index + 1}`}
                  onClick={() => onSelect(selected === index ? null : index)}
                >
                  {selected === index ? <ChevronDown /> : <ChevronRight />}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`${t("aiProviders.removeModel")} ${model.model || index + 1}`}
                onClick={() => onRemove(index)}
              >
                <Trash2 />
              </Button>
            </div>
            {children && selected === index ? (
              <div
                id={`model-details-${model.id || index}`}
                className={cn("col-span-2 flex gap-4 py-3", detailsClassName)}
              >
                <Separator
                  orientation="vertical"
                  className="data-[orientation=vertical]:h-auto"
                />
                <div className="min-w-0 flex-1">{children(index)}</div>
              </div>
            ) : null}
          </div>
        ))}
      </FieldGroup>
    </section>
  )
}
