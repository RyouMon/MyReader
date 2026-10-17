import { type ReactNode } from "react"
import type { StyleProp, ViewStyle } from "react-native"

import { useThemePalette } from "@/src/design/tokens"
import { View } from "@/tw"

export function SectionCard({
  children,
  rounded = true,
  style,
}: {
  children: ReactNode
  rounded?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const palette = useThemePalette()

  return (
    <View
      className={rounded ? "overflow-hidden rounded-3xl" : "overflow-hidden"}
      style={[
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
          borderWidth: 1,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}
