import { Stack } from "expo-router"
import { useTranslation } from "react-i18next"

import HomeScreen from "@/src/features/home/home-screen"
import { useSyncStatusHeaderAction } from "@/src/features/sync/hooks/use-sync-status-header-action"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"

export default function HomeRoute() {
  const { t } = useTranslation()
  const syncAction = useSyncStatusHeaderAction()
  const { options, toolbar } = useScreenHeader({
    title: t("home.title"),
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
      <HomeScreen />
    </>
  )
}
