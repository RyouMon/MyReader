import { useRef } from "react"
import { ActivityIndicator, ScrollView } from "react-native"
import { useReducedMotion } from "react-native-reanimated"
import { useThemePalette, type ThemePalette } from "@/src/design/tokens"
import { Text, View } from "@/tw"

export function StreamingStatusLine({
  text,
  label,
  colors,
}: {
  text: string
  label: string
  colors?: Partial<ThemePalette>
}) {
  const palette = { ...useThemePalette(), ...colors }
  const scroll = useRef<ScrollView>(null)
  const reduceMotion = useReducedMotion()
  return (
    <View
      className="flex-row items-center gap-2 py-2"
      accessible
      accessibilityLabel={label}
      accessibilityRole="progressbar"
    >
      <ActivityIndicator color={palette.primary} />
      <ScrollView
        ref={scroll}
        horizontal
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        onContentSizeChange={() =>
          scroll.current?.scrollToEnd({ animated: !reduceMotion })
        }
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text
          numberOfLines={1}
          className="text-sm"
          style={{ color: palette.textMuted }}
        >
          {(text || label).replace(/\s+/g, " ")}
        </Text>
      </ScrollView>
    </View>
  )
}
