import { Stack } from "expo-router"
import { useTranslation } from "react-i18next"

import TtsSettingsScreen from "@/src/features/settings/tts-settings-screen"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"

export default function TtsSettingsRoute() {
  const { t } = useTranslation()
  const { options, toolbar } = useScreenHeader({
    title: t("settings.tts.title"),
  })

  return (
    <>
      <Stack.Screen options={options} />
      {toolbar}
      <TtsSettingsScreen />
    </>
  )
}
