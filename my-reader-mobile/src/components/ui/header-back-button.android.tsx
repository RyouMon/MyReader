import { useTranslation } from "react-i18next"

import ArrowBackIcon from "@expo/material-symbols/arrow_back.xml"

import { AndroidHeaderIconButton } from "./android-header-icon-button"

type HeaderBackButtonProps = {
  onPress: () => void
}

/** Android stack header back control with Material icon button and native ripple. */
export function HeaderBackButton({ onPress }: HeaderBackButtonProps) {
  const { t } = useTranslation()

  return (
    <AndroidHeaderIconButton
      icon={ArrowBackIcon}
      accessibilityLabel={t("reader.back")}
      testID="header-back-button"
      onPress={onPress}
    />
  )
}
