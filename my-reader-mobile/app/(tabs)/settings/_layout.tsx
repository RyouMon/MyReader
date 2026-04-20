import { Stack } from "expo-router";

import { useStackScreenOptions } from "@/src/hooks/use-stack-screen-options";

export default function SettingsStackLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen name="library/[libraryId]" options={{ title: "书库详情" }} />
      <Stack.Screen name="add-library/index" options={{ title: "添加书库" }} />
      <Stack.Screen name="webdav/index" options={{ title: "WebDAV 数据源" }} />
      <Stack.Screen name="webdav/[dataSourceId]" options={{ title: "数据源详情" }} />
      <Stack.Screen name="webdav/add" options={{ title: "添加 WebDAV 数据源" }} />
      <Stack.Screen name="webdav/browser" options={{ title: "选择 WebDAV 书库" }} />
    </Stack>
  );
}
