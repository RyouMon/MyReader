import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import { HeaderCloseButton } from "@/src/components/ui/button";
import { useStackScreenOptions } from "@/src/hooks/use-stack-screen-options";
import { Platform } from "react-native";

const IOS_MODAL_CLOSE_OPTIONS =
  Platform.OS === "ios"
    ? { headerLeft: () => <HeaderCloseButton fallbackRoute="/settings" />, headerBackVisible: false as const }
    : {};

export default function OneDriveModalStackLayout() {
  const screenOptions = useStackScreenOptions();
  const { t } = useTranslation();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: t("onedrive.sourcesTitle"),
          ...IOS_MODAL_CLOSE_OPTIONS,
        }}
      />
      <Stack.Screen name="[dataSourceId]" options={{ title: t("onedrive.sourceDetail") }} />
      <Stack.Screen name="browser" options={{ title: t("onedrive.selectLibrary") }} />
    </Stack>
  );
}
