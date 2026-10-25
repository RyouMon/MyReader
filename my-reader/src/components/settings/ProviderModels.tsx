import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { GroupList, GroupListItem } from "@/components/common/GroupList"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

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
  settings,
}: {
  models: { id: string; model: string; displayName?: string }[]
  selected: number | null
  onSelect: (index: number | null) => void
  onChange?: (
    index: number,
    patch: { model?: string; displayName?: string },
  ) => void
  onAdd?: () => void
  onRemove?: (index: number) => void
  children?: (index: number) => ReactNode
  actions?: ReactNode
  discovery?: ReactNode
  settings?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <section
      className="flex flex-col gap-3"
      aria-label={t("providerEditor.models")}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{t("providerEditor.models")}</h3>
        {actions}
      </div>
      {discovery}
      <GroupList>
        {settings ? <GroupListItem>{settings}</GroupListItem> : null}
        {models.map((model, index) => (
          <GroupListItem
            key={model.id || index}
            className="flex flex-col gap-3"
          >
            <div className="flex items-end gap-2">
              <FieldGroup className="grid min-w-0 flex-1 grid-cols-2 gap-3">
                <Field>
                  <FieldLabel
                    className={
                      index ? "sr-only" : "border-l border-transparent pl-3"
                    }
                    htmlFor={`model-id-${model.id || index}`}
                  >
                    {t("providerEditor.modelId")}
                  </FieldLabel>
                  <Input
                    id={`model-id-${model.id || index}`}
                    value={model.model}
                    readOnly={!onChange}
                    placeholder={t("providerEditor.modelId")}
                    onChange={(event) =>
                      onChange?.(index, { model: event.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel
                    className={
                      index ? "sr-only" : "border-l border-transparent pl-3"
                    }
                    htmlFor={`model-name-${model.id || index}`}
                  >
                    {t("providerEditor.displayName")}
                  </FieldLabel>
                  <Input
                    id={`model-name-${model.id || index}`}
                    value={model.displayName ?? ""}
                    readOnly={!onChange}
                    placeholder={model.model || t("providerEditor.displayName")}
                    onChange={(event) =>
                      onChange?.(index, { displayName: event.target.value })
                    }
                  />
                </Field>
              </FieldGroup>
              <div className="flex w-20 shrink-0 items-center justify-end gap-2">
                {children ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-expanded={selected === index}
                    aria-controls={`model-details-${model.id || index}`}
                    aria-label={`${t("providerEditor.modelDetails")} ${model.displayName || model.model || index + 1}`}
                    onClick={() => onSelect(selected === index ? null : index)}
                  >
                    {selected === index ? <ChevronDown /> : <ChevronRight />}
                  </Button>
                ) : null}
                {onRemove ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${t("aiProviders.removeModel")} ${model.displayName || model.model || index + 1}`}
                    onClick={() => onRemove(index)}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
            </div>
            {children && selected === index ? (
              <div id={`model-details-${model.id || index}`} className="pt-3">
                {children(index)}
              </div>
            ) : null}
          </GroupListItem>
        ))}
        {onAdd ? (
          <GroupListItem className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={onAdd}>
              <Plus data-icon="inline-start" />
              {t("aiProviders.addModel")}
            </Button>
          </GroupListItem>
        ) : null}
      </GroupList>
    </section>
  )
}
