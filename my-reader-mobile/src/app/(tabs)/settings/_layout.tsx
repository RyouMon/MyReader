import { Stack } from "expo-router"
import { useTranslation } from "react-i18next"

import { useStackScreenOptions } from "@/src/navigation/hooks/use-stack-screen-options"

export default function SettingsStackLayout() {
  const screenOptions = useStackScreenOptions()
  const { t } = useTranslation()

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="library/[libraryId]"
        options={{
          title: t("settings.libraryDetail"),
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="webdav"
        options={{
          presentation: "modal",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="onedrive"
        options={{
          presentation: "modal",
          headerShown: false,
        }}
      />
    </Stack>
  )
}
