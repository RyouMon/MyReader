import { Stack } from "expo-router";

import { useStackScreenOptions } from "@/src/hooks/use-stack-screen-options";

export default function WebDavRootStackLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={{ ...screenOptions, headerShown: true }}>
      <Stack.Screen name="index" options={{ title: "WebDAV 数据源" }} />
      <Stack.Screen name="[dataSourceId]" options={{ title: "数据源详情" }} />
      <Stack.Screen name="add" options={{ title: "添加 WebDAV 数据源" }} />
      <Stack.Screen name="browser" options={{ title: "选择 WebDAV 书库" }} />
    </Stack>
  );
}
