import { Stack } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { HeaderCloseButton } from "@/src/components/ui/button";
import { useStackScreenOptions } from "@/src/hooks/use-stack-screen-options";
import { Platform } from "react-native";

export default function OneDriveModalStackLayout() {
  const screenOptions = useStackScreenOptions();
  const { t } = useTranslation();
  const closeButton = useCallback(() => <HeaderCloseButton fallbackRoute="/settings" />, []);

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: t("onedrive.sourcesTitle"),
          headerLeft: Platform.OS === "ios" ? closeButton : undefined,
        }}
      />
      <Stack.Screen name="[dataSourceId]" options={{ title: t("onedrive.sourceDetail") }} />
      <Stack.Screen name="browser" options={{ title: t("onedrive.selectLibrary") }} />
    </Stack>
  );
}