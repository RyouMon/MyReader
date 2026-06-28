import { type ReactNode } from "react"

import { useThemePalette } from "@/src/design/tokens"
import { View } from "@/tw"

export function HeroCard({ children }: { children: ReactNode }) {
  const palette = useThemePalette()

  return (
    <View
      className="overflow-hidden rounded-3xl shadow-lg"
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.border,
        borderWidth: 1,
      }}
    >
      {children}
    </View>
  )
}
