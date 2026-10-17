import {
  CircularProgressIndicator,
  Host,
  Icon,
  IconButton,
} from "@expo/ui/jetpack-compose"
import { size } from "@expo/ui/jetpack-compose/modifiers"
import {
  type ColorValue,
  type ImageSourcePropType,
  Pressable,
  View,
} from "react-native"

import { useTheme } from "@/src/design/tokens"
import { ANDROID_HEADER_BUTTON_SIZE } from "./android-header-layout"

type AndroidHeaderIconButtonProps = {
  icon: ImageSourcePropType
  accessibilityLabel: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  color?: ColorValue
  backgroundColor?: ColorValue
  rippleColor?: ColorValue
  testID?: string
}

/** Shared Material icon button for Android stack header actions. */
export function AndroidHeaderIconButton({
  icon,
  accessibilityLabel,
  onPress,
  disabled = false,
  loading = false,
  color,
  backgroundColor,
  rippleColor,
  testID,
}: AndroidHeaderIconButtonProps) {
  const { palette, colorScheme } = useTheme()
  const isDark = colorScheme === "dark"
  const enabled = !disabled && !loading
  const contentColor = color ?? palette.text

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !enabled }}
      testID={testID}
      android_ripple={{
        color:
          rippleColor ??
          (isDark ? "rgba(255, 255, 255, 0.14)" : "rgba(0, 0, 0, 0.12)"),
        borderless: backgroundColor === undefined,
        radius: 24,
      }}
      disabled={!enabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor,
        borderRadius: ANDROID_HEADER_BUTTON_SIZE / 2,
        height: ANDROID_HEADER_BUTTON_SIZE,
        justifyContent: "center",
        overflow: backgroundColor === undefined ? "visible" : "hidden",
        width: ANDROID_HEADER_BUTTON_SIZE,
      }}
    >
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
      >
        <Host matchContents style={{ overflow: "visible" }}>
          <IconButton
            colors={{
              contentColor,
              disabledContentColor: palette.textMuted,
            }}
            enabled={enabled}
          >
            {loading ? (
              <CircularProgressIndicator
                color={palette.text}
                modifiers={[size(20, 20)]}
                strokeWidth={2}
              />
            ) : (
              <Icon source={icon} size={24} />
            )}
          </IconButton>
        </Host>
      </View>
    </Pressable>
  )
}
