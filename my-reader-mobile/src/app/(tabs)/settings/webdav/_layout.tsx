import { Stack } from "expo-router";
import { useCallback } from "react";

import { HeaderCloseButton } from "@/src/components/ui/button";
import { useStackScreenOptions } from "@/src/hooks/use-stack-screen-options";

export default function WebDavModalStackLayout() {
  const screenOptions = useStackScreenOptions();
  const closeButton = useCallback(() => <HeaderCloseButton fallbackRoute="/settings" />, []);

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: "WebDAV 数据源",
          headerLeft: closeButton,
        }}
      />
      <Stack.Screen name="[dataSourceId]" options={{ title: "数据源详情" }} />
      <Stack.Screen name="add" options={{ title: "添加 WebDAV 数据源" }} />
      <Stack.Screen name="browser" options={{ title: "选择 WebDAV 书库" }} />
    </Stack>
  );
}
