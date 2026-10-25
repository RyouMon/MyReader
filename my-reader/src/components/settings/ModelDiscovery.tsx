import { useState } from "react"
import { useTranslation } from "react-i18next"
import { AppRow } from "@/components/common/AppRow"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"

export function ModelDiscovery({
  models,
  existing,
  onAdd,
  onClose,
}: {
  models: { id: string; name?: string }[]
  existing: string[]
  onAdd: (ids: string[]) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string[]>([])
  const available = models.filter((model) => !existing.includes(model.id))
  return (
    <div className="flex flex-col gap-3">
      <FieldGroup className="max-h-60 gap-2 overflow-y-auto">
        {available.map((model) => (
          <Field key={model.id} orientation="horizontal">
            <Checkbox
              id={`discover-${model.id}`}
              checked={selected.includes(model.id)}
              onCheckedChange={(checked) =>
                setSelected((old) =>
                  checked
                    ? [...old, model.id]
                    : old.filter((id) => id !== model.id),
                )
              }
            />
            <FieldLabel
              htmlFor={`discover-${model.id}`}
              className="min-w-0 flex-1"
            >
              <AppRow
                body={model.name || model.id}
                detail={
                  model.name && model.name !== model.id ? model.id : undefined
                }
              />
            </FieldLabel>
          </Field>
        ))}
      </FieldGroup>
      {!available.length ? (
        <p className="text-sm text-muted-foreground">
          {t("providerEditor.noNewModels")}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!selected.length}
          onClick={() => onAdd(selected)}
        >
          {t("providerEditor.addSelected")}
        </Button>
      </div>
    </div>
  )
}
