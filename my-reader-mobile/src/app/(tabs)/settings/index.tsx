import { Stack } from "expo-router"
import { useTranslation } from "react-i18next"

import SettingsScreen from "@/src/features/settings/settings-screen"
import { useSyncStatusHeaderAction } from "@/src/features/sync/hooks/use-sync-status-header-action"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"

export default function SettingsRoute() {
  const { t } = useTranslation()
  const syncAction = useSyncStatusHeaderAction()
  const { options, toolbar } = useScreenHeader({
    title: t("settings.title"),
    headerLargeTitle: true,
    right: [syncAction],
  })

  return (
    <>
      <Stack.Screen
        options={{
          ...options,
          headerLargeTitleShadowVisible: false,
        }}
      />
      {toolbar}
      <SettingsScreen />
    </>
  )
}
