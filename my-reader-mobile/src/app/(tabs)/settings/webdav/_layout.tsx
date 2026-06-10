import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import { useStackScreenOptions } from "@/src/navigation/hooks/use-stack-screen-options";

export const unstable_settings = {
  anchor: "index",
};

export default function WebDavModalStackLayout() {
  const screenOptions = useStackScreenOptions();
  const { t } = useTranslation();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: t("webdav.sourcesTitle") }} />
      <Stack.Screen name="[dataSourceId]" options={{ title: t("webdav.sourceDetail") }} />
      <Stack.Screen name="add" options={{ title: t("webdav.addSource") }} />
      <Stack.Screen name="browser" options={{ title: t("webdav.selectLibrary") }} />
    </Stack>
  );
}
