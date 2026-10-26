import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, ListRow, SectionCard } from "@/src/components"
import { View } from "@/tw"

export function ModelDiscovery({
  models,
  existing,
  onAdd,
  onClose,
  busy,
}: {
  models: { id: string }[]
  existing: string[]
  onAdd: (ids: string[]) => void
  onClose: () => void
  busy?: boolean
}) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string[]>([])
  return (
    <SectionCard>
      {models.map((model, index) => (
        <ListRow
          key={model.id}
          title={model.id}
          value={
            existing.includes(model.id) || selected.includes(model.id)
              ? "✓"
              : undefined
          }
          isLast={index === models.length - 1}
          onPress={
            busy || existing.includes(model.id)
              ? undefined
              : () =>
                  setSelected((current) =>
                    current.includes(model.id)
                      ? current.filter((id) => id !== model.id)
                      : [...current, model.id],
                  )
          }
        />
      ))}
      <View className="gap-2 p-3">
        <Button
          title={t("providerEditor.addSelected")}
          disabled={!selected.length || busy}
          loading={busy}
          onPress={() => onAdd(selected)}
        />
        <Button
          variant="secondary"
          size="md"
          title={t("common.cancel")}
          disabled={busy}
          onPress={onClose}
        />
      </View>
    </SectionCard>
  )
}
