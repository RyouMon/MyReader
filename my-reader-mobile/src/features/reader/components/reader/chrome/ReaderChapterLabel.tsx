import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import { Text, View } from "@/tw"

export type ReaderChapterLabelProps = {
  title?: string | null
  palette: ReaderChromePalette
}

export function ReaderChapterLabel({
  title,
  palette,
}: ReaderChapterLabelProps) {
  return (
    <View className="min-w-0 flex-1 justify-center" pointerEvents="none">
      <Text
        className="text-center text-base font-medium"
        style={{ color: palette.textMuted }}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {title ?? ""}
      </Text>
    </View>
  )
}
