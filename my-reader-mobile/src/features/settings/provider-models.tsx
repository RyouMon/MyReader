import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Button, IconButton, SectionLabel } from "@/src/components"
import { useThemePalette } from "@/src/design/tokens"
import { View } from "@/tw"
import { ProviderTextField } from "./provider-text-field"

export function ProviderModels({
  models,
  selected,
  onSelect,
  onChange,
  onAdd,
  onRemove,
  actions,
  children,
}: {
  models: { id: string; model: string }[]
  selected: number | null
  onSelect: (index: number | null) => void
  onChange?: (index: number, patch: { model?: string }) => void
  onAdd?: () => void
  onRemove?: (index: number) => void
  actions?: ReactNode
  children?: (index: number) => ReactNode
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  return (
    <View
      className="gap-3 border-t pt-3"
      style={{ borderColor: palette.border }}
    >
      <View className="flex-row items-center justify-between gap-2">
        <SectionLabel>{t("providerEditor.models")}</SectionLabel>
        <View className="flex-row items-center gap-1">
          {actions}
          {onAdd ? (
            <Button
              variant="ghost"
              size="sm"
              icon="add"
              title={t("aiProviders.addModel")}
              onPress={onAdd}
            />
          ) : null}
        </View>
      </View>
      {models.map((model, index) => {
        const open = selected === index
        const name = model.model || t("aiProviders.newModel")
        return (
          <View key={model.id || index} className="gap-3">
            <View className="flex-row items-center gap-1">
              <View className="min-w-0 flex-1 flex-row gap-2">
                <View className="min-w-0 flex-1">
                  <ProviderTextField
                    label={t("providerEditor.modelId")}
                    testID={`provider-model-id-${index}`}
                    required
                    value={model.model}
                    editable={Boolean(onChange)}
                    placeholder={t("providerEditor.modelId")}
                    onChangeText={(value) =>
                      onChange?.(index, { model: value })
                    }
                  />
                </View>
              </View>
              <View className="flex-row">
                {children ? (
                  <IconButton
                    label={`${t("providerEditor.modelDetails")} ${name}`}
                    icon={open ? "expand-more" : "chevron-right"}
                    size="sm"
                    onPress={() => onSelect(open ? null : index)}
                  />
                ) : null}
                {onRemove ? (
                  <IconButton
                    label={`${t("aiProviders.removeModel")} ${name}`}
                    icon="delete-outline"
                    tone="danger"
                    size="sm"
                    onPress={() => onRemove(index)}
                  />
                ) : null}
              </View>
            </View>
            {open ? children?.(index) : null}
          </View>
        )
      })}
    </View>
  )
}
