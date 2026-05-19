import { Stack } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { HeaderCloseButton } from "@/src/components/ui/button";
import { useStackScreenOptions } from "@/src/hooks/use-stack-screen-options";

export default function WebDavModalStackLayout() {
  const screenOptions = useStackScreenOptions();
  const { t } = useTranslation();
  const closeButton = useCallback(() => <HeaderCloseButton fallbackRoute="/settings" />, []);

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: t("webdav.sourcesTitle"),
          headerLeft: closeButton,
        }}
      />
      <Stack.Screen name="[dataSourceId]" options={{ title: t("webdav.sourceDetail") }} />
      <Stack.Screen name="add" options={{ title: t("webdav.addSource") }} />
      <Stack.Screen name="browser" options={{ title: t("webdav.selectLibrary") }} />
    </Stack>
  );
}
