import type { ReactNode } from "react"
import type { ColorValue } from "react-native"
import { Text, View } from "@/tw"

/** Material icon buttons reserve their full touch target in the header layout. */
export const ANDROID_HEADER_BUTTON_SIZE = 48
/** Matches the horizontal content inset supplied by Android native-stack headers. */
export const ANDROID_HEADER_EDGE_INSET = 16
/** Match native-stack's Android system title in native and inline sheet headers. */
export const ANDROID_HEADER_TITLE_STYLE = {
  fontFamily: "sans-serif-medium",
  fontSize: 20,
  fontWeight: "normal",
} as const

/** Android form sheets cannot show a native-stack header. */
export function AndroidHeaderTitle({
  children,
  color,
}: {
  children: string
  color: ColorValue
}) {
  return (
    <Text
      accessibilityRole="header"
      className="flex-1"
      maxFontSizeMultiplier={0}
      numberOfLines={1}
      style={[ANDROID_HEADER_TITLE_STYLE, { color }]}
    >
      {children}
    </Text>
  )
}

type AndroidHeaderActionsProps = {
  children: ReactNode
}

/** One row per native-stack header side; each child keeps its own measured width. */
export function AndroidHeaderActions({ children }: AndroidHeaderActionsProps) {
  return <View className="flex-row items-center">{children}</View>
}

/** Let native-stack apply its edge spacing around the complete action group. */
export function wrapAndroidHeaderAction(
  render: () => ReactNode,
): () => ReactNode {
  return function AndroidHeaderAction() {
    return <AndroidHeaderActions>{render()}</AndroidHeaderActions>
  }
}
