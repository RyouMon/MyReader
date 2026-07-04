import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import { useTranslation } from "react-i18next"

import { ReaderFloatingIconButton } from "./ReaderFloatingIconButton"
import {
  READER_FLOATING_BUTTON_BOTTOM,
  READER_FLOATING_BUTTON_RIGHT,
} from "./readerChromeConstants"

type Props = {
  visible: boolean
  palette: ReaderChromePalette
  onPress: () => void
}

export default function ReaderMoreButton({ visible, palette, onPress }: Props) {
  const { t } = useTranslation()

  return (
    <ReaderFloatingIconButton
      accessibilityLabel={t("reader.chrome.moreActions")}
      icon="more"
      onPress={onPress}
      palette={palette}
      position={{
        bottom: READER_FLOATING_BUTTON_BOTTOM,
        right: READER_FLOATING_BUTTON_RIGHT,
      }}
      visible={visible}
    />
  )
}
