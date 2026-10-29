import { Switch, type SwitchProps } from "react-native"

import { useThemePalette, type ThemePalette } from "@/src/design/tokens"
import { View } from "@/tw"

/**
 * 表单控制行中的原生开关。
 */
export function FormFieldSwitch({
  accessibilityLabel,
  activeTrackColor,
  value,
  onValueChange,
  colors,
  ...props
}: SwitchProps & {
  activeTrackColor?: string
  colors?: Partial<ThemePalette>
  value: boolean
  onValueChange: (next: boolean) => void
}) {
  const palette = { ...useThemePalette(), ...colors }

  return (
    <View className="flex-row items-center justify-end">
      <Switch
        {...props}
        accessibilityLabel={accessibilityLabel}
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: palette.border,
          true: activeTrackColor ?? palette.primary,
        }}
        thumbColor={palette.surface}
        ios_backgroundColor={palette.backgroundSecondary}
      />
    </View>
  )
}
