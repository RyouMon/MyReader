import { Stack } from "expo-router"
import { useTranslation } from "react-i18next"

import HomeScreen from "@/src/features/home/home-screen"
import { useLibraryRootHeader } from "@/src/features/library/hooks/use-library-root-header"

export default function HomeRoute() {
  const { t } = useTranslation()
  const { options, toolbar } = useLibraryRootHeader(t("home.title"))
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
