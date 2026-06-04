import { Stack } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { HeaderCloseButton } from "@/src/components/ui/button";
import { useStackScreenOptions } from "@/src/hooks/use-stack-screen-options";
import { Platform } from "react-native";

export default function SettingsStackLayout() {
  const screenOptions = useStackScreenOptions();
  const { t } = useTranslation();
  const closeButton = useCallback(() => <HeaderCloseButton fallbackRoute="/settings" />, []);

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="library/[libraryId]"
        options={{
          title: t("settings.libraryDetail"),
          presentation: "modal",
          headerLeft: Platform.OS === "ios" ? closeButton : undefined,
        }}
      />
      <Stack.Screen
        name="add-library/index"
        options={{
          title: t("settings.addLibrary"),
          presentation: "modal",
          headerLeft: Platform.OS === "ios" ? closeButton : undefined,
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
  );
}
