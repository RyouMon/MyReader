import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import SettingsScreen from "@/src/features/settings/settings-screen";

export default function SettingsRoute() {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen
        options={{
          title: t("settings.title"),
          headerLargeTitle: true,
          headerLargeTitleShadowVisible: false,
        }}
      />
      <SettingsScreen />
    </>
  );
}
