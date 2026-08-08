import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import { SymbolView } from "expo-symbols"
import { Platform } from "react-native"

import { useThemePalette } from "@/src/design/tokens"
import { Text, View } from "@/tw"

export type HelpSectionItem = {
  title: string
  body: string
}

function HelpItem({ title, body }: HelpSectionItem) {
  const palette = useThemePalette()

  return (
    <View className="gap-1">
      <Text
        className="text-base font-bold leading-6"
        style={{ color: palette.text }}
      >
        {title}
      </Text>
      <Text
        className="text-base leading-6"
        style={{ color: palette.textMuted }}
      >
        {body}
      </Text>
    </View>
  )
}

export function HelpSection({
  title,
  items,
}: {
  title: string
  items: readonly HelpSectionItem[]
}) {
  const palette = useThemePalette()

  return (
    <View
      className="gap-4 rounded-3xl px-4 py-4"
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.border,
        borderWidth: 1,
      }}
    >
      <View className="flex-row items-center gap-2">
        {Platform.OS === "ios" ? (
          <SymbolView
            name="questionmark.circle"
            resizeMode="scaleAspectFit"
            size={20}
            tintColor={palette.primary}
          />
        ) : (
          <MaterialIcons
            name="help-outline"
            size={20}
            color={palette.primary}
          />
        )}
        <Text
          className="text-base font-bold"
          style={{ color: palette.textMuted }}
        >
          {title}
        </Text>
      </View>

      <View className="gap-4">
        {items.map((item) => (
          <HelpItem key={item.title} {...item} />
        ))}
      </View>
    </View>
  )
}
