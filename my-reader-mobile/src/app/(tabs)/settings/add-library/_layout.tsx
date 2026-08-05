import { Stack } from "expo-router"
import { useTranslation } from "react-i18next"

import { AddLibraryFlowProvider } from "@/src/features/settings/add-library-flow-context"
import { useStackScreenOptions } from "@/src/navigation/hooks/use-stack-screen-options"

export const unstable_settings = {
  anchor: "index",
}

export default function AddLibraryStackLayout() {
  const screenOptions = useStackScreenOptions()
  const { t } = useTranslation()

  return (
    <AddLibraryFlowProvider>
      <Stack screenOptions={screenOptions}>
        <Stack.Screen
          name="index"
          options={{ title: t("settings.addLibrary") }}
        />
        <Stack.Screen name="location" />
        <Stack.Screen name="browser" />
        <Stack.Screen name="create" />
        <Stack.Screen name="webdav" />
      </Stack>
    </AddLibraryFlowProvider>
  )
}
