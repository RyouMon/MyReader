import { Stack } from "expo-router";

import { useStackScreenOptions } from "@/src/hooks/use-stack-screen-options";

export default function SettingsStackLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen name="add-library/index" options={{ title: "添加书库" }} />
      <Stack.Screen name="add-library/webdav" options={{ title: "添加 WebDAV 数据源" }} />
      <Stack.Screen name="add-library/webdav-browser" options={{ title: "选择 WebDAV 书库" }} />
      <Stack.Screen name="webdav-sources" options={{ title: "WebDAV 数据源" }} />
    </Stack>
  );
}
