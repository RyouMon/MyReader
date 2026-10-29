import { useState } from "react"
import Slider from "@react-native-community/slider"
import { useThemePalette, type ThemePalette } from "@/src/design/tokens"
import { Text, View } from "@/tw"

export function FormSlider({
  label,
  value,
  min,
  max,
  step,
  formatValue,
  onChange,
  colors,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  formatValue: (value: number) => string
  onChange: (value: number) => void
  colors?: Partial<ThemePalette>
}) {
  const palette = { ...useThemePalette(), ...colors }
  const [draft, setDraft] = useState({ source: value, value })
  const displayedValue = draft.source === value ? draft.value : value
  return (
    <View className="gap-2 px-4">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-base" style={{ color: palette.text }}>
          {label}
        </Text>
        <Text className="text-sm" style={{ color: palette.textMuted }}>
          {formatValue(displayedValue)}
        </Text>
      </View>
      <Slider
        accessibilityLabel={label}
        accessibilityRole="adjustable"
        accessibilityValue={{ text: formatValue(displayedValue) }}
        value={displayedValue}
        minimumValue={min}
        maximumValue={max}
        step={step}
        tapToSeek
        minimumTrackTintColor={palette.primary}
        maximumTrackTintColor={palette.borderStrong}
        thumbTintColor={palette.primary}
        onValueChange={(next) => setDraft({ source: value, value: next })}
        onSlidingComplete={(next) => {
          setDraft({ source: value, value: next })
          onChange(next)
        }}
      />
    </View>
  )
}
