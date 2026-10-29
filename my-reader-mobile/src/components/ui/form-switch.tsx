import type { ComponentProps } from "react"
import { useThemePalette } from "@/src/design/tokens"
import { Text, View } from "@/tw"
import { FormFieldSwitch } from "./form-field-switch"

export function FormSwitch({
  label,
  description,
  align = "end",
  colors,
  ...props
}: ComponentProps<typeof FormFieldSwitch> & {
  label: string
  description?: string
  align?: "end" | "between"
}) {
  const palette = { ...useThemePalette(), ...colors }
  return (
    <View className="flex-row items-center justify-end gap-3 pl-4">
      <View className={align === "between" ? "flex-1 gap-1" : "shrink gap-1"}>
        <Text className="text-base" style={{ color: palette.text }}>
          {label}
        </Text>
        {description ? (
          <Text className="text-sm" style={{ color: palette.textMuted }}>
            {description}
          </Text>
        ) : null}
      </View>
      <FormFieldSwitch accessibilityLabel={label} colors={colors} {...props} />
    </View>
  )
}
