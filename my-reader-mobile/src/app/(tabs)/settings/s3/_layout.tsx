import { Stack } from "expo-router"
import { useTranslation } from "react-i18next"
import { useStackScreenOptions } from "@/src/navigation/hooks/use-stack-screen-options"
export default function S3StackLayout() {
  const screenOptions = useStackScreenOptions()
  const { t } = useTranslation()
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen
        name="index"
        options={{ title: t("cloud.sources.title", { provider: "S3" }) }}
      />
      <Stack.Screen
        name="[dataSourceId]"
        options={{ title: t("cloud.detail.title") }}
      />
      <Stack.Screen
        name="add"
        options={{ title: t("cloud.form.addTitle", { provider: "S3" }) }}
      />
      <Stack.Screen
        name="browser"
        options={{ title: t("cloud.browser.title", { provider: "S3" }) }}
      />
    </Stack>
  )
}
