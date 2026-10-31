import { useThemePalette, type ThemePalette } from "@/src/design/tokens"
import { Text, View } from "@/tw"

export function StatusBadge({
  label,
  emphasized = false,
  colors,
}: {
  label: string
  emphasized?: boolean
  colors?: Partial<ThemePalette>
}) {
  const palette = { ...useThemePalette(), ...colors }
  return (
    <View
      className="self-start rounded-md px-2 py-0.5"
      style={{
        backgroundColor: emphasized ? palette.primary : palette.surface,
      }}
    >
      <Text
        className="text-xs font-medium"
        style={{ color: emphasized ? palette.primaryForeground : palette.text }}
      >
        {label}
      </Text>
    </View>
  )
}
