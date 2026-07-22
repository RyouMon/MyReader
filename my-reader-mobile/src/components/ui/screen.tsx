import { type ReactNode } from "react"

import { useThemePalette } from "@/src/design/tokens"
import { ScrollView, View } from "@/tw"

export function Screen({
  children,
  contentContainerClassName,
  scrollEnabled = true,
}: {
  children: ReactNode
  /** Appended to default horizontal/top padding and bottom inset for scroll content. */
  contentContainerClassName?: string
  scrollEnabled?: boolean
}) {
  const palette = useThemePalette()
  const bottomPad = ["px-4 pt-4 pb-10", contentContainerClassName]
    .filter(Boolean)
    .join(" ")

  return (
    <ScrollView
      className="flex-1"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName={bottomPad}
      scrollEnabled={scrollEnabled}
      style={{ backgroundColor: palette.background }}
    >
      <View className="gap-5">{children}</View>
    </ScrollView>
  )
}
