import { useMemo } from "react"
import { useMarkdown } from "react-native-marked"
import { useThemePalette } from "@/src/design/tokens"
import { View } from "@/tw"

export function ReleaseNotes({ children }: { children: string }) {
  const palette = useThemePalette()
  const theme = useMemo(
    () => ({
      colors: {
        text: palette.text,
        link: palette.primary,
        border: palette.border,
        code: palette.surface,
      },
    }),
    [palette],
  )
  const elements = useMarkdown(children, { theme })
  return <View>{elements}</View>
}
