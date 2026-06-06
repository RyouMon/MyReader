import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import { useStackScreenOptions } from "@/src/navigation/hooks/use-stack-screen-options";

export const unstable_settings = {
  anchor: "index",
};

export default function OneDriveModalStackLayout() {
  const screenOptions = useStackScreenOptions();
  const { t } = useTranslation();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: t("onedrive.sourcesTitle") }} />
      <Stack.Screen name="[dataSourceId]" options={{ title: t("onedrive.sourceDetail") }} />
      <Stack.Screen name="browser" options={{ title: t("onedrive.selectLibrary") }} />
    </Stack>
  );
}
