import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import HomeScreen from "@/src/features/home/home-screen";

export default function HomeRoute() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen
        options={{
          title: t("home.title"),
          headerLargeTitle: true,
          headerLargeTitleShadowVisible: false,
        }}
      />
      <HomeScreen />
    </>
  );
}
