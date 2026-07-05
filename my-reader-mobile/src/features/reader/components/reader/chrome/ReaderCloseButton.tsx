import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"

import { ReaderFloatingIconButton } from "./ReaderFloatingIconButton"
import { READER_FLOATING_BUTTON_RIGHT } from "./readerChromeConstants"

type Props = {
  insetsTop: number
  visible: boolean
  palette: ReaderChromePalette
  onPress: () => void
}

export default function ReaderCloseButton({
  insetsTop,
  visible,
  palette,
  onPress,
}: Props) {
  return (
    <ReaderFloatingIconButton
      accessibilityLabel="Close reader"
      icon="close"
      onPress={onPress}
      palette={palette}
      position={{ top: insetsTop, right: READER_FLOATING_BUTTON_RIGHT }}
      visible={visible}
    />
  )
}
