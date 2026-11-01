import { useMemo, useState, type ReactNode } from "react"
import { Platform } from "react-native"
import { MenuView, type MenuAction } from "@react-native-menu/menu"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import { PlatformIcon } from "@/src/components/ui/platform-icon"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import { Pressable, Text, View } from "@/tw"
import { ReaderListSelectionIndicator } from "./ReaderListSelectionControls"

export function ReaderChoiceRow({
  title,
  detail,
  badge,
  badgePlacement = "inline",
  label = title,
  selected,
  active = false,
  disabled,
  palette,
  onPress,
  menuActions,
  onMenuAction,
  showChevron = true,
}: {
  title: string
  detail?: string
  badge?: ReactNode
  badgePlacement?: "inline" | "trailing"
  label?: string
  selected?: boolean
  active?: boolean
  disabled?: boolean
  palette: ReaderChromePalette
  onPress: () => void
  menuActions?: (MenuAction & { id: string })[]
  onMenuAction?: (id: string) => void
  showChevron?: boolean
}) {
  const [menuPressed, setMenuPressed] = useState(false)
  const tapGesture = useMemo(
    () =>
      menuActions?.length
        ? Gesture.Tap()
            .maxDuration(350)
            .runOnJS(true)
            .onBegin(() => setMenuPressed(true))
            .onEnd((_event, success) => {
              if (success && !disabled) onPress()
            })
            .onFinalize(() => setMenuPressed(false))
        : null,
    [menuActions, disabled, onPress],
  )
  const row = (
    <Pressable
      accessibilityRole={selected === undefined ? "button" : "checkbox"}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, selected: active, disabled }}
      accessibilityActions={menuActions?.map(({ id, title }) => ({
        name: id,
        label: title,
      }))}
      onAccessibilityAction={({ nativeEvent }) =>
        onMenuAction?.(nativeEvent.actionName)
      }
      onPress={onPress}
      disabled={disabled}
      className="min-h-14 flex-row items-center gap-3 rounded-xl px-4 py-3"
      style={({ pressed }) => ({
        backgroundColor:
          pressed || menuPressed || active
            ? palette.segmentActive
            : "transparent",
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
        <View
          className={
            badgePlacement === "trailing"
              ? "flex-row items-start gap-2"
              : "flex-row flex-wrap items-center gap-2"
          }
        >
          <Text
            className={
              badgePlacement === "trailing"
                ? "min-w-0 flex-1 text-base"
                : "shrink text-base"
            }
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
      {selected === undefined && showChevron ? (
        <PlatformIcon
          name={{ ios: "chevron.right", android: "chevron-right" }}
          size={18}
          color={palette.textFaint}
        />
      ) : null}
    </Pressable>
  )
  if (!tapGesture || !menuActions?.length || disabled) return row
  return (
    <GestureDetector gesture={tapGesture}>
      <MenuView
        actions={menuActions}
        shouldOpenOnLongPress
        isAnchoredToRight={Platform.OS === "android"}
        onPressAction={({ nativeEvent }) => onMenuAction?.(nativeEvent.event)}
      >
        {row}
      </MenuView>
    </GestureDetector>
  )
}
