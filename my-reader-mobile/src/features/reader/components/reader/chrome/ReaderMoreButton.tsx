import { useTranslation } from "react-i18next"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"

import { ReaderFloatingIconButton } from "./ReaderFloatingIconButton"
import { READER_FLOATING_BUTTON_RIGHT } from "./readerChromeConstants"

type Props = {
  bottomInset: number
  visible: boolean
  palette: ReaderChromePalette
  onPress: () => void
}

export default function ReaderMoreButton({
  bottomInset,
  visible,
  palette,
  onPress,
}: Props) {
  const { t } = useTranslation()

  return (
    <ReaderFloatingIconButton
      accessibilityLabel={t("reader.chrome.moreActions")}
      icon="more"
      onPress={onPress}
      palette={palette}
      position={{
        bottom: bottomInset,
        right: READER_FLOATING_BUTTON_RIGHT,
      }}
      visible={visible}
    />
  )
}
