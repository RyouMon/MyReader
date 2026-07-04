import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import { Text, View } from "@/tw"
import {
  READER_BOTTOM_ACTION_OFFSET,
  READER_BOTTOM_ACTION_SIZE,
} from "./readerChromeConstants"

export type ReaderPositionLabelProps = {
  visible: boolean
  currentPage?: number | null
  totalPages?: number | null
  label?: string
  palette: ReaderChromePalette
}

export function ReaderPositionLabel({
  visible,
  currentPage,
  totalPages,
  label,
  palette,
}: ReaderPositionLabelProps) {
  if (!visible || currentPage == null || totalPages == null) return null

  return (
    <View
      className="absolute left-0 right-0 z-10 items-center justify-center"
      style={{
        bottom: READER_BOTTOM_ACTION_OFFSET,
        height: READER_BOTTOM_ACTION_SIZE,
      }}
      pointerEvents="none"
    >
      <Text
        className="text-base font-medium"
        style={{ color: palette.textMuted }}
        numberOfLines={1}
      >
        {label ? `${label} ` : ""}
        {currentPage + 1} / {totalPages}
      </Text>
    </View>
  )
}
