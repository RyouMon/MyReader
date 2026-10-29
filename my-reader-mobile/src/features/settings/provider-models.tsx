import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  Button,
  IconButton,
  FormInputRow,
  SectionLabel,
} from "@/src/components"
import type { useFormValidation } from "@/src/components/ui/use-form-validation"
import { useThemePalette } from "@/src/design/tokens"
import { Text, View } from "@/tw"
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
  validation,
}: {
  models: { id: string; model: string }[]
  selected: number | null
  onSelect: (index: number | null) => void
  onChange?: (index: number, patch: { model?: string }) => void
  onAdd?: () => void
  onRemove?: (index: number) => void
  actions?: ReactNode
  children?: (index: number) => ReactNode
  validation: ReturnType<typeof useFormValidation>
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
              icon={{ ios: "plus", android: "add" }}
              title={t("aiProviders.addModel")}
              onPress={onAdd}
            />
          ) : null}
        </View>
      </View>
      {validation.field("models").error ? (
        <Text
          accessibilityRole="alert"
          className="px-4 text-sm"
          style={{ color: palette.danger }}
        >
          {validation.field("models").error}
        </Text>
      ) : null}
      {models.map((model, index) => {
        const open = selected === index
        const name = model.model || t("aiProviders.newModel")
        return (
          <FormInputRow
            key={model.id}
            details={open ? children?.(index) : undefined}
            actions={
              <>
                {children ? (
                  <IconButton
                    label={`${t("providerEditor.modelDetails")} ${name}`}
                    icon={{
                      ios: open ? "chevron.down" : "chevron.right",
                      android: open ? "expand-more" : "chevron-right",
                    }}
                    size="sm"
                    onPress={() => onSelect(open ? null : index)}
                  />
                ) : null}
                {onRemove ? (
                  <IconButton
                    label={`${t("aiProviders.removeModel")} ${name}`}
                    icon={{ ios: "trash", android: "delete-outline" }}
                    tone="danger"
                    size="sm"
                    onPress={() => onRemove(index)}
                  />
                ) : null}
              </>
            }
          >
            <ProviderTextField
              label={t("providerEditor.modelId")}
              testID={`provider-model-id-${index}`}
              required
              value={model.model}
              {...validation.field(model.id)}
              onChangeText={(value) => onChange?.(index, { model: value })}
            />
          </FormInputRow>
        )
      })}
    </View>
  )
}
