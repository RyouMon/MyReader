import { Stack } from "expo-router"
import { useTranslation } from "react-i18next"
import LlmSettingsScreen from "@/src/features/settings/llm-settings-screen"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"

export default function LlmSettingsRoute() {
  const { t } = useTranslation()
  const { options, toolbar } = useScreenHeader({ title: t("llm.title") })
  return (
    <>
      <Stack.Screen options={options} />
      {toolbar}
      <LlmSettingsScreen />
    </>
  )
}
