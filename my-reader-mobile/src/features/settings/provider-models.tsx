import { useTranslation } from "react-i18next"
import { Button, ListRow, SectionCard } from "@/src/components"
import { View } from "@/tw"

export function ProviderModels({
  models,
  selected,
  onSelect,
  onAdd,
  onRemove,
}: {
  models: { model: string }[]
  selected: number
  onSelect: (index: number) => void
  onAdd?: () => void
  onRemove?: (index: number) => void
}) {
  const { t } = useTranslation()
  return (
    <View className="gap-3">
      <SectionCard>
        {models.map((model, index) => (
          <ListRow
            key={index}
            title={model.model || t("aiProviders.newModel")}
            value={selected === index ? "✓" : undefined}
            onPress={() => onSelect(index)}
            isLast={index === models.length - 1}
          />
        ))}
      </SectionCard>
      {onAdd ? (
        <Button
          variant="secondary"
          title={t("aiProviders.addModel")}
          onPress={onAdd}
        />
      ) : null}
      {onRemove && models.length > 1 ? (
        <Button
          variant="secondary"
          title={t("aiProviders.removeModel")}
          onPress={() => onRemove(selected)}
        />
      ) : null}
    </View>
  )
}
