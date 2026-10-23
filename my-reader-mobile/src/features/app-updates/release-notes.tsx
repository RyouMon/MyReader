import { useMemo } from "react"
import { useMarkdown } from "react-native-marked"
import { useThemePalette } from "@/src/design/tokens"
import { useCSSVariable, View } from "@/tw"

export function ReleaseNotes({ children }: { children: string }) {
  const palette = useThemePalette()
  const fontSize = useCSSVariable("--text-base") as number
  const lineHeight = fontSize * 1.5
  const styles = useMemo(() => {
    const text = { fontSize, lineHeight }
    const heading = {
      ...text,
      fontWeight: "bold" as const,
      marginTop: 16,
      marginBottom: 8,
      paddingBottom: 0,
      borderBottomWidth: 0,
    }
    return {
      text,
      strong: text,
      em: text,
      strikethrough: text,
      li: text,
      link: { ...text, fontStyle: "normal" as const },
      codespan: text,
      codeText: text,
      h1: heading,
      h2: heading,
      h3: heading,
      h4: heading,
      h5: heading,
      h6: heading,
      paragraph: { paddingVertical: 4 },
    }
  }, [fontSize, lineHeight])
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
  const elements = useMarkdown(children, { theme, styles })
  return <View>{elements}</View>
}
