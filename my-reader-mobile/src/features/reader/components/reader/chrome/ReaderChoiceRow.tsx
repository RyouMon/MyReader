import { PlatformIcon } from "@/src/components/ui/platform-icon"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import { Pressable, Text, View } from "@/tw"
import { ReaderListSelectionIndicator } from "./ReaderListSelectionControls"

export function ReaderChoiceRow({
  title,
  detail,
  badge,
  label = title,
  selected,
  disabled,
  palette,
  onPress,
}: {
  title: string
  detail?: string
  badge?: ReactNode
  label?: string
  selected?: boolean
  disabled?: boolean
  palette: ReaderChromePalette
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole={selected === undefined ? "button" : "checkbox"}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      className="min-h-14 flex-row items-center gap-3 rounded-xl px-4 py-3"
      style={({ pressed }) => ({
        backgroundColor: pressed ? palette.segmentActive : "transparent",
        opacity: disabled ? 0.5 : 1,
      })}
    >
      {selected !== undefined ? (
        <ReaderListSelectionIndicator
          selected={selected}
          palette={palette}
          className="h-6 w-6 items-center justify-center rounded-full border"
        />
      ) : null}
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text
            className="shrink text-base"
            numberOfLines={2}
            style={{ color: palette.text }}
          >
            {title}
          </Text>
          {badge}
        </View>
        {detail ? (
          <Text
            className="text-sm"
            numberOfLines={2}
            style={{ color: palette.textMuted }}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      {selected === undefined ? (
        <PlatformIcon
          name={{ ios: "chevron.right", android: "chevron-right" }}
          size={18}
          color={palette.textFaint}
        />
      ) : null}
    </Pressable>
  )
}
import type { ReactNode } from "react"
