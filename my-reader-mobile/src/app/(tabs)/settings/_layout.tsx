import { Stack } from "expo-router";
import { useCallback } from "react";

import { HeaderCloseButton } from "@/src/components/ui/button";
import { useStackScreenOptions } from "@/src/hooks/use-stack-screen-options";

export default function SettingsStackLayout() {
  const screenOptions = useStackScreenOptions();
  const closeButton = useCallback(() => <HeaderCloseButton fallbackRoute="/settings" />, []);

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="library/[libraryId]"
        options={{
          title: "书库详情",
          presentation: "modal",
          headerLeft: closeButton,
        }}
      />
      <Stack.Screen
        name="add-library/index"
        options={{
          title: "添加书库",
          presentation: "modal",
          headerLeft: closeButton,
        }}
      />
      <Stack.Screen
        name="webdav"
        options={{
          presentation: "modal",
          headerShown: false,
        }}
      />
    </Stack>
  );
}
