import { Host, Icon as NativeIcon } from "@expo/ui"
import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import { useHeaderHeight } from "expo-router/react-navigation"
import { SymbolView } from "expo-symbols"
import { type ReactNode } from "react"
import {
  type ImageSourcePropType,
  Platform,
  useWindowDimensions,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useThemePalette } from "@/src/design/tokens"
import { Text, View } from "@/tw"

export type EmptyStateIcon = {
  ios: string
  android: string | ImageSourcePropType
}

export type EmptyStateLayout = "screen" | "container"

export type EmptyStateColors = {
  icon: string
  title: string
  detail: string
}

const DEFAULT_ICON: EmptyStateIcon = {
  ios: "book.closed.fill",
  android: "menu-book",
}

const TAB_BAR_ESTIMATE = Platform.OS === "ios" ? 49 : 56
const SCREEN_PAD = 56 // pt-4 (16) + pb-10 (40)

export function EmptyState({
  title,
  detail,
  action,
  icon = DEFAULT_ICON,
  layout = "screen",
  colors,
  titleClassName = "text-lg",
}: {
  title: string
  detail: string
  action?: ReactNode
  icon?: EmptyStateIcon
  layout?: EmptyStateLayout
  colors?: EmptyStateColors
  titleClassName?: string
}) {
  const palette = useThemePalette()
  const { height: windowHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()

  const availableHeight =
    windowHeight - insets.top - insets.bottom - headerHeight - TAB_BAR_ESTIMATE
  const minHeight =
    layout === "container" ? 0 : Math.max(availableHeight - SCREEN_PAD, 300)

  return (
    <View
      className="flex-1 items-center justify-center px-6"
      style={{ minHeight, gap: 24 }}
    >
      {Platform.OS === "ios" ? (
        <SymbolView
          name={icon.ios as never}
          size={80}
          tintColor={colors?.icon ?? palette.border}
        />
      ) : typeof icon.android === "string" ? (
        <MaterialIcons
          name={icon.android as never}
          size={80}
          color={colors?.icon ?? palette.border}
        />
      ) : (
        <Host matchContents pointerEvents="none">
          <NativeIcon
            name={icon.android}
            size={80}
            color={colors?.icon ?? palette.border}
          />
        </Host>
      )}

      <View className="items-center" style={{ gap: 8 }}>
        <Text
          className={`text-center ${titleClassName}`}
          style={{ color: colors?.title ?? palette.text, fontWeight: "600" }}
        >
          {title}
        </Text>
        <Text
          className="text-center text-base"
          style={{ color: colors?.detail ?? palette.textMuted, maxWidth: 280 }}
        >
          {detail}
        </Text>
      </View>

      {action ? (
        <View
          className="w-full flex-row justify-center"
          style={{ maxWidth: 280 }}
        >
          {action}
        </View>
      ) : null}
    </View>
  )
}
